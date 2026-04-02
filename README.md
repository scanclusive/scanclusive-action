# ScanClusive Accessibility Scan - GitHub Action

[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-ScanClusive%20Accessibility%20Scan-blue?logo=github)](https://github.com/marketplace/actions/scanclusive-accessibility-scan)

Automatically run WCAG 2.1/2.2 accessibility scans in your CI/CD pipeline via [ScanClusive](https://scanclusive.com).

## Quick Start

```yaml
name: Accessibility Scan
on: [push, pull_request]

permissions:
  pull-requests: write  # required for PR comments

jobs:
  accessibility:
    runs-on: ubuntu-latest
    steps:
      - uses: scanclusive/scanclusive-action@v1
        id: scan
        with:
          api-key: ${{ secrets.SCANCLUSIVE_API_KEY }}
          project-id: ${{ secrets.SCANCLUSIVE_PROJECT_ID }}
          threshold: 90
          fail-on-violations: true

      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: scanclusive-results
          path: scanclusive-results.json
```

## PR Comments

Post the scan result as a comment directly on pull requests:

```yaml
      - name: Comment on PR
        if: github.event_name == 'pull_request' && always()
        uses: actions/github-script@v7
        with:
          script: |
            const score      = '${{ steps.scan.outputs.compliance-score }}';
            const violations = '${{ steps.scan.outputs.total-violations }}';
            const critical   = '${{ steps.scan.outputs.critical-count }}';
            const reportUrl  = '${{ steps.scan.outputs.report-url }}';
            const status     = '${{ steps.scan.outputs.status }}';
            const emoji      = parseInt(score) >= 90 ? '✅' : parseInt(score) >= 70 ? '⚠️' : '❌';

            await github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: [
                `## ${emoji} ScanClusive Accessibility Report`,
                ``,
                `| Metric | Value |`,
                `|--------|-------|`,
                `| Compliance Score | **${score}%** |`,
                `| Total Violations | ${violations} |`,
                `| Critical | ${critical} |`,
                `| Status | ${status} |`,
                ``,
                `[View Full Report](${reportUrl})`,
              ].join('\n')
            });
```

> Requires `permissions: pull-requests: write` at the workflow level (see Quick Start above).

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `api-key` | Yes | - | ScanClusive API key (from Settings > API Keys) |
| `project-id` | Yes | - | ScanClusive project ID (from Settings > API Keys) |
| `api-url` | No | `https://scanclusive.com` | API base URL |
| `threshold` | No | `0` | Minimum compliance score (0-100) |
| `fail-on-violations` | No | `false` | Fail if critical violations found |
| `wait-timeout` | No | `600` | Max seconds to wait for scan |

## Outputs

| Output | Description |
|--------|-------------|
| `scan-id` | The ID of the created scan |
| `compliance-score` | Compliance score (0-100) |
| `total-violations` | Total number of violations |
| `critical-count` | Number of critical violations |
| `status` | Final scan status |
| `report-url` | URL to the full scan report |

## Features

- Automatic retry on network errors and 5xx responses (up to 3 retries)
- Exponential polling backoff (5s to 15s)
- Rich GitHub Job Summary with compliance table
- Configurable compliance thresholds
- JSON artifact output (`scanclusive-results.json`) for trend tracking
- PR comment support via `actions/github-script`

## Example Repository

See [scanclusive/example-github-action](https://github.com/scanclusive/example-github-action) for a full working example with PR comments, artifact uploads, and scheduled scans.

## Badge

Add a live compliance badge to your README:

```markdown
![Accessibility](https://scanclusive.com/api/badges/YOUR_PROJECT_ID)
```

## License

MIT
