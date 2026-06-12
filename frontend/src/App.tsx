import React, { useEffect, useState, useMemo } from 'react'
import axios from 'axios'
import { Activity, Database, TrendingUp, BarChart2, Layers, Search, Moon, Sun, Info } from 'lucide-react'
import {
  ComposedChart,
  Line,
  Bar,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts'

// Interfaces
interface DashboardData {
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

// Diagnostics removed, using static JSON
const STATIC_URL = '/market_data.json'

export default function App() {
  const [data, setData] = useState<DashboardData[]>([])
  const [lastUpdated, setLastUpdated] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [niftyData, setNiftyData] = useState<{price: number, change_pct: number, is_up: boolean} | null>(null)
  const [coveragePct, setCoveragePct] = useState<number | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [marketRegimeScore, setMarketRegimeScore] = useState<number | null>(null)
  const [isDynamic, setIsDynamic] = useState<boolean>(false)
  const [activeTab, setActiveTab] = useState<'picks' | 'fundamentals' | 'charting' | 'heatmap'>('picks')
  
  // Theme state
  const [isDark, setIsDark] = useState(false)

  // Toggles
  const [horizon, setHorizon] = useState<'short' | 'long'>('short')

  // Charting state
  const [selectedTicker, setSelectedTicker] = useState<string>('')
  const [chartPeriod, setChartPeriod] = useState<string>('1y')
  const [chartInterval, setChartInterval] = useState<string>('1d')
  const [chartData, setChartData] = useState<any[]>([])
  const [chartLoading, setChartLoading] = useState(false)
  
  // Screener popover
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  
  // Sort state for screening table
  const [sortKey, setSortKey] = useState<string>('Composite_Score')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  
  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }
  
  const sortedData = useMemo(() => {
    const arr = [...data]
    arr.sort((a, b) => {
      const av = Number((a as any)[sortKey]) || 0
      const bv = Number((b as any)[sortKey]) || 0
      return sortDir === 'asc' ? av - bv : bv - av
    })
    return arr
  }, [data, sortKey, sortDir])

  // Apply theme to document root
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [isDark])

  const dataRef = React.useRef<DashboardData[]>([])
  useEffect(() => {
    dataRef.current = data
  }, [data])

  const fetchLiveData = async () => {
    const currentData = dataRef.current
    if (!currentData || currentData.length === 0) return

    try {
      const tickers = currentData.map(d => d.Ticker)
      const res = await axios.post('/api/live_data', { tickers })
      
      if (res.data.status === 'ok') {
         const livePrices = res.data.data
         const updatedData = currentData.map(d => {
             if (livePrices[d.Ticker]) {
                 return {
                     ...d,
                     Price: livePrices[d.Ticker].price || d.Price,
                     "1d_Chg_%": livePrices[d.Ticker].change_pct !== undefined ? livePrices[d.Ticker].change_pct : d["1d_Chg_%"]
                 }
             }
             return d
         })
         setData(updatedData)
         if (res.data.nifty_50) setNiftyData(res.data.nifty_50)
         
         const now = new Date()
         setLastUpdated(now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) + ' IST')
         setIsDynamic(true)
         if (res.data.is_market_closed) {
            return 'market_closed'
         }
         return 'ok'
      }
    } catch(err) {
       console.error("Failed to fetch live data", err)
       return 'error'
    }
  }

  // Fetch static data
  const fetchData = async () => {
    try {
      const res = await axios.get(`${STATIC_URL}?t=${new Date().getTime()}`)
      
      if (res.data.status === 'ok' && res.data.data.length > 0) {
        const sortedData = res.data.data.sort((a: any, b: any) => a.Ticker.localeCompare(b.Ticker))
        setData(sortedData)
        setLastUpdated(res.data.last_updated || 'Unknown')
        if (res.data.nifty_50) setNiftyData(res.data.nifty_50)
        setCoveragePct(res.data.coverage_pct ?? null)
        setMarketRegimeScore(res.data.market_regime_score ?? null)
        setIsDynamic(res.data.is_dynamic || false)
        if (!selectedTicker) setSelectedTicker(sortedData[0].Ticker)
        setLoading(false)
        return true
      }
    } catch (err: any) {
      console.error("Failed to load static market data:", err)
      setLoadError(err.message || String(err))
    }
    setLoading(false)
    return false
  }

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval>

    const init = async () => {
      const success = await fetchData()
      if (success) {
        // After loading static data, fetch the very latest prices
        setTimeout(async () => {
           const status = await fetchLiveData()
           if (status !== 'market_closed') {
              intervalId = setInterval(async () => {
                const currentStatus = await fetchLiveData()
                if (currentStatus === 'market_closed') {
                  clearInterval(intervalId)
                }
              }, 3 * 60 * 1000) // Poll API every 3 minutes
           }
        }, 1000)
      }
    }
    init()
    
    return () => {
      if (intervalId) clearInterval(intervalId)
    }
  }, [])

  // Fetch chart data via Vercel Serverless Function
  useEffect(() => {
    if (!selectedTicker) return
    const fetchChart = async () => {
      setChartLoading(true)
      try {
        const res = await axios.get(`/api/chart?ticker=${encodeURIComponent(selectedTicker)}&period=${chartPeriod}&interval=${chartInterval}`)
        if (res.data.status === 'ok') {
          setChartData(res.data.data)
        } else {
          setChartData([])
        }
      } catch (err) {
        console.error("Chart fetch failed", err)
        setChartData([])
      } finally {
        setChartLoading(false)
      }
    }
    fetchChart()
  }, [selectedTicker, chartPeriod, chartInterval])

  // Logic
  const topPicks = useMemo(() => {
    let filtered = [...data].filter(d => !d.Ticker.includes('BEES') && d.Sector !== 'ETF')
    if (horizon === 'short') {
      filtered = filtered
        .filter(d => {
          const fund = Number(d.Fund_Score)
          return isNaN(fund) || fund >= 5
        })
        .sort((a, b) => Number(b.Composite_Score || 0) - Number(a.Composite_Score || 0))
    } else {
      filtered = filtered
        .filter(d => {
          const research = Number(d.Research_Score)
          return !isNaN(research) && research > 5
        })
        .sort((a, b) => {
          const ra = Number(a.Composite_Score_Fund || 0)
          const rb = Number(b.Composite_Score_Fund || 0)
          return rb - ra
        })
    }
    return filtered.slice(0, 3)
  }, [data, horizon])

  const sectorMap = useMemo(() => {
    const map: Record<string, DashboardData[]> = {}
    data.forEach(d => {
      const s = d.Sector || 'Unknown'
      if (!map[s]) map[s] = []
      map[s].push(d)
    })
    return map
  }, [data])

  const selectedAsset = useMemo(() => {
    return data.find(d => d.Ticker === selectedTicker) || null
  }, [data, selectedTicker])

  const peerGroup = useMemo(() => {
    if (!selectedAsset || !selectedAsset.Sector || selectedAsset.Sector === 'Unknown') return []
    const peers = data
      .filter(d => d.Sector === selectedAsset.Sector && d.Ticker !== selectedAsset.Ticker)
      .sort((a, b) => Number(b.Market_Cap_B || 0) - Number(a.Market_Cap_B || 0))
      .slice(0, 5)
    return [selectedAsset, ...peers]
  }, [data, selectedAsset])

  const num = (val: any) => (!isNaN(Number(val)) && val !== "" && val !== null ? Number(val).toFixed(2) : 'N/A')
  const colorCode = (val: any) => (Number(val) > 0 ? 'text-green-600 dark:text-green-500' : Number(val) < 0 ? 'text-red-600 dark:text-red-500' : 'text-primary')

  const handleHeatmapClick = (ticker: string) => {
    setSelectedTicker(ticker)
    setActiveTab('charting')
  }

  const getSignalLabel = (val: any) => {
    if (val === 1) return <span className="text-green-600 dark:text-green-500 font-medium">Bullish</span>
    if (val === -1) return <span className="text-red-600 dark:text-red-500 font-medium">Bearish</span>
    return <span className="text-muted">Neutral</span>
  }

  const scoreBar = (label: string, value: number, max: number = 10, color?: string) => {
    const pct = Math.min((value / max) * 100, 100)
    const barColor = color || (value >= 7 ? 'bg-green-500' : value >= 4 ? 'bg-amber-500' : 'bg-red-500')
    return (
      <div className="flex items-center gap-2">
        <span className="text-muted text-[10px] font-mono w-20 shrink-0">{label}</span>
        <div className="flex-1 h-1 bg-border rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${barColor}`} style={{width: `${pct}%`}}></div>
        </div>
        <span className="text-sub text-[10px] font-mono w-6 text-right shrink-0">{value.toFixed(1)}</span>
      </div>
    )
  }

  const SortHeader = ({ field, children }: { field: string; children: React.ReactNode }) => (
    <th 
      className="p-4 font-semibold cursor-pointer hover:text-brand transition-colors select-none"
      onClick={() => handleSort(field)}
    >
      <span className="flex items-center gap-1">
        {children}
        {sortKey === field && <span className="text-brand">{sortDir === 'asc' ? '↑' : '↓'}</span>}
      </span>
    </th>
  )

  return (
    <div className="min-h-screen flex flex-col transition-colors duration-300">
      {/* Header */}
      <header className="px-6 py-4 border-b border-border bg-card">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div className="flex items-center gap-4">
            <h1 className="font-display font-semibold text-xl uppercase tracking-wider text-primary">
              Quantitative <span className="text-brand">Alpha</span>
            </h1>
            <div className="h-4 w-px bg-border hidden sm:block"></div>
            <span className="font-mono text-[10px] text-sub tracking-widest uppercase hidden sm:block">Alpha Research & Investment Club | FMS Delhi</span>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            {niftyData && (
              <span className={`px-2 py-1 font-mono text-[10px] border border-border ${niftyData.is_up ? 'text-green-600 dark:text-green-500' : 'text-red-600 dark:text-red-500'}`}>
                NIFTY 50: {niftyData.price} ({niftyData.change_pct > 0 ? '+' : ''}{niftyData.change_pct}%)
              </span>
            )}
            {coveragePct !== null && (
              <span className="px-2 py-1 font-mono text-[10px] border border-border text-muted">
                Coverage: {coveragePct}%
              </span>
            )}
            {marketRegimeScore !== null && (
              <span className={`px-2 py-1 font-mono text-[10px] border border-border ${marketRegimeScore > 0 ? 'text-green-600 dark:text-green-500' : marketRegimeScore < 0 ? 'text-red-600 dark:text-red-500' : 'text-muted'}`}>
                Regime: {marketRegimeScore > 0 ? 'Bullish' : marketRegimeScore < 0 ? 'Bearish' : 'Neutral'} ({marketRegimeScore > 0 ? `+${marketRegimeScore}` : marketRegimeScore})
              </span>
            )}
            <div className="h-4 w-px bg-border"></div>
            {[
              { id: 'picks', label: 'Signals', icon: TrendingUp },
              { id: 'fundamentals', label: 'Screen', icon: Database },
              { id: 'charting', label: 'Charts', icon: BarChart2 },
              { id: 'heatmap', label: 'Heatmap', icon: Layers }
            ].map(tab => (
              <button 
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-1.5 px-3 py-1 font-mono text-[10px] uppercase tracking-widest transition-all border ${activeTab === tab.id ? 'border-primary bg-primary text-background' : 'border-border text-muted hover:text-primary hover:border-primary'}`}
              >
                <tab.icon size={12} /> <span className="hidden md:inline">{tab.label}</span>
              </button>
            ))}
            <button 
              onClick={() => setIsDark(!isDark)}
              className="p-1.5 border border-border text-muted hover:text-primary hover:border-primary transition-colors"
              title="Toggle Theme"
            >
              {isDark ? <Sun size={14} /> : <Moon size={14} />}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow px-6 py-8 max-w-7xl mx-auto w-full">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 gap-6 max-w-md mx-auto">
            <div className="w-full bg-border rounded-full h-1.5 overflow-hidden">
              <div className="bg-brand h-1.5 w-full rounded-full animate-progress origin-left"></div>
            </div>
            <div className="font-mono text-muted text-sm uppercase tracking-widest text-center animate-pulse">
              Loading Dashboard...
            </div>
          </div>
        ) : data.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-96 gap-6 max-w-md mx-auto">
            <div className="font-mono text-muted text-sm uppercase tracking-widest text-center">
              Failed to load market_data.json<br/>
              <span className="text-primary/50 text-xs mt-2 block">Ensure the JSON file exists.</span>
              {loadError && (
                <div className="text-red-500 text-xs mt-4 normal-case max-w-sm overflow-hidden break-words">Error: {loadError}</div>
              )}
            </div>
          </div>
        ) : (
          <div className="animate-in fade-in duration-500">
            
            {/* VIEW: TOP PICKS */}
            {activeTab === 'picks' && (
              <div className="space-y-8">
                <section className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div className="flex items-center gap-3">
                    <div className="h-6 w-1 bg-brand rounded-full"></div>
                    <h2 className="font-display font-bold text-xl tracking-wide text-primary">
                      High Conviction Signals
                    </h2>
                    <span className="flex h-2 w-2 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-brand"></span>
                    </span>
                  </div>
                  
                  <div className="flex bg-card border border-border p-0.5">
                    <button 
                      onClick={() => setHorizon('short')}
                      className={`px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest transition-all ${horizon === 'short' ? 'bg-brand text-white' : 'text-muted hover:text-primary'}`}
                    >
                      Short Term
                    </button>
                    <button 
                      onClick={() => setHorizon('long')}
                      className={`px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest transition-all ${horizon === 'long' ? 'bg-brand text-white' : 'text-muted hover:text-primary'}`}
                    >
                      Long Term
                    </button>
                  </div>
                </section>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {topPicks.map((stock, i) => (
                    <div 
                      key={stock.Ticker} 
                      onClick={() => handleHeatmapClick(stock.Ticker)}
                      className="p-6 border border-border bg-card shadow-sm hover:shadow-md hover:border-brand/50 transition-all duration-300 cursor-pointer group"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="font-mono text-[10px] text-sub uppercase tracking-widest group-hover:text-brand transition-colors">
                          #{i + 1} • {horizon === 'short' ? 'Momentum' : 'Value'}
                        </span>
                        <span className={`font-mono text-[10px] px-2 py-0.5 border rounded-sm ${
                          stock.Conviction === 'Strong Buy' ? 'border-green-500 text-green-600 dark:text-green-400 bg-green-500/10' :
                          stock.Conviction === 'Buy' ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-500/10' :
                          'border-border text-muted'
                        }`}>
                          {stock.Conviction || 'N/A'}
                        </span>
                      </div>
                      <h3 className="font-display font-semibold text-xl text-primary">{stock.Ticker.replace('.NS', '')}<span className="text-brand">.</span></h3>
                      <div className="font-mono text-[10px] text-brand tracking-widest mt-1 mb-4 uppercase">
                        {stock.Sector || 'Equities'}
                      </div>
                      
                      <div className="space-y-1 mb-4 py-3 border-y border-border">
                        {scoreBar('Composite', Number(stock.Composite_Score) || 0)}
                        {scoreBar('Tech', Number(stock.Tech_Score) || 0)}
                        {scoreBar('Fund', Number(stock.Fund_Score) || 0)}
                        {scoreBar('Research', Number(stock.Research_Score) || 0)}
                      </div>

                      <div className="grid grid-cols-3 gap-2 font-mono text-[10px]">
                        <div className="flex flex-col">
                          <span className="text-muted">Piotroski</span>
                          <span className={`font-semibold ${Number(stock.Piotroski_F) >= 7 ? 'text-green-600 dark:text-green-500' : Number(stock.Piotroski_F) <= 3 ? 'text-red-600 dark:text-red-500' : 'text-primary'}`}>{stock.Piotroski_F ?? '-'}/9</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-muted">12M Mom</span>
                          <span className={`font-semibold ${colorCode(stock.Momentum_12M)}`}>{stock.Momentum_12M != null ? `${(stock.Momentum_12M * 100).toFixed(1)}%` : 'N/A'}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-muted">P/E</span>
                          <span className="text-primary">{num(stock['P/E'])}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-muted">ROE</span>
                          <span className="text-primary">{num(stock['ROE_%'])}%</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-muted">Mkt Cap</span>
                          <span className="text-primary">{num(stock.Market_Cap_B)}B</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-muted">Vol 60D</span>
                          <span className={`font-semibold ${Number(stock.Vol_60D) < 25 ? 'text-green-600 dark:text-green-500' : Number(stock.Vol_60D) > 40 ? 'text-red-600 dark:text-red-500' : 'text-primary'}`}>{num(stock.Vol_60D)}%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* VIEW: FUNDAMENTALS & SCREENING */}
            {activeTab === 'fundamentals' && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-6 w-1 bg-brand rounded-full"></div>
                  <h2 className="font-display font-bold text-xl tracking-wide text-primary">Universe Screening</h2>
                  <span className="font-mono text-[10px] text-muted">({data.length} stocks)</span>
                </div>
                <div className="overflow-x-auto border border-border bg-card shadow-sm rounded-sm">
                  <table className="w-full text-left font-mono text-xs">
                    <thead>
                      <tr className="border-b border-border text-sub uppercase tracking-widest bg-black/5 dark:bg-black/50">
                        <SortHeader field="Ticker">Ticker</SortHeader>
                        <SortHeader field="Sector">Sector</SortHeader>
                        <SortHeader field="Price">LTP</SortHeader>
                        <SortHeader field="Composite_Score">Composite</SortHeader>
                        <SortHeader field="Tech_Score">Tech</SortHeader>
                        <SortHeader field="Fund_Score">Fund</SortHeader>
                        <SortHeader field="Research_Score">Research</SortHeader>
                        <SortHeader field="Piotroski_F">F-Score</SortHeader>
                        <SortHeader field="Momentum_12M">12M Mom</SortHeader>
                        <SortHeader field="P/E">P/E</SortHeader>
                        <SortHeader field="Debt_to_Equity">D/E</SortHeader>
                        <SortHeader field="Conviction">Conviction</SortHeader>
                        <th className="p-4"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedData.map((row, i) => (
                        <React.Fragment key={i}>
                          <tr 
                            className={`border-b border-border hover:bg-black/5 dark:hover:bg-white/5 transition-colors duration-200 ${expandedRow === row.Ticker ? 'bg-black/5 dark:bg-white/5' : ''}`}
                          >
                            <td className="p-4 text-primary font-medium cursor-pointer" onClick={() => handleHeatmapClick(row.Ticker)}>{row.Ticker.replace('.NS', '')}</td>
                            <td className="p-4 text-muted">{row.Sector || '-'}</td>
                            <td className="p-4 text-right text-muted">{num(row.Price)}</td>
                            <td className={`p-4 text-right font-medium ${colorCode(row.Composite_Score)}`}>{num(row.Composite_Score)}</td>
                            <td className={`p-4 text-right font-medium ${colorCode(row.Tech_Score)}`}>{num(row.Tech_Score)}</td>
                            <td className={`p-4 text-right font-medium ${Number(row.Fund_Score) >= 5 ? 'text-green-600 dark:text-green-500' : 'text-primary'}`}>{num(row.Fund_Score)}</td>
                            <td className={`p-4 text-right font-medium ${Number(row.Research_Score) >= 7 ? 'text-green-600 dark:text-green-500' : Number(row.Research_Score) < 4 ? 'text-red-600 dark:text-red-500' : 'text-primary'}`}>{num(row.Research_Score)}</td>
                            <td className={`p-4 text-right font-medium ${Number(row.Piotroski_F) >= 7 ? 'text-green-600 dark:text-green-500' : Number(row.Piotroski_F) <= 3 ? 'text-red-600 dark:text-red-500' : 'text-primary'}`}>{row.Piotroski_F ?? '-'}<span className="text-muted">/9</span></td>
                            <td className={`p-4 text-right font-medium ${colorCode(row.Momentum_12M)}`}>{row.Momentum_12M != null ? `${(row.Momentum_12M * 100).toFixed(1)}%` : 'N/A'}</td>
                            <td className="p-4 text-right text-muted">{num(row['P/E'])}</td>
                            <td className="p-4 text-right text-muted">{num(row['Debt_to_Equity'])}</td>
                            <td className="p-4 text-right text-primary font-medium">{row.Conviction || 'N/A'}</td>
                            <td className="p-4 text-center">
                              <button 
                                onClick={() => setExpandedRow(expandedRow === row.Ticker ? null : row.Ticker)}
                                className="text-sub hover:text-brand transition-colors"
                                title="View Score Breakdown"
                              >
                                <Info size={16} />
                              </button>
                            </td>
                          </tr>
                          {/* Expanded Score Breakdown Row */}
                          {expandedRow === row.Ticker && (
                            <tr className="bg-black/5 dark:bg-black/20 border-b border-border">
                              <td colSpan={13} className="p-6">
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                  {/* Technical Signals */}
                                  <div>
                                    <h4 className="font-mono text-[10px] uppercase tracking-widest text-brand mb-4">Technical Signals</h4>
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 font-mono text-xs">
                                      <div><span className="text-muted block mb-1">Price vs SMA50</span>{getSignalLabel(row.Sig_Price_vs_SMA50)}</div>
                                      <div><span className="text-muted block mb-1">Price vs SMA200</span>{getSignalLabel(row.Sig_Price_vs_SMA200)}</div>
                                      <div><span className="text-muted block mb-1">SMA50 vs SMA200</span>{getSignalLabel(row.Sig_SMA50_vs_SMA200)}</div>
                                      <div><span className="text-muted block mb-1">RSI</span>{getSignalLabel(row.Sig_RSI)}</div>
                                      <div><span className="text-muted block mb-1">MACD Cross</span>{getSignalLabel(row.Sig_MACD_Cross)}</div>
                                      <div><span className="text-muted block mb-1">MACD Hist</span>{getSignalLabel(row.Sig_MACD_Hist)}</div>
                                      <div><span className="text-muted block mb-1">Stochastic</span>{getSignalLabel(row.Sig_Stoch)}</div>
                                      <div><span className="text-muted block mb-1">Bollinger Bands</span>{getSignalLabel(row.Sig_BB)}</div>
                                      <div><span className="text-muted block mb-1">CCI</span>{getSignalLabel(row.Sig_CCI)}</div>
                                      <div><span className="text-muted block mb-1">Volume Spike</span>{getSignalLabel(row.Sig_Volume)}</div>
                                      <div><span className="text-muted block mb-1">ADX Trend</span>{getSignalLabel(row.Sig_ADX)}</div>
                                      <div><span className="text-muted block mb-1">Supertrend</span>{getSignalLabel(row.Sig_Supertrend)}</div>
                                      <div><span className="text-muted block mb-1">Vol Price Trend</span>{getSignalLabel(row.Sig_VPT)}</div>
                                      <div><span className="text-muted block mb-1">Ichimoku Cloud</span>{getSignalLabel(row.Sig_Ichimoku)}</div>
                                    </div>
                                    <div className="mt-4 pt-3 border-t border-border grid grid-cols-3 gap-3 font-mono text-[10px]">
                                      <div><span className="text-muted block">Bull Signals</span><span className="text-green-600 dark:text-green-500 font-semibold">{row.Bull_Count ?? '-'}</span></div>
                                      <div><span className="text-muted block">Bear Signals</span><span className="text-red-600 dark:text-red-500 font-semibold">{row.Bear_Count ?? '-'}</span></div>
                                      <div><span className="text-muted block">RS Percentile</span><span className="text-primary font-semibold">{num(row.RS_Percentile)}%</span></div>
                                    </div>
                                  </div>

                                  {/* Research Factors */}
                                  <div>
                                    <h4 className="font-mono text-[10px] uppercase tracking-widest text-brand mb-4">Research Factors</h4>
                                    <div className="grid grid-cols-2 gap-4 font-mono text-xs">
                                      <div>
                                        <span className="text-muted block mb-1">Piotroski F-Score</span>
                                        <div className="flex items-center gap-2">
                                          <span className={`font-semibold ${Number(row.Piotroski_F) >= 7 ? 'text-green-600 dark:text-green-500' : Number(row.Piotroski_F) <= 3 ? 'text-red-600 dark:text-red-500' : 'text-primary'}`}>{row.Piotroski_F ?? '-'}/9</span>
                                          <div className="flex-1 h-1 bg-border rounded-full overflow-hidden">
                                            <div className={`h-full rounded-full ${Number(row.Piotroski_F) >= 7 ? 'bg-green-500' : Number(row.Piotroski_F) <= 3 ? 'bg-red-500' : 'bg-primary'}`} style={{width: `${((row.Piotroski_F || 0) / 9) * 100}%`}}></div>
                                          </div>
                                        </div>
                                      </div>
                                      <div>
                                        <span className="text-muted block mb-1">Gross Profitability</span>
                                        <span className={`font-semibold ${Number(row.Gross_Profit_Score) >= 7 ? 'text-green-600 dark:text-green-500' : 'text-primary'}`}>{num(row.Gross_Profit_Score)}/10</span>
                                      </div>
                                      <div>
                                        <span className="text-muted block mb-1">Earnings Quality</span>
                                        <span className={`font-semibold ${Number(row.Earnings_Quality) >= 7 ? 'text-green-600 dark:text-green-500' : Number(row.Earnings_Quality) < 4 ? 'text-red-600 dark:text-red-500' : 'text-primary'}`}>{num(row.Earnings_Quality)}/10</span>
                                      </div>
                                      <div>
                                        <span className="text-muted block mb-1">Volatility (60D)</span>
                                        <span className={`font-semibold ${Number(row.Vol_60D) < 25 ? 'text-green-600 dark:text-green-500' : Number(row.Vol_60D) > 40 ? 'text-red-600 dark:text-red-500' : 'text-primary'}`}>{num(row.Vol_60D)}%</span>
                                      </div>
                                      <div>
                                        <span className="text-muted block mb-1">1M Momentum</span>
                                        <span className={`font-semibold ${colorCode(row.Momentum_1M)}`}>{row.Momentum_1M != null ? `${(row.Momentum_1M * 100).toFixed(2)}%` : 'N/A'}</span>
                                      </div>
                                      <div>
                                        <span className="text-muted block mb-1">3M Momentum</span>
                                        <span className={`font-semibold ${colorCode(row.Momentum_3M)}`}>{row.Momentum_3M != null ? `${(row.Momentum_3M * 100).toFixed(2)}%` : 'N/A'}</span>
                                      </div>
                                      <div>
                                        <span className="text-muted block mb-1">6M Momentum</span>
                                        <span className={`font-semibold ${colorCode(row.Momentum_6M)}`}>{row.Momentum_6M != null ? `${(row.Momentum_6M * 100).toFixed(2)}%` : 'N/A'}</span>
                                      </div>
                                      <div>
                                        <span className="text-muted block mb-1">12M Momentum</span>
                                        <span className={`font-semibold ${colorCode(row.Momentum_12M)}`}>{row.Momentum_12M != null ? `${(row.Momentum_12M * 100).toFixed(2)}%` : 'N/A'}</span>
                                      </div>
                                      <div>
                                        <span className="text-muted block mb-1">Risk-Adj Mom</span>
                                        <span className={`font-semibold ${colorCode(row.Risk_Adj_Mom)}`}>{num(row.Risk_Adj_Mom)}</span>
                                      </div>
                                      <div>
                                        <span className="text-muted block mb-1">Z-Score (60D)</span>
                                        <span className={`font-semibold ${Number(row.Z_Score_60) > 2 ? 'text-red-600 dark:text-red-500' : Number(row.Z_Score_60) < -2 ? 'text-green-600 dark:text-green-500' : 'text-primary'}`}>{num(row.Z_Score_60)}</span>
                                      </div>
                                      <div>
                                        <span className="text-muted block mb-1">Reversion Signal</span>
                                        <span className={`font-semibold ${Number(row.Reversion_Signal) === 1 ? 'text-green-600 dark:text-green-500' : Number(row.Reversion_Signal) === -1 ? 'text-red-600 dark:text-red-500' : 'text-muted'}`}>
                                          {Number(row.Reversion_Signal) === 1 ? 'Oversold' : Number(row.Reversion_Signal) === -1 ? 'Overbought' : 'Neutral'}
                                        </span>
                                      </div>
                                      <div>
                                        <span className="text-muted block mb-1">Downside Dev</span>
                                        <span className="text-primary">{num(row.Downside_Dev)}%</span>
                                      </div>
                                    </div>
                                    <div className="mt-4 pt-3 border-t border-border grid grid-cols-4 gap-3 font-mono text-[10px]">
                                      <div><span className="text-muted block">Total Return</span><span className={`font-semibold ${colorCode(row['Total_Return_%'])}`}>{num(row['Total_Return_%'])}%</span></div>
                                      <div><span className="text-muted block">Ann Vol</span><span className="text-primary">{num(row['Ann_Vol_%'])}%</span></div>
                                      <div><span className="text-muted block">Sharpe</span><span className={`font-semibold ${colorCode(row.Sharpe)}`}>{num(row.Sharpe)}</span></div>
                                      <div><span className="text-muted block">Max DD</span><span className="text-red-600 dark:text-red-500">{num(row['Max_Drawdown_%'])}%</span></div>
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* VIEW: CHARTING */}
            {activeTab === 'charting' && (
              <div className="flex flex-col xl:flex-row gap-8">
                {/* Left Column: Controls & Snapshots */}
                <div className="w-full xl:w-1/4 flex flex-col gap-6">
                  
                  {/* Selector */}
                  <div className="flex flex-col gap-2">
                    <label className="font-mono text-xs uppercase tracking-widest text-sub">Security</label>
                    <div className="flex items-center gap-3 bg-card border border-border p-1 rounded-sm shadow-sm hover:border-brand/50 transition-colors">
                      <div className="pl-3">
                        <Search size={14} className="text-muted" />
                      </div>
                      <select 
                        className="bg-transparent text-primary font-mono text-xs uppercase outline-none cursor-pointer w-full py-1.5 pr-2"
                        value={selectedTicker}
                        onChange={e => setSelectedTicker(e.target.value)}
                      >
                        {data.map(d => <option key={d.Ticker} value={d.Ticker} className="bg-card">{d.Ticker}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Company Profile */}
                  <div className="border border-border bg-card p-6 shadow-sm">
                    <h3 className="font-mono text-xs uppercase tracking-widest text-primary mb-4 border-b border-border pb-2 font-semibold flex justify-between">
                      Company Profile
                      <span className={Number(selectedAsset?.News_Sentiment) > 0.1 ? "text-green-600 dark:text-green-500" : Number(selectedAsset?.News_Sentiment) < -0.1 ? "text-red-600 dark:text-red-500" : "text-muted"}>
                        {selectedAsset?.News_Sentiment !== undefined && selectedAsset.News_Sentiment !== null ? `Sentiment: ${selectedAsset.News_Sentiment}` : ''}
                      </span>
                    </h3>
                    <div className="mb-6">
                      <div className="font-mono text-[10px] text-muted uppercase">Name</div>
                      <div className="font-display text-sm mt-1 text-primary" title={selectedAsset?.Long_Name || 'N/A'}>{selectedAsset?.Long_Name || 'N/A'}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-y-4 gap-x-2">
                      {/* Row 1: Live Price, 1D Change */}
                      <div>
                        <div className="font-mono text-[10px] text-muted uppercase">Live Price</div>
                        <div className="font-display text-base font-semibold text-primary mt-1">₹{num(selectedAsset?.Price)}</div>
                      </div>
                      <div>
                        <div className="font-mono text-[10px] text-muted uppercase">1D Change</div>
                        <div className={`font-mono text-xs mt-1 flex items-center font-semibold ${selectedAsset?.["1d_Chg_%"] && selectedAsset["1d_Chg_%"] > 0 ? 'text-green-500' : selectedAsset?.["1d_Chg_%"] && selectedAsset["1d_Chg_%"] < 0 ? 'text-red-500' : 'text-primary'}`}>
                          {selectedAsset?.["1d_Chg_%"] && selectedAsset["1d_Chg_%"] > 0 ? <TrendingUp size={12} className="mr-1"/> : selectedAsset?.["1d_Chg_%"] && selectedAsset["1d_Chg_%"] < 0 ? <TrendingUp size={12} className="mr-1 rotate-180"/> : null}
                          {selectedAsset?.["1d_Chg_%"] ? `${Math.abs(selectedAsset["1d_Chg_%"]).toFixed(2)}%` : 'N/A'}
                        </div>
                      </div>

                      {/* Row 2: CEO, Mkt Cap */}
                      <div>
                        <div className="font-mono text-[10px] text-muted uppercase">CEO</div>
                        <div className="font-mono text-xs mt-1 text-primary truncate" title={selectedAsset?.CEO || 'N/A'}>{selectedAsset?.CEO || 'N/A'}</div>
                      </div>
                      <div>
                        <div className="font-mono text-[10px] text-muted uppercase">Market Cap</div>
                        <div className="font-mono text-xs mt-1 text-primary truncate">{selectedAsset?.Market_Cap_B ? `₹${num(selectedAsset?.Market_Cap_B)}B` : 'N/A'}</div>
                      </div>
                      
                      {/* Row 2: Revenue, Profit */}
                      <div>
                        <div className="font-mono text-[10px] text-muted uppercase">Revenue</div>
                        <div className="font-mono text-xs mt-1 text-primary truncate">{selectedAsset?.Total_Revenue ? `₹${num(selectedAsset?.Total_Revenue / 1e9)}B` : 'N/A'}</div>
                      </div>
                      <div>
                        <div className="font-mono text-[10px] text-muted uppercase">Profit</div>
                        <div className="font-mono text-xs mt-1 text-primary truncate">{selectedAsset?.Net_Income ? `₹${num(selectedAsset?.Net_Income / 1e9)}B` : 'N/A'}</div>
                      </div>

                      {/* Row 3: EBITDA, Div Yield */}
                      <div>
                        <div className="font-mono text-[10px] text-muted uppercase">EBITDA</div>
                        <div className="font-mono text-xs mt-1 text-primary truncate">{selectedAsset?.EBITDA ? `₹${num(selectedAsset?.EBITDA / 1e9)}B` : 'N/A'}</div>
                      </div>
                      <div>
                        <div className="font-mono text-[10px] text-muted uppercase">Div Yield</div>
                        <div className="font-mono text-xs mt-1 text-primary truncate">{selectedAsset?.["Div_Yield_%"] ? `${num(selectedAsset?.["Div_Yield_%"])}%` : 'N/A'}</div>
                      </div>
                      
                      {/* Row 3: 52W High, 52W Low */}
                      <div>
                        <div className="font-mono text-[10px] text-muted uppercase">52W High</div>
                        <div className="font-mono text-xs mt-1 text-primary truncate">{selectedAsset?.["52W_High"] ? `₹${num(selectedAsset?.["52W_High"])}` : 'N/A'}</div>
                      </div>
                      <div>
                        <div className="font-mono text-[10px] text-muted uppercase">52W Low</div>
                        <div className="font-mono text-xs mt-1 text-primary truncate">{selectedAsset?.["52W_Low"] ? `₹${num(selectedAsset?.["52W_Low"])}` : 'N/A'}</div>
                      </div>
                      
                      {/* Row 4: ATH, ATL */}
                      <div>
                        <div className="font-mono text-[10px] text-muted uppercase">All-Time High</div>
                        <div className="font-mono text-xs mt-1 text-primary truncate flex items-center gap-1">
                          {selectedAsset?.All_Time_High ? `₹${num(selectedAsset?.All_Time_High)}` : 'N/A'}
                          {selectedAsset?.ATH_Source === '52W' && (
                            <span className="text-[8px] text-sub border border-border px-1 py-0.5 rounded-sm leading-none mt-px" title="True ATH data unavailable; falling back to 52W high">52W</span>
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="font-mono text-[10px] text-muted uppercase">All-Time Low</div>
                        <div className="font-mono text-xs mt-1 text-primary truncate flex items-center gap-1">
                          {selectedAsset?.All_Time_Low ? `₹${num(selectedAsset?.All_Time_Low)}` : 'N/A'}
                          {selectedAsset?.ATL_Source === '52W' && (
                            <span className="text-[8px] text-sub border border-border px-1 py-0.5 rounded-sm leading-none mt-px" title="True ATL data unavailable; falling back to 52W low">52W</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Technical Snapshot */}
                  <div className="border border-border bg-card p-6 shadow-sm">
                    <h3 className="font-mono text-xs uppercase tracking-widest text-primary mb-4 border-b border-border pb-2 font-semibold">Technical Snapshot</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="font-mono text-[10px] text-muted uppercase">Tech Score</div>
                        <div className={`font-mono text-sm mt-1 font-semibold ${colorCode(selectedAsset?.Tech_Score)}`}>{num(selectedAsset?.Tech_Score)}</div>
                      </div>
                      <div>
                        <div className="font-mono text-[10px] text-muted uppercase">Conviction</div>
                        <div className="font-mono text-sm mt-1 text-primary font-semibold">{selectedAsset?.Conviction || 'N/A'}</div>
                      </div>
                      <div>
                        <div className="font-mono text-[10px] text-muted uppercase">RS Percentile</div>
                        <div className="font-mono text-sm mt-1 text-primary font-semibold">{selectedAsset?.RS_Percentile !== undefined ? `${num(selectedAsset?.RS_Percentile)}%` : 'N/A'}</div>
                      </div>
                      <div>
                        <div className="font-mono text-[10px] text-muted uppercase">RSI (14)</div>
                        <div className="font-mono text-sm mt-1 text-primary">{num(selectedAsset?.RSI_Value)}</div>
                      </div>
                      <div>
                        <div className="font-mono text-[10px] text-muted uppercase">ADX (14)</div>
                        <div className="font-mono text-sm mt-1 text-primary">{num(selectedAsset?.ADX_Value)}</div>
                      </div>
                      <div>
                        <div className="font-mono text-[10px] text-muted uppercase">MACD</div>
                        <div className="font-mono text-sm mt-1 text-primary">{num(selectedAsset?.MACD_Value)}</div>
                      </div>
                      <div>
                        <div className="font-mono text-[10px] text-muted uppercase">Supertrend</div>
                        <div className="font-mono text-sm mt-1 text-primary">{selectedAsset?.ST_Signal || 'N/A'}</div>
                      </div>
                      <div>
                        <div className="font-mono text-[10px] text-muted uppercase">Bull / Bear</div>
                        <div className="font-mono text-sm mt-1"><span className="text-green-600">{selectedAsset?.Bull_Count ?? '-'}</span> <span className="text-muted">/</span> <span className="text-red-600">{selectedAsset?.Bear_Count ?? '-'}</span></div>
                      </div>
                    </div>
                  </div>

                  {/* Research Snapshot */}
                  <div className="border border-border bg-card p-6 shadow-sm">
                    <h3 className="font-mono text-xs uppercase tracking-widest text-brand mb-4 border-b border-border pb-2 font-semibold flex items-center justify-between">
                      Research Factors
                      <span className={`font-mono text-sm ${Number(selectedAsset?.Research_Score) >= 7 ? 'text-green-600 dark:text-green-500' : Number(selectedAsset?.Research_Score) < 4 ? 'text-red-600 dark:text-red-500' : 'text-primary'}`}>
                        {num(selectedAsset?.Research_Score)}/10
                      </span>
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="font-mono text-[10px] text-muted uppercase">Piotroski F-Score</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`font-mono text-sm font-semibold ${Number(selectedAsset?.Piotroski_F) >= 7 ? 'text-green-600 dark:text-green-500' : Number(selectedAsset?.Piotroski_F) <= 3 ? 'text-red-600 dark:text-red-500' : 'text-primary'}`}>{selectedAsset?.Piotroski_F ?? '-'}/9</span>
                        </div>
                      </div>
                      <div>
                        <div className="font-mono text-[10px] text-muted uppercase">Gross Profit</div>
                        <div className="font-mono text-sm mt-1 text-primary">{num(selectedAsset?.Gross_Profit_Score)}</div>
                      </div>
                      <div>
                        <div className="font-mono text-[10px] text-muted uppercase">Earnings Quality</div>
                        <div className="font-mono text-sm mt-1 text-primary">{num(selectedAsset?.Earnings_Quality)}</div>
                      </div>
                      <div>
                        <div className="font-mono text-[10px] text-muted uppercase">Z-Score (60D)</div>
                        <div className={`font-mono text-sm mt-1 font-semibold ${Number(selectedAsset?.Z_Score_60) > 2 ? 'text-red-600 dark:text-red-500' : Number(selectedAsset?.Z_Score_60) < -2 ? 'text-green-600 dark:text-green-500' : 'text-primary'}`}>{num(selectedAsset?.Z_Score_60)}</div>
                      </div>
                    </div>
                  </div>

                  {/* Momentum Snapshot */}
                  <div className="border border-border bg-card p-6 shadow-sm">
                    <h3 className="font-mono text-xs uppercase tracking-widest text-primary mb-4 border-b border-border pb-2 font-semibold">Momentum</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="font-mono text-[10px] text-muted uppercase">1 Month</div>
                        <div className={`font-mono text-sm mt-1 font-semibold ${colorCode(selectedAsset?.Momentum_1M)}`}>{selectedAsset?.Momentum_1M != null ? `${(selectedAsset.Momentum_1M * 100).toFixed(2)}%` : 'N/A'}</div>
                      </div>
                      <div>
                        <div className="font-mono text-[10px] text-muted uppercase">3 Month</div>
                        <div className={`font-mono text-sm mt-1 font-semibold ${colorCode(selectedAsset?.Momentum_3M)}`}>{selectedAsset?.Momentum_3M != null ? `${(selectedAsset.Momentum_3M * 100).toFixed(2)}%` : 'N/A'}</div>
                      </div>
                      <div>
                        <div className="font-mono text-[10px] text-muted uppercase">6 Month</div>
                        <div className={`font-mono text-sm mt-1 font-semibold ${colorCode(selectedAsset?.Momentum_6M)}`}>{selectedAsset?.Momentum_6M != null ? `${(selectedAsset.Momentum_6M * 100).toFixed(2)}%` : 'N/A'}</div>
                      </div>
                      <div>
                        <div className="font-mono text-[10px] text-muted uppercase">12 Month</div>
                        <div className={`font-mono text-sm mt-1 font-semibold ${colorCode(selectedAsset?.Momentum_12M)}`}>{selectedAsset?.Momentum_12M != null ? `${(selectedAsset.Momentum_12M * 100).toFixed(2)}%` : 'N/A'}</div>
                      </div>
                      <div className="col-span-2 pt-2 border-t border-border">
                        <div className="font-mono text-[10px] text-muted uppercase">Risk-Adjusted Mom</div>
                        <div className={`font-mono text-sm mt-1 font-semibold ${colorCode(selectedAsset?.Risk_Adj_Mom)}`}>{num(selectedAsset?.Risk_Adj_Mom)}</div>
                      </div>
                    </div>
                  </div>

                  {/* Fundamental Snapshot */}
                  <div className="border border-border bg-card p-6 shadow-sm">
                    <h3 className="font-mono text-xs uppercase tracking-widest text-primary mb-4 border-b border-border pb-2 font-semibold">Fundamentals</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="font-mono text-[10px] text-muted uppercase">Fund Score</div>
                        <div className={`font-mono text-sm mt-1 font-semibold ${Number(selectedAsset?.Fund_Score) >= 5 ? 'text-green-600 dark:text-green-500' : 'text-primary'}`}>{num(selectedAsset?.Fund_Score)}</div>
                      </div>
                      <div>
                        <div className="font-mono text-[10px] text-muted uppercase">Forward P/E</div>
                        <div className="font-mono text-sm mt-1 text-primary">{num(selectedAsset?.['Forward_P/E'])}</div>
                      </div>
                      <div>
                        <div className="font-mono text-[10px] text-muted uppercase">Debt to Eq</div>
                        <div className="font-mono text-sm mt-1 text-primary">{num(selectedAsset?.['Debt_to_Equity'])}</div>
                      </div>
                      <div>
                        <div className="font-mono text-[10px] text-muted uppercase">ROE %</div>
                        <div className="font-mono text-sm mt-1 text-primary">{num(selectedAsset?.['ROE_%'])}%</div>
                      </div>
                      <div>
                        <div className="font-mono text-[10px] text-muted uppercase">ROCE %</div>
                        <div className="font-mono text-sm mt-1 text-primary">{num(selectedAsset?.['ROCE_%'])}%</div>
                      </div>
                      <div>
                        <div className="font-mono text-[10px] text-muted uppercase">Promoter</div>
                        <div className="font-mono text-sm mt-1 text-primary">{num(selectedAsset?.['Promoter_Holding_%'])}%</div>
                      </div>
                    </div>
                  </div>

                  {/* Risk Metrics */}
                  <div className="border border-border bg-card p-6 shadow-sm">
                    <h3 className="font-mono text-xs uppercase tracking-widest text-primary mb-4 border-b border-border pb-2 font-semibold">Risk Metrics</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="font-mono text-[10px] text-muted uppercase">Volatility (60D)</div>
                        <div className={`font-mono text-sm mt-1 font-semibold ${Number(selectedAsset?.Vol_60D) < 25 ? 'text-green-600 dark:text-green-500' : Number(selectedAsset?.Vol_60D) > 40 ? 'text-red-600 dark:text-red-500' : 'text-primary'}`}>{num(selectedAsset?.Vol_60D)}%</div>
                      </div>
                      <div>
                        <div className="font-mono text-[10px] text-muted uppercase">Downside Dev</div>
                        <div className="font-mono text-sm mt-1 text-primary">{num(selectedAsset?.Downside_Dev)}%</div>
                      </div>
                      <div>
                        <div className="font-mono text-[10px] text-muted uppercase">Sharpe Ratio</div>
                        <div className={`font-mono text-sm mt-1 font-semibold ${colorCode(selectedAsset?.Sharpe)}`}>{num(selectedAsset?.Sharpe)}</div>
                      </div>
                      <div>
                        <div className="font-mono text-[10px] text-muted uppercase">Max Drawdown</div>
                        <div className="font-mono text-sm mt-1 text-red-600 dark:text-red-500">{num(selectedAsset?.['Max_Drawdown_%'])}%</div>
                      </div>
                      <div>
                        <div className="font-mono text-[10px] text-muted uppercase">Ann. Volatility</div>
                        <div className="font-mono text-sm mt-1 text-primary">{num(selectedAsset?.['Ann_Vol_%'])}%</div>
                      </div>
                      <div>
                        <div className="font-mono text-[10px] text-muted uppercase">Total Return</div>
                        <div className={`font-mono text-sm mt-1 font-semibold ${colorCode(selectedAsset?.['Total_Return_%'])}`}>{num(selectedAsset?.['Total_Return_%'])}%</div>
                      </div>
                    </div>
                  </div>

                </div>

                {/* Right Column: Charts & Peers */}
                <div className="w-full xl:w-3/4 flex flex-col gap-6">
                  
                  {/* Period & Interval Toggles */}
                  <div className="flex flex-col gap-2">
                    <label className="font-mono text-xs uppercase tracking-widest text-sub hidden sm:block">Timeframe</label>
                    <div className="flex flex-col sm:flex-row justify-start items-start sm:items-center gap-4">
                      <div className="flex bg-card border border-border p-1 rounded-sm shadow-sm w-fit">
                      {['1w', '1mo', '3mo', '6mo', '1y', '2y', '5y'].map(p => (
                        <button 
                          key={p}
                          onClick={() => setChartPeriod(p)}
                          className={`px-3 py-1.5 font-mono text-xs uppercase tracking-widest transition-all ${chartPeriod === p ? 'bg-brand text-white shadow-sm' : 'text-muted hover:text-primary'}`}
                        >
                          {p.replace('mo', 'M').replace('y', 'Y').replace('w', 'W')}
                        </button>
                      ))}
                    </div>

                    <div className="flex bg-card border border-border p-1 rounded-sm shadow-sm w-fit">
                       <button 
                          onClick={() => setChartInterval('1d')}
                          className={`px-3 py-1.5 font-mono text-xs uppercase tracking-widest transition-all ${chartInterval === '1d' ? 'bg-primary text-background shadow-sm' : 'text-muted hover:text-primary'}`}
                        >
                          Daily
                        </button>
                        <button 
                          onClick={() => setChartInterval('1wk')}
                          className={`px-3 py-1.5 font-mono text-xs uppercase tracking-widest transition-all ${chartInterval === '1wk' ? 'bg-primary text-background shadow-sm' : 'text-muted hover:text-primary'}`}
                        >
                          Weekly
                        </button>
                    </div>
                  </div>
                </div>

                {/* Chart Container */}
                  <div className="flex flex-col gap-6">
                    
                    {/* Main Price & Volume Chart */}
                    <div className="border border-border bg-card p-6 h-[450px] flex flex-col relative shadow-sm">
                      <div className="absolute top-4 left-6 font-mono text-xs text-primary/80 z-10 font-semibold bg-card/80 px-2 rounded backdrop-blur-sm">
                        {selectedTicker.replace('.NS', '')} — Price, SMAs & Volume
                      </div>
                      {chartLoading ? (
                        <div className="m-auto font-mono text-muted text-xs uppercase animate-pulse">Loading execution logic...</div>
                      ) : chartData.length > 0 ? (
                        <div style={{ width: '100%', height: '100%', minHeight: '350px' }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={chartData}>
                              <defs>
                                <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#C8102E" stopOpacity={isDark ? 0.3 : 0.1}/>
                                  <stop offset="95%" stopColor="#C8102E" stopOpacity={0}/>
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#1A1A1A" : "#e2e8f0"} vertical={false} />
                              <XAxis 
                                dataKey="time" 
                                stroke={isDark ? "#52525B" : "#94a3b8"} 
                                tick={{fill: isDark ? '#71717A' : '#64748b', fontSize: 10, fontFamily: 'Space Mono'}}
                                tickMargin={10}
                                minTickGap={30}
                              />
                              <YAxis 
                                yAxisId="price"
                                domain={['auto', 'auto']} 
                                stroke={isDark ? "#52525B" : "#94a3b8"} 
                                tick={{fill: isDark ? '#71717A' : '#64748b', fontSize: 10, fontFamily: 'Space Mono'}}
                                width={50}
                              />
                              <YAxis 
                                yAxisId="volume"
                                orientation="right"
                                domain={[0, dataMax => dataMax * 4]} 
                                hide={true}
                              />
                              <Tooltip 
                                contentStyle={{backgroundColor: isDark ? '#0A0A0A' : '#ffffff', borderColor: isDark ? '#27272A' : '#e2e8f0', fontFamily: 'Space Mono', fontSize: '12px', color: isDark ? '#fff' : '#0f172a'}}
                                itemStyle={{color: isDark ? '#FFFFFF' : '#0f172a'}}
                                labelStyle={{color: isDark ? '#A1A1AA' : '#64748b', marginBottom: '5px'}}
                              />
                              <Legend verticalAlign="top" height={36} align="right" wrapperStyle={{fontFamily: 'Space Mono', fontSize: '10px', color: isDark ? '#71717A' : '#64748b'}}/>
                              
                              <Bar yAxisId="volume" name="Volume" dataKey="volume" fill={isDark ? "#3F3F46" : "#cbd5e1"} maxBarSize={6} />
                              <Area yAxisId="price" type="monotone" name="Close" dataKey="close" stroke="#C8102E" strokeWidth={2} fillOpacity={1} fill="url(#colorPrice)" />
                              <Line yAxisId="price" type="monotone" name="SMA 50" dataKey="sma50" stroke="#3B82F6" strokeWidth={1} dot={false} />
                              <Line yAxisId="price" type="monotone" name="SMA 200" dataKey="sma200" stroke="#F59E0B" strokeWidth={1} dot={false} strokeDasharray="5 5" />
                            </ComposedChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <div className="m-auto font-mono text-muted text-xs uppercase">No chart data for {selectedTicker}</div>
                      )}
                    </div>

                    {/* Subchart: RSI */}
                    <div className="border border-border bg-card p-6 h-[200px] flex flex-col relative shadow-sm">
                       <div className="absolute top-4 left-6 font-mono text-xs text-primary/80 z-10 font-semibold bg-card/80 px-2 rounded backdrop-blur-sm">
                        RSI (14)
                      </div>
                      {chartData.length > 0 && !chartLoading && (
                        <div style={{ width: '100%', height: '100%', minHeight: '120px' }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={chartData}>
                              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#1A1A1A" : "#e2e8f0"} vertical={false} />
                              <XAxis dataKey="time" hide={true} />
                              <YAxis domain={[0, 100]} ticks={[30, 70]} stroke={isDark ? "#52525B" : "#94a3b8"} tick={{fill: isDark ? '#71717A' : '#64748b', fontSize: 10, fontFamily: 'Space Mono'}} width={50} />
                              <Tooltip contentStyle={{backgroundColor: isDark ? '#0A0A0A' : '#ffffff', borderColor: isDark ? '#27272A' : '#e2e8f0', fontFamily: 'Space Mono', fontSize: '12px', color: isDark ? '#fff' : '#0f172a'}} />
                              <Line type="monotone" dataKey="rsi" stroke="#A855F7" strokeWidth={1.5} dot={false} />
                              <Line type="step" dataKey={() => 70} stroke={isDark ? "#52525B" : "#94a3b8"} strokeDasharray="3 3" dot={false} activeDot={false} />
                              <Line type="step" dataKey={() => 30} stroke={isDark ? "#52525B" : "#94a3b8"} strokeDasharray="3 3" dot={false} activeDot={false} />
                            </ComposedChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Score Breakdown */}
                  {selectedAsset && (
                    <div className="border border-border bg-card p-6 shadow-sm">
                      <h3 className="font-mono text-xs uppercase tracking-widest text-brand mb-4 border-b border-border pb-2 font-semibold">Score Breakdown</h3>
                      <div className="space-y-2">
                        {scoreBar('Composite', Number(selectedAsset.Composite_Score) || 0)}
                        {scoreBar('Tech', Number(selectedAsset.Tech_Score) || 0)}
                        {scoreBar('Fund', Number(selectedAsset.Fund_Score) || 0)}
                        {scoreBar('Research', Number(selectedAsset.Research_Score) || 0)}
                        <div className="border-t border-border pt-2 mt-2">
                          {scoreBar('Piotroski', (Number(selectedAsset.Piotroski_F) || 0) * 10 / 9)}
                          {scoreBar('Gross Profit', Number(selectedAsset.Gross_Profit_Score) || 0)}
                          {scoreBar('Earnings Q', Number(selectedAsset.Earnings_Quality) || 0)}
                          {scoreBar('Volatility', Number(selectedAsset.Vol_60D) < 50 ? 10 - (Number(selectedAsset.Vol_60D) || 0) / 5 : 0)}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Peer Comparison */}
                  <div className="border border-border bg-card mt-4 shadow-sm rounded-sm">
                    <div className="p-6 border-b border-border bg-black/5 dark:bg-black/20">
                      <h3 className="font-display font-semibold text-xl tracking-wide text-primary">Sector Peer Comparison</h3>
                      <p className="font-mono text-xs text-sub mt-1">Comparing {selectedAsset?.Sector} by Market Cap</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left font-mono text-xs">
                        <thead>
                          <tr className="border-b border-border text-sub uppercase tracking-widest">
                            <th className="p-4 font-semibold">Ticker</th>
                            <th className="p-4 font-semibold text-right">Mkt Cap</th>
                            <th className="p-4 font-semibold text-right">Composite</th>
                            <th className="p-4 font-semibold text-right">Tech</th>
                            <th className="p-4 font-semibold text-right">Fund</th>
                            <th className="p-4 font-semibold text-right">Research</th>
                            <th className="p-4 font-semibold text-right">P/E</th>
                            <th className="p-4 font-semibold text-right">F-Score</th>
                            <th className="p-4 font-semibold text-right">Conviction</th>
                          </tr>
                        </thead>
                        <tbody>
                          {peerGroup.length > 0 ? peerGroup.map((row, i) => (
                            <tr 
                              key={i} 
                              onClick={() => setSelectedTicker(row.Ticker)}
                              className={`border-b border-border cursor-pointer transition-colors duration-200 ${row.Ticker === selectedTicker ? 'bg-brand/10 dark:bg-brand/20 border-l-2 border-l-brand' : 'hover:bg-black/5 dark:hover:bg-white/5'}`}
                            >
                              <td className="p-4 text-primary font-medium">{row.Ticker.replace('.NS', '')}</td>
                              <td className="p-4 text-right text-muted">{num(row.Market_Cap_B)}B</td>
                              <td className={`p-4 text-right font-medium ${colorCode(row.Composite_Score)}`}>{num(row.Composite_Score)}</td>
                              <td className={`p-4 text-right font-medium ${colorCode(row.Tech_Score)}`}>{num(row.Tech_Score)}</td>
                              <td className={`p-4 text-right font-medium ${Number(row.Fund_Score) >= 5 ? 'text-green-600 dark:text-green-500' : 'text-primary'}`}>{num(row.Fund_Score)}</td>
                              <td className={`p-4 text-right font-medium ${Number(row.Research_Score) >= 7 ? 'text-green-600 dark:text-green-500' : 'text-primary'}`}>{num(row.Research_Score)}</td>
                              <td className="p-4 text-right text-muted">{num(row['P/E'])}</td>
                              <td className={`p-4 text-right font-medium ${Number(row.Piotroski_F) >= 7 ? 'text-green-600 dark:text-green-500' : 'text-primary'}`}>{row.Piotroski_F ?? '-'}</td>
                              <td className="p-4 text-right text-primary font-medium">{row.Conviction || 'N/A'}</td>
                            </tr>
                          )) : (
                            <tr><td colSpan={9} className="p-4 text-center text-muted">No peers found in {selectedAsset?.Sector}</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                </div>
              </div>
            )}

            {/* VIEW: SECTOR HEATMAP */}
            {activeTab === 'heatmap' && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-6 w-1 bg-brand rounded-full"></div>
                  <h2 className="font-display font-bold text-xl tracking-wide text-primary">Sector Heatmap</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {Object.keys(sectorMap).map(sector => (
                    <div key={sector} className="border border-border bg-card p-6 shadow-sm hover:border-brand/50 transition-colors">
                      <h3 className="font-mono text-sm text-primary uppercase tracking-widest mb-4 border-b border-border pb-2 font-semibold">
                        {sector}
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {sectorMap[sector].map(stock => {
                          const s = Number(stock.Composite_Score || 0)
                          const isHigh = s >= 6.5
                          const isLow = s <= 3.5
                          const bg = isHigh ? 'bg-green-600/10 dark:bg-green-500/10 text-green-600 dark:text-green-500 border-green-600/30 dark:border-green-500/30 hover:bg-green-600/20 hover:border-green-600 font-medium' : 
                                     isLow ? 'bg-red-600/10 dark:bg-red-500/10 text-red-600 dark:text-red-500 border-red-600/30 dark:border-red-500/30 hover:bg-red-600/20 hover:border-red-600 font-medium' : 
                                     'bg-amber-600/10 dark:bg-amber-500/10 text-amber-600 dark:text-amber-500 border-amber-600/30 dark:border-amber-500/30 hover:bg-amber-600/20 hover:border-amber-600 font-medium'
                          return (
                            <div 
                              key={stock.Ticker} 
                              onClick={() => handleHeatmapClick(stock.Ticker)}
                              className={`font-mono text-[10px] uppercase tracking-wider px-3 py-2 border transition-all duration-200 cursor-pointer ${bg}`} 
                              title={`Score: ${s.toFixed(2)} | Click to view chart`}
                            >
                              {stock.Ticker.replace('.NS', '')}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-12 py-6 px-6 bg-card">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-4">
            <span className="font-mono text-[10px] text-muted uppercase tracking-widest">
              <Activity size={10} className="inline mr-1" />{lastUpdated || 'Not loaded'}
              {isDynamic && <span className="text-brand ml-1">Live</span>}
            </span>
            <span className="h-3 w-px bg-border"></span>
            <span className="font-mono text-[10px] text-muted uppercase tracking-widest">
              Static JSON • NSE Bhav Copy
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="font-mono text-[10px] text-sub leading-relaxed max-w-lg">
              Educational purposes only. Not financial advice. Alpha Research & Investment Club, FMS Delhi.
            </span>
            <span className="h-3 w-px bg-border hidden md:block"></span>
            <span className="font-mono text-[10px] text-sub uppercase tracking-widest whitespace-nowrap">Made with &#9829;</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
