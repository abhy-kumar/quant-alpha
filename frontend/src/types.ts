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
  Conviction: string
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
  "Promoter_Holding_%"?: number
  "Promoter_Pledging_%"?: number
  Bull_Count?: number
  Bear_Count?: number
  "Total_Return_%"?: number
  "Ann_Vol_%"?: number
  Sharpe?: number
  "Max_Drawdown_%"?: number
}

export interface MarketData {
  status: string
  last_updated: string
  coverage_pct: number
  market_regime_score: number
  nifty_close?: number
  nifty_change_pct?: number
  vix_level?: number
  breadth_pct?: number
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
