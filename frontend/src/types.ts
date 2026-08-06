export interface DashboardData {
  Ticker: string
  Sector: string
  Industry?: string
  Price: number
  Prev_Close: number
  RSI_Value: number
  MACD_Value: number
  ADX_Value: number
  ST_Signal: string
  Tech_Score: number
  Fund_Score: number
  Research_Score: number
  Composite_Score: number
  Composite_Score_Tech: number
  Composite_Score_Fund: number
  Composite_Score_Mom: number
  Composite_Score_Long: number
  Conviction: string
  Conviction_Long: string
  ML_Alpha_Prob?: number
  ML_Conviction?: string
  Scan_Time: string
  "1d_Chg_%"?: number
  "P/E"?: number
  "Forward_P/E"?: number
  "Debt_to_Equity"?: number
  "ROE_%"?: number
  "ROCE_%"?: number
  "Div_Yield_%"?: number
  "Market_Cap_B"?: number
  "52W_High"?: number
  "52W_Low"?: number
  "All_Time_High"?: number
  "ATH_Source"?: string
  "All_Time_Low"?: number
  "ATL_Source"?: string
  Sig_Price_vs_SMA50?: number
  Sig_Price_vs_SMA200?: number
  Sig_SMA50_vs_SMA200?: number
  Sig_RSI?: number
  Sig_MACD_Cross?: number
  Sig_MACD_Hist?: number
  Sig_Stoch?: number
  Sig_BB?: number
  Sig_CCI?: number
  Sig_Volume?: number
  Sig_ADX?: number
  Sig_Supertrend?: number
  Sig_VPT?: number
  Sig_Ichimoku?: number
  RS_Percentile?: number
  Long_Name?: string
  CEO?: string
  Total_Revenue?: number
  Net_Income?: number
  EBITDA?: number
  News_Sentiment?: number
  Piotroski_F?: number
  Gross_Profit_Score?: number
  Momentum_1M?: number
  Momentum_3M?: number
  Momentum_6M?: number
  Momentum_12M?: number
  Risk_Adj_Mom?: number
  Vol_60D?: number
  Downside_Dev?: number
  Reversion_Signal?: number
  Z_Score_60?: number
  Earnings_Quality?: number
  Value_Score?: number
  Investment_Score?: number
  SUE_Score?: number
  Beta?: number
  Beta_Score?: number
  Alpha_60D?: number
  "Promoter_Holding_%"?: number
  "Promoter_Pledging_%"?: number
  Bull_Count?: number
  Bear_Count?: number
  "Total_Return_%"?: number
  "Ann_Vol_%"?: number
  "Vol_vs_Avg_%"?: number
  Sharpe?: number
  "Max_Drawdown_%"?: number
}

export interface MarketData {
  status: string
  last_updated: string
  first_scan_date?: string
  coverage_pct: number
  market_regime_score: number
  nifty_close?: number
  nifty_change_pct?: number
  vix_level?: number
  breadth_pct?: number
  fii_net?: number
  dii_net?: number
  pcr?: number
  scan_version: string
  factors: string[]
  sector_summary?: Record<string, SectorSummary>
  outcome_accuracy?: Record<string, OutcomeAccuracy>
  data: DashboardData[]
}

export interface SectorSummary {
  avg_composite: number
  avg_tech: number
  avg_fund: number
  avg_research: number
  strong_buys: number
  buys: number
  holds: number
  avoids: number
  count: number
}

export interface OutcomeAccuracy {
  n: number
  win_rate_21d: number | null
  avg_return_21d: number | null
  win_rate_63d: number | null
  avg_return_63d: number | null
}

export interface BacktestHolding {
  from: string    // "YYYY-MM-DD" — start of this holding window
  to: string      // "YYYY-MM-DD" — exclusive end (next scan date)
  tickers: string[]
}

export interface BacktestStats {
  total_return: number
  cagr: number
  volatility: number
  sharpe: number
  max_drawdown: number
  info_ratio: number
  win_rate: number
}

export interface BacktestBundle {
  chart: { date: string; portfolio: number; benchmark: number }[]
  holdings?: BacktestHolding[]
  stats: BacktestStats
}

export interface BacktestResult {
  date: string
  portfolio: number
  benchmark: number
}

export interface ModelPortfolios {
  max_sharpe: Record<string, number>
  min_volatility: Record<string, number>
}

export interface FactorExposure {
  Value: number
  Momentum: number
  Quality: number
  Low_Volatility: number
}

export interface QuantData {
  last_updated: string
  model_portfolios: {
    max_sharpe: Record<string, number>
    min_volatility: Record<string, number>
  }
  factor_exposures: {
    Value: number
    Momentum: number
    Quality: number
    Low_Volatility: number
  }
  market_regime?: {
    score: number
    nifty_trend: string
    vix: number
    breadth: number
  }
  sector_allocation?: Record<string, number>
  correlation_matrix?: {
    labels: string[]
    matrix: number[][]
  }
  // Legacy (factor_history-based, only ~25 data points)
  backtest: BacktestBundle
  backtest_long?: BacktestBundle
  // Walk-forward OHLCV-based backtests (full 2-year history)
  backtest_short_1y?: BacktestBundle
  backtest_short_6m?: BacktestBundle
  backtest_long_1y?:  BacktestBundle
  backtest_long_6m?:  BacktestBundle
}

// ---------------------------------------------------------------------------
// Custom on-demand backtest cache types
// ---------------------------------------------------------------------------

export interface BacktestRunMeta {
  slug: string          // "{model}-{horizon}-{as_of_date}" — also the filename key
  as_of_date: string   // "YYYY-MM-DD"
  model: 'short' | 'long'
  horizon: '1y' | '6m'
  created_at: string   // "YYYY-MM-DD HH:MM:SS"
  data_start: string
  data_end: string
  n_chart_pts: number
  stats: BacktestStats
}

export interface BacktestRunFull extends BacktestRunMeta {
  chart: { date: string; portfolio: number; benchmark: number }[]
  holdings: { from: string; to: string; tickers: string[] }[]
}

export interface BacktestRunIndex {
  runs: BacktestRunMeta[]
  exported_at: string
}

export interface ChartCandle {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  [key: string]: number | string | undefined
}

export interface ScoreHistoryItem {
  date: string
  composite: number
  composite_tech?: number
  composite_fund?: number
  tech: number
  fund: number
  research: number
}
