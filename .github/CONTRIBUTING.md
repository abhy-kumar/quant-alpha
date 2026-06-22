# Contributing to Alpha Research Dashboard

Thank you for your interest in contributing! Alpha is a quantitative stock research platform built for the Alpha Research and Investment Club, FMS Delhi. Contributions from the quant finance and open-source community are welcome.

## Ways to Contribute

- **Bug reports** - Open an issue using the bug report template
- **Feature requests** - Open an issue using the feature request template
- **Research factors** - Propose or implement new academic factors in `research_factors.py`
- **Data sources** - Add or improve fallback data sources in `data_fetcher.py`
- **Frontend improvements** - UI/UX enhancements to the React dashboard
- **Documentation** - Improve README, docstrings, or inline comments
- **Tests** - Add unit or integration tests in the `tests/` directory

## Getting Started

### 1. Fork and Clone

```bash
git clone https://github.com/abhy-kumar/quant-alpha.git
cd quant-alpha
```

### 2. Set Up Python Environment

```bash
python -m venv .venv
# Windows
.\.venv\Scripts\activate
# Unix/macOS
source .venv/bin/activate

pip install -r requirements.txt
```

### 3. Set Up the Frontend

```bash
cd frontend
npm install
npm run dev
```

### 4. Run Tests

```bash
# Backend
python -m unittest discover tests/ -v

# Frontend lint
cd frontend && npm run lint
```

## Code Style

- **Python**: Follow PEP 8. Use descriptive variable names. Add docstrings to all public functions.
- **TypeScript/React**: Follow the existing component structure. Use functional components and hooks.
- **Commits**: Use conventional commits format - `feat:`, `fix:`, `docs:`, `chore:`, `test:`

## Adding a New Research Factor

1. Implement the factor function in `research_factors.py` with a docstring citing the source paper
2. Add the factor to the `compute_research_factors()` composite function with a calibrated weight
3. Expose the new field in `data_pipeline.py` `factor_history` schema
4. Add it to the `types.ts` TypeScript interface
5. Display it in `ChartingTab.tsx` and optionally `ScreenerTab.tsx`
6. Write a unit test in `tests/test_research_factors.py`

## Pull Request Process

1. Create a feature branch: `git checkout -b feat/your-feature-name`
2. Make your changes with tests
3. Run the full test suite and ensure it passes
4. Open a PR against `main` with a clear description
5. Reference any related issues with `Closes #<issue-number>`

## Scope and Philosophy

Alpha is specifically built for the **Indian equity market (NSE)**. Please ensure:
- All financial figures use **INR** (not USD)
- Data sources are India-appropriate (NSE Bhav Copy, screener.in, etc.)
- New factors cite the published academic paper they are based on
- No API keys are required (the project uses only freely accessible data)

## Questions?

Open a [GitHub Discussion](https://github.com/abhy-kumar/quant-alpha/discussions) or contact the Alpha Research and Investment Club, FMS Delhi.
