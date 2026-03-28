# ScanClusive Accessibility Scan — GitHub Action

Automatically run WCAG 2.1/2.2 accessibility scans in your CI/CD pipeline via [ScanClusive](https://scanclusive.com).

## Quick Start

```yaml
name: Accessibility Scan
on: [push, pull_request]

jobs:
  accessibility:
    runs-on: ubuntu-latest
    steps:
      - uses: scanclusive/scanclusive-action@v1
        id: scan
        with:
          api-key: ${{ secrets.SCANCLUSIVE_API_KEY }}
          project-id: "proj_xxx"
          threshold: 90
          fail-on-violations: true

      # Optional: Upload scan results as artifact for trend tracking
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: scanclusive-results
          path: scanclusive-results.json

      - name: Use scan outputs
        if: always()
        run: |
          echo "Score: ${{ steps.scan.outputs.compliance-score }}%"
          echo "Report: ${{ steps.scan.outputs.report-url }}"
```

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `api-key` | Yes | — | ScanClusive API key (from Settings > API Keys) |
| `project-id` | Yes | — | ScanClusive project ID |
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

## Artifacts

The action automatically saves results to `scanclusive-results.json` in the workspace. Use `actions/upload-artifact` to persist this file for trend tracking across builds.

## Features

- Automatic retry on network errors and 5xx responses (up to 3 retries)
- Exponential polling backoff (5s to 15s)
- Rich GitHub Job Summary with compliance table
- Configurable compliance thresholds
- JSON artifact output for trend tracking

## Badge

Add a compliance badge to your README:

```markdown
![Accessibility](https://scanclusive.com/api/badges/YOUR_PROJECT_ID)
```

## License

MIT
