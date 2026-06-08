# Quantitative Alpha Stock Dashboard

Indian equity intelligence platform built for the  
**Alpha Research and Investment Club, FMS Delhi**.

## Architecture

This application is a modern, decoupled Full Stack Web Application:

| Component | Technology |
|---|---|
| **Frontend** | React, Vite, Tailwind CSS, Recharts |
| **Backend** | FastAPI, Python |
| **Database** | SQLite (`scanner.db`) |
| **Market Data** | `yfinance` (historical pricing), `BeautifulSoup` (fundamental scraping via Screener.in) |
| **Math / Algos** | `pandas`, `numpy` (RSI, MACD, Bollinger, ATR, ADX, Supertrend) |

## Running Locally

Because the architecture is decoupled, you need to start two separate servers to run the app locally.

### 1. Start the Backend API (Terminal 1)
```bash
python -m venv venv
.\venv\Scripts\activate        # Windows
pip install -r requirements.txt

# Run the database scan to fetch the latest data
python scanner.py

# Start the FastAPI server
uvicorn api:app --host 0.0.0.0 --port 8000 --reload
```

### 2. Start the Frontend UI (Terminal 2)
```bash
cd frontend
npm install
npm run dev
```
Navigate to `http://localhost:5173` in your browser to view the dashboard!

## Deployment

See the [Deployment Guide](deployment_guide.md) for full instructions on how to host this platform online for free.

**Quick Summary:**
1. Deploy the backend to **Render.com** (Web Service, Python 3). Attach a persistent disk if you want to save SQLite history across reboots.
2. Update the `API_BASE` URL in `frontend/src/App.tsx` to point to your new Render URL.
3. Deploy the frontend to **Vercel.com**.
