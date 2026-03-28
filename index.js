const https = require("https");
const http = require("http");
const { appendFileSync } = require("fs");

const API_KEY = process.env.SCANCLUSIVE_API_KEY;
const PROJECT_ID = process.env.SCANCLUSIVE_PROJECT_ID;
const API_URL = (process.env.SCANCLUSIVE_API_URL || "https://scanclusive.com").replace(/\/$/, "");
const THRESHOLD = parseInt(process.env.SCANCLUSIVE_THRESHOLD || "0", 10);
const FAIL_ON_VIOLATIONS = process.env.SCANCLUSIVE_FAIL_ON_VIOLATIONS === "true";
const WAIT_TIMEOUT = parseInt(process.env.SCANCLUSIVE_WAIT_TIMEOUT || "600", 10);
const GITHUB_OUTPUT = process.env.GITHUB_OUTPUT;
const GITHUB_STEP_SUMMARY = process.env.GITHUB_STEP_SUMMARY;

const MAX_RETRIES = 3;
const RETRY_DELAY = 3000;

function request(method, path, body, retries = MAX_RETRIES) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_URL);
    const mod = url.protocol === "https:" ? https : http;
    const opts = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        "x-api-key": API_KEY,
        "Content-Type": "application/json",
        "User-Agent": "ScanClusive-GitHub-Action/1.0",
      },
    };

    const req = mod.request(opts, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", async () => {
        const statusCode = res.statusCode;
        // Retry on 5xx errors
        if (statusCode >= 500 && retries > 0) {
          console.log(`   ⚠️ Server error (${statusCode}), retrying in ${RETRY_DELAY / 1000}s... (${retries} retries left)`);
          await sleep(RETRY_DELAY);
          try {
            const result = await request(method, path, body, retries - 1);
            resolve(result);
          } catch (e) {
            reject(e);
          }
          return;
        }
        try {
          resolve({ status: statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: statusCode, data });
        }
      });
    });

    req.on("error", async (err) => {
      if (retries > 0) {
        console.log(`   ⚠️ Network error (${err.message}), retrying in ${RETRY_DELAY / 1000}s... (${retries} retries left)`);
        await sleep(RETRY_DELAY);
        try {
          const result = await request(method, path, body, retries - 1);
          resolve(result);
        } catch (e) {
          reject(e);
        }
        return;
      }
      reject(err);
    });

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function setOutput(name, value) {
  if (GITHUB_OUTPUT) {
    appendFileSync(GITHUB_OUTPUT, `${name}=${value}\n`);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  console.log(`🔍 ScanClusive — Starting accessibility scan`);
  console.log(`   Project: ${PROJECT_ID}`);
  console.log(`   API URL: ${API_URL}`);
  if (THRESHOLD > 0) console.log(`   Threshold: ${THRESHOLD}%`);

  // 1. Trigger scan
  const triggerRes = await request("POST", "/api/webhooks/ci", { projectId: PROJECT_ID });

  if (triggerRes.status !== 201) {
    console.error(`❌ Failed to trigger scan: ${JSON.stringify(triggerRes.data)}`);
    process.exit(1);
  }

  const scanId = triggerRes.data.scanId;
  console.log(`✅ Scan queued: ${scanId}`);
  setOutput("scan-id", scanId);

  // 2. Poll for completion
  const deadline = Date.now() + WAIT_TIMEOUT * 1000;
  let scanData = null;
  let pollInterval = 5000;

  while (Date.now() < deadline) {
    await sleep(pollInterval);

    const pollRes = await request("GET", `/api/webhooks/ci?scanId=${scanId}`);

    if (pollRes.status === 200 && pollRes.data) {
      const status = pollRes.data.status;
      console.log(`   Status: ${status}`);

      if (status === "COMPLETED" || status === "COMPLETED_WITH_ERRORS" || status === "FAILED") {
        scanData = pollRes.data;
        break;
      }
    }

    // Increase interval gradually
    if (pollInterval < 15000) pollInterval += 2000;
  }

  if (!scanData) {
    console.error(`⏱️ Scan timed out after ${WAIT_TIMEOUT}s`);
    setOutput("status", "TIMEOUT");
    process.exit(1);
  }

  // 3. Extract results
  const score = scanData.complianceScore ?? 0;
  const violations = scanData.totalViolations ?? 0;
  const critical = scanData.criticalCount ?? 0;
  const serious = scanData.seriousCount ?? 0;
  const moderate = scanData.moderateCount ?? 0;
  const minor = scanData.minorCount ?? 0;
  const pages = scanData.totalPages ?? 0;
  const status = scanData.status;
  const reportUrl = `${API_URL}/dashboard/scans/${scanId}`;

  setOutput("compliance-score", score);
  setOutput("total-violations", violations);
  setOutput("critical-count", critical);
  setOutput("status", status);
  setOutput("report-url", reportUrl);

  // 4. Print results
  console.log("");
  console.log(`📊 Scan Results`);
  console.log(`   Status:           ${status}`);
  console.log(`   Compliance Score: ${score}%`);
  console.log(`   Pages Scanned:    ${pages}`);
  console.log(`   Total Violations: ${violations}`);
  console.log(`     Critical: ${critical}`);
  console.log(`     Serious:  ${serious}`);
  console.log(`     Moderate: ${moderate}`);
  console.log(`     Minor:    ${minor}`);
  console.log(`   Report: ${reportUrl}`);

  // 5. Save results as JSON artifact
  const { writeFileSync } = require("fs");
  const artifactData = {
    scanId,
    timestamp: new Date().toISOString(),
    status,
    complianceScore: score,
    totalViolations: violations,
    criticalCount: critical,
    seriousCount: serious,
    moderateCount: moderate,
    minorCount: minor,
    totalPages: pages,
    reportUrl,
    threshold: THRESHOLD,
    passed: true, // will be set below
  };

  // 6. GitHub Job Summary
  if (GITHUB_STEP_SUMMARY) {
    const emoji = score >= 90 ? "✅" : score >= 70 ? "⚠️" : "❌";
    const summary = [
      `## ${emoji} ScanClusive Accessibility Report`,
      "",
      `| Metric | Value |`,
      `|--------|-------|`,
      `| Compliance Score | **${score}%** |`,
      `| Pages Scanned | ${pages} |`,
      `| Total Violations | ${violations} |`,
      `| Critical | ${critical} |`,
      `| Serious | ${serious} |`,
      `| Moderate | ${moderate} |`,
      `| Minor | ${minor} |`,
      "",
      `[View Full Report](${reportUrl})`,
    ].join("\n");

    appendFileSync(GITHUB_STEP_SUMMARY, summary + "\n");
  }

  // 7. Check thresholds
  let failed = false;

  if (status === "FAILED") {
    console.error(`\n❌ Scan failed`);
    failed = true;
  }

  if (THRESHOLD > 0 && score < THRESHOLD) {
    console.error(`\n❌ Compliance score ${score}% is below threshold ${THRESHOLD}%`);
    failed = true;
  }

  if (FAIL_ON_VIOLATIONS && critical > 0) {
    console.error(`\n❌ ${critical} critical violation(s) found`);
    failed = true;
  }

  // Save artifact
  artifactData.passed = !failed;
  writeFileSync("scanclusive-results.json", JSON.stringify(artifactData, null, 2));
  console.log(`\n📁 Results saved to scanclusive-results.json`);

  if (failed) {
    process.exit(1);
  }

  console.log(`\n✅ Scan passed all checks`);
}

run().catch((err) => {
  console.error(`❌ Unexpected error: ${err.message}`);
  process.exit(1);
});
