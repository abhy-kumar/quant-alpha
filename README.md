<div align="center">
  <img src="assets/fmsLogo.svg" alt="FMS Logo" width="100" height="100" />
  <h1>Quantitative Alpha</h1>
  <p><strong>A modern, decoupled intelligence platform for Indian equities.</strong></p>
  <p>Built for the Alpha Research and Investment Club, FMS Delhi.</p>
</div>

<br />

<div align="center">
  <img src="assets/dashboard-preview.png" alt="Quantitative Alpha Dashboard" width="800" />
  <br />
  <em>(Replace `assets/dashboard-preview.png` with a screenshot of the dashboard)</em>
</div>

<br />

## <img src="https://unpkg.com/lucide-static@0.321.0/icons/target.svg" width="24" height="24" align="top" /> Purpose & Impact

The Quantitative Alpha dashboard bridges the gap between raw financial data and actionable trading insights. By leveraging robust algorithms and deep fundamental screening, it empowers the Alpha Research and Investment Club to make objective, data-driven investment decisions.

Our goal is to remove emotional bias from equity research. This platform democratizes institutional-grade quantitative strategies—combining momentum signals, technical breakouts, and fundamental value scores—into a sleek, zero-latency dashboard. 

Whether identifying short-term momentum or long-term value, the platform ensures that every conviction is backed by rigorous mathematics.

## <img src="https://unpkg.com/lucide-static@0.321.0/icons/zap.svg" width="24" height="24" align="top" /> Key Features

- **Algorithmic Signal Generation**: Automated scoring using RSI, MACD, Bollinger Bands, and Supertrend.
- **Fundamental Screening**: Real-time integration of P/E ratios, ROE, and Debt-to-Equity metrics.
- **Dynamic Charting**: Interactive price and volume charts natively integrated.
- **Sector Heatmaps**: Visual dispersion of market performance across different equity sectors.

## <img src="https://unpkg.com/lucide-static@0.321.0/icons/layers.svg" width="24" height="24" align="top" /> Architecture

The platform runs on a modern, decoupled architecture designed for maximum speed and zero maintenance costs:

- **Frontend**: React, Vite, Tailwind CSS, Recharts
- **Data Engine**: Python (`pandas`, `numpy`, `yfinance`)
- **Data Delivery**: Automated static JSON artifacts served directly to the client via GitHub Actions
- **Serverless API**: Vercel Serverless Functions for real-time charting data

## <img src="https://unpkg.com/lucide-static@0.321.0/icons/terminal.svg" width="24" height="24" align="top" /> Local Setup

Want to run the platform locally? You just need Node.js and Python installed.

### 1. Generate the Market Data
First, run the Python engine to fetch the latest market data and generate the static JSON artifact.

```bash
# Create and activate a virtual environment
python -m venv venv
.\venv\Scripts\activate        # Windows
# source venv/bin/activate     # Mac/Linux

# Install dependencies
pip install -r requirements.txt

# Run the data scanner (This will update the data for the UI)
python scanner.py
```

### 2. Start the UI
Once the data scanner finishes, start the React frontend.

```bash
cd frontend
npm install
npm run dev
```

Navigate to `http://localhost:5173` in your browser to view your local dashboard!

---
<div align="center">
  <sub>Made with ♥ by Abhishek Kumar</sub>
</div>
