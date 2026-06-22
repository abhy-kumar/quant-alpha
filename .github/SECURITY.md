# Security Policy

## Supported Versions

This project is actively maintained. Security fixes are applied to the latest version on `main`.

| Version | Supported |
|---------|-----------|
| latest (main) | Yes |
| older branches | No |

## Scope

Alpha is an open-source research dashboard with no user accounts, no authentication, and no storage of personal data. The primary security concerns are:

- **Data integrity**: Ensuring `market_data.json` committed by GitHub Actions is not tampered with
- **Dependency vulnerabilities**: Python packages (`yfinance`, `requests`, `beautifulsoup4`) and Node.js packages
- **GitHub Actions supply chain**: Pinned action versions and least-privilege permissions
- **Vercel serverless functions**: `api/chart.ts` and `api/live_data.ts` which call external APIs

## Reporting a Vulnerability

If you discover a security vulnerability, please do **not** open a public GitHub issue.

Instead, report it via one of these channels:

1. **GitHub Private Vulnerability Reporting** (preferred): Use the [Security tab -> Report a vulnerability](https://github.com/abhy-kumar/quant-alpha/security/advisories/new) feature
2. **Email**: Contact the Alpha Research and Investment Club, FMS Delhi

Please include:
- A description of the vulnerability and its potential impact
- Steps to reproduce
- Affected component (Python backend, React frontend, GitHub Actions workflow, Vercel functions)

## Response Timeline

- **Acknowledgement**: Within 48 hours
- **Assessment**: Within 7 days
- **Fix**: Within 30 days for critical issues; best-effort for low severity

## Out of Scope

- Vulnerabilities in third-party data sources (Yahoo Finance, screener.in, NSE APIs) - report these to the respective providers
- Issues requiring physical access or social engineering
- Rate limiting or DDoS (the Vercel serverless functions have no authentication by design)
