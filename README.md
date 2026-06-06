# Quantitative Alpha Stock Dashboard

Indian equity intelligence platform built for the  
**Alpha Research and Investment Club, FMS Delhi**.

## Running Locally

```bash
python -m venv venv
.\venv\Scripts\activate        # Windows
pip install -r requirements.txt
streamlit run app.py
```

## Deployment

See [deployment guide](deployment_guide.md) for full instructions.
Hosted on **Streamlit Community Cloud** with **Supabase** as the database
and **GitHub Actions** for the scheduled daily scan.

### Quick summary
1. Push this repo to GitHub
2. Create a free Supabase project → copy the database URL
3. Deploy on share.streamlit.io → add `DATABASE_URL` as a secret
4. Add `DATABASE_URL` to GitHub repo secrets for the Actions scheduler

## Architecture

| Component | Technology |
|---|---|
| Frontend | Streamlit |
| Indicators | pandas / numpy (RSI, MACD, Bollinger, ATR, ADX, Supertrend) |
| Data | yfinance (historical), NSE Bhav Copy (EOD), NSE public API (live) |
| Database | SQLite (local) / Supabase PostgreSQL (cloud) |
| Scheduler | APScheduler (local) / GitHub Actions (cloud) |
