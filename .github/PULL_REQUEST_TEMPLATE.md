## Description

<!-- Briefly describe what this PR does and why -->

## Type of Change

<!-- Check all that apply -->
- [ ] Bug fix (scanner, data fetcher, scoring, indicators)
- [ ] New research factor or data source
- [ ] Scoring / conviction model improvement
- [ ] Dashboard / UI feature (React frontend)
- [ ] Vercel API improvement (`/api/live_data` or `/api/chart`)
- [ ] GitHub Actions / CI/CD
- [ ] Documentation
- [ ] Test coverage

## Related Issues

<!-- Link any related issues: Fixes #123, Closes #456 -->

## Component(s) Affected

<!-- Check all that apply -->
- [ ] `scanner.py` (orchestrator)
- [ ] `data_fetcher.py` (OHLCV, fundamentals, news)
- [ ] `indicators.py` (technical indicators)
- [ ] `scoring.py` (composite scores, conviction)
- [ ] `research_factors.py` (academic factors)
- [ ] `nse_fetcher.py` / `bse_fetcher.py` (data sources)
- [ ] `data_pipeline.py` (ML storage)
- [ ] `recommendation.py` (tech/fund scores)
- [ ] React frontend (`frontend/src/`)
- [ ] Vercel serverless functions (`frontend/api/`)
- [ ] GitHub Actions workflow

## How Has This Been Tested?

<!-- Describe the tests you ran -->
- [ ] `python -m unittest discover tests/ -v`
- [ ] `cd frontend && npm run lint`
- [ ] Manual testing on dashboard
- [ ] Verified NSE data correctness

## Checklist

- [ ] My code follows PEP 8 (Python) or the project's existing TypeScript style
- [ ] I have added docstrings to new public functions
- [ ] For new research factors: source paper is cited in the docstring
- [ ] Financial figures are in **INR** (not USD)
- [ ] I have added tests that prove my fix is effective or my feature works
- [ ] My changes generate no new warnings
- [ ] I have performed a self-review of my code
