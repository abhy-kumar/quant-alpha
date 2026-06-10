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
  Price: number
  Prev_Close: number
  RSI_Value: number
  MACD_Value: number
  ADX_Value: number
  ST_Signal: string
  Tech_Score: number
  Fund_Score: number
  Conviction: string
  Scan_Time: string
  "1d_Chg_%"?: number
  "P/E"?: number
  "Forward_P/E"?: number
  "Debt_to_Equity"?: number
  "ROE_%"?: number
  "Div_Yield_%"?: number
  "Market_Cap_B"?: number
  "52W_High"?: number
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
}

// Diagnostics removed, using static JSON
const STATIC_URL = '/market_data.json'

export default function App() {
  const [data, setData] = useState<DashboardData[]>([])
  const [lastUpdated, setLastUpdated] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [niftyData, setNiftyData] = useState<{price: number, change_pct: number, is_up: boolean} | null>(null)
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
      }
    } catch(err) {
       console.error("Failed to fetch live data", err)
    }
  }

  // Fetch static data
  const fetchData = async () => {
    try {
      const res = await axios.get(STATIC_URL)
      
      if (res.data.status === 'ok' && res.data.data.length > 0) {
        setData(res.data.data)
        setLastUpdated(res.data.last_updated || 'Unknown')
        if (res.data.nifty_50) setNiftyData(res.data.nifty_50)
        setIsDynamic(res.data.is_dynamic || false)
        if (!selectedTicker) setSelectedTicker(res.data.data[0].Ticker)
        setLoading(false)
        return true
      }
    } catch (err) {
      console.error("Failed to load static market data:", err)
    }
    setLoading(false)
    return false
  }

  useEffect(() => {
    const init = async () => {
      const success = await fetchData()
      if (success) {
        // After loading static data, fetch the very latest prices
        setTimeout(() => fetchLiveData(), 1000)
      }
    }
    init()
    
    const intervalId = setInterval(() => {
      fetchLiveData()
    }, 3 * 60 * 1000) // Poll API every 3 minutes
    
    return () => clearInterval(intervalId)
  }, [])

  // Fetch chart data via Vercel Serverless Function
  useEffect(() => {
    if (!selectedTicker) return
    const fetchChart = async () => {
      setChartLoading(true)
      try {
        const res = await axios.get(`/api/chart?ticker=${selectedTicker}&period=${chartPeriod}&interval=${chartInterval}`)
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
    let filtered = [...data]
    if (horizon === 'short') {
      filtered = filtered.filter(d => {
        const fund = Number(d.Fund_Score)
        return isNaN(fund) || d.Fund_Score === ("" as any) || fund >= 5
      }).sort((a, b) => Number(b.Tech_Score) - Number(a.Tech_Score))
    } else {
      filtered = filtered.filter(d => {
        const tech = Number(d.Tech_Score)
        return !isNaN(tech) && tech > 0
      }).sort((a, b) => {
        const fa = Number(a.Fund_Score) || 0
        const fb = Number(b.Fund_Score) || 0
        return fb - fa
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

  return (
    <div className="min-h-screen flex flex-col transition-colors duration-300">
      {/* Header */}
      <header className="border-b border-border py-6 px-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card">
        <div>
          <h1 className="font-display font-semibold text-2xl uppercase tracking-wider text-primary">
            Quantitative <span className="text-brand">Alpha</span>
          </h1>
          <div className="font-mono text-[10px] text-sub tracking-widest mt-2 uppercase flex flex-col sm:flex-row sm:items-center gap-2">
            <span>Alpha Research & Investment Club | FMS Delhi</span>
            {niftyData && (
              <span className={`px-2 py-0.5 rounded-sm bg-card border border-border font-semibold flex items-center gap-1 w-fit ${niftyData.is_up ? 'text-green-600 dark:text-green-500' : 'text-red-600 dark:text-red-500'}`}>
                NIFTY 50: {niftyData.price} ({niftyData.change_pct > 0 ? '+' : ''}{niftyData.change_pct}%)
              </span>
            )}
          </div>
        </div>
        
        <div className="flex gap-2 items-center">
          {[
            { id: 'picks', label: 'Top Signals', icon: TrendingUp },
            { id: 'fundamentals', label: 'Screening', icon: Database },
            { id: 'charting', label: 'Charting', icon: BarChart2 },
            { id: 'heatmap', label: 'Sector Heatmap', icon: Layers }
          ].map(tab => (
            <button 
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 font-mono text-xs uppercase tracking-widest transition-all duration-300 ${activeTab === tab.id ? 'bg-primary text-background shadow-md' : 'border border-btn-border text-muted hover:text-primary hover:border-primary'}`}
            >
              <tab.icon size={14} /> <span className="hidden md:inline">{tab.label}</span>
            </button>
          ))}
          <button 
            onClick={() => setIsDark(!isDark)}
            className="ml-2 p-2 border border-btn-border text-muted hover:text-primary hover:border-primary transition-colors rounded-sm"
            title="Toggle Theme"
          >
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow p-10 max-w-7xl mx-auto w-full">
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
            </div>
          </div>
        ) : (
          <div className="animate-in fade-in duration-500">
            
            {/* VIEW: TOP PICKS */}
            {activeTab === 'picks' && (
              <div className="space-y-12">
                <section className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-1.5 bg-brand rounded-full shadow-[0_0_10px_rgba(225,29,72,0.5)]"></div>
                      <h2 className="font-display font-bold text-3xl tracking-wide text-primary flex items-center gap-4">
                        High Conviction Signals
                        <span className="flex h-2.5 w-2.5 relative">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-brand"></span>
                        </span>
                      </h2>
                    </div>
                    <p className="font-mono text-muted text-sm max-w-2xl pl-4 border-l-2 border-border/60">
                      Top 3 algorithmic picks automatically ranked by your selected investment horizon.
                    </p>
                  </div>
                  
                  <div className="flex bg-card border border-border p-1 rounded-sm shadow-sm">
                    <button 
                      onClick={() => setHorizon('short')}
                      className={`px-4 py-2 font-mono text-xs uppercase tracking-widest transition-all ${horizon === 'short' ? 'bg-brand text-white shadow-sm' : 'text-muted hover:text-primary'}`}
                    >
                      Short Term
                    </button>
                    <button 
                      onClick={() => setHorizon('long')}
                      className={`px-4 py-2 font-mono text-xs uppercase tracking-widest transition-all ${horizon === 'long' ? 'bg-brand text-white shadow-sm' : 'text-muted hover:text-primary'}`}
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
                      className="p-8 border border-border bg-card shadow-sm hover:shadow-md hover:border-brand/50 transition-all duration-300 cursor-pointer group"
                    >
                      <div className="font-mono text-[10px] text-sub uppercase tracking-widest mb-4 group-hover:text-brand transition-colors">
                        Pick 0{i + 1} • {horizon === 'short' ? 'Momentum' : 'Value'}
                      </div>
                      <h3 className="font-display font-semibold text-2xl mb-1 text-primary">{stock.Ticker.replace('.NS', '')}<span className="text-brand">.</span></h3>
                      <div className="font-mono text-xs text-brand tracking-widest mb-6 uppercase">
                        {stock.Sector || 'Equities'}
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 font-mono text-xs border-t border-border pt-4 mt-4">
                        <div className="flex flex-col gap-1">
                          <span className="text-muted">Tech Score</span>
                          <span className={`text-lg font-semibold ${colorCode(stock.Tech_Score)}`}>{num(stock.Tech_Score)}</span>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-muted">Fund Score</span>
                          <span className={`text-lg font-semibold ${Number(stock.Fund_Score) >= 5 ? 'text-green-600 dark:text-green-500' : 'text-primary'}`}>{num(stock.Fund_Score)}/10</span>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-muted">P/E Ratio</span>
                          <span className="text-primary">{num(stock['P/E'])}</span>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-muted">ROE %</span>
                          <span className="text-primary">{num(stock['ROE_%'])}%</span>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-muted">Market Cap</span>
                          <span className="text-primary">{num(stock.Market_Cap_B)}B</span>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-muted">Conviction</span>
                          <span className="text-primary font-medium">{stock.Conviction || 'N/A'}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* VIEW: FUNDAMENTALS & SCREENING */}
            {activeTab === 'fundamentals' && (
              <div className="space-y-6">
                <h2 className="font-display font-semibold text-2xl tracking-wide text-primary">Raw Telemetry</h2>
                <div className="overflow-x-auto border border-border bg-card shadow-sm rounded-sm">
                  <table className="w-full text-left font-mono text-xs">
                    <thead>
                      <tr className="border-b border-border text-sub uppercase tracking-widest bg-black/5 dark:bg-black/50">
                        <th className="p-4 font-semibold">Ticker</th>
                        <th className="p-4 font-semibold">Sector</th>
                        <th className="p-4 font-semibold text-right">LTP</th>
                        <th className="p-4 font-semibold text-right">Tech Score</th>
                        <th className="p-4 font-semibold text-right">Fund Score</th>
                        <th className="p-4 font-semibold text-right">P/E</th>
                        <th className="p-4 font-semibold text-right">Fwd P/E</th>
                        <th className="p-4 font-semibold text-right">Debt/Eq</th>
                        <th className="p-4 font-semibold text-right">Conviction</th>
                        <th className="p-4"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.map((row, i) => (
                        <React.Fragment key={i}>
                          <tr 
                            className={`border-b border-border hover:bg-black/5 dark:hover:bg-white/5 transition-colors duration-200 ${expandedRow === row.Ticker ? 'bg-black/5 dark:bg-white/5' : ''}`}
                          >
                            <td className="p-4 text-primary font-medium cursor-pointer" onClick={() => handleHeatmapClick(row.Ticker)}>{row.Ticker.replace('.NS', '')}</td>
                            <td className="p-4 text-muted">{row.Sector || '-'}</td>
                            <td className="p-4 text-right text-muted">{num(row.Price)}</td>
                            <td className={`p-4 text-right font-medium ${colorCode(row.Tech_Score)}`}>{num(row.Tech_Score)}</td>
                            <td className={`p-4 text-right font-medium ${Number(row.Fund_Score) >= 5 ? 'text-green-600 dark:text-green-500' : 'text-primary'}`}>{num(row.Fund_Score)}</td>
                            <td className="p-4 text-right text-muted">{num(row['P/E'])}</td>
                            <td className="p-4 text-right text-muted">{num(row['Forward_P/E'])}</td>
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
                              <td colSpan={10} className="p-6">
                                <h4 className="font-mono text-[10px] uppercase tracking-widest text-brand mb-4">Algorithmic Signal Breakdown</h4>
                                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6 font-mono text-xs">
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
                    <div className="flex items-center gap-4 bg-card border border-border px-4 py-3 hover:border-brand/50 transition-colors shadow-sm">
                      <Search size={14} className="text-muted" />
                      <select 
                        className="bg-transparent text-primary font-mono text-sm uppercase outline-none cursor-pointer w-full"
                        value={selectedTicker}
                        onChange={e => setSelectedTicker(e.target.value)}
                      >
                        {data.map(d => <option key={d.Ticker} value={d.Ticker} className="bg-card">{d.Ticker}</option>)}
                      </select>
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
                                domain={[0, 'dataMax * 4']} 
                                hide={true}
                              />
                              <Tooltip 
                                contentStyle={{backgroundColor: isDark ? '#0A0A0A' : '#ffffff', borderColor: isDark ? '#27272A' : '#e2e8f0', fontFamily: 'Space Mono', fontSize: '12px', color: isDark ? '#fff' : '#0f172a'}}
                                itemStyle={{color: isDark ? '#FFFFFF' : '#0f172a'}}
                                labelStyle={{color: isDark ? '#A1A1AA' : '#64748b', marginBottom: '5px'}}
                              />
                              <Legend verticalAlign="top" height={36} align="right" wrapperStyle={{fontFamily: 'Space Mono', fontSize: '10px', color: isDark ? '#71717A' : '#64748b'}}/>
                              
                              <Bar yAxisId="volume" name="Volume" dataKey="volume" fill={isDark ? "#27272A" : "#e2e8f0"} barSize={4} />
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
                            <th className="p-4 font-semibold text-right">Market Cap</th>
                            <th className="p-4 font-semibold text-right">Tech Score</th>
                            <th className="p-4 font-semibold text-right">Fund Score</th>
                            <th className="p-4 font-semibold text-right">P/E</th>
                            <th className="p-4 font-semibold text-right">Debt/Eq</th>
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
                              <td className={`p-4 text-right font-medium ${colorCode(row.Tech_Score)}`}>{num(row.Tech_Score)}</td>
                              <td className={`p-4 text-right font-medium ${Number(row.Fund_Score) >= 5 ? 'text-green-600 dark:text-green-500' : 'text-primary'}`}>{num(row.Fund_Score)}</td>
                              <td className="p-4 text-right text-muted">{num(row['P/E'])}</td>
                              <td className="p-4 text-right text-muted">{num(row['Debt_to_Equity'])}</td>
                              <td className="p-4 text-right text-primary font-medium">{row.Conviction || 'N/A'}</td>
                            </tr>
                          )) : (
                            <tr><td colSpan={7} className="p-4 text-center text-muted">No peers found in {selectedAsset?.Sector}</td></tr>
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
              <div className="space-y-6">
                <h2 className="font-display font-semibold text-2xl tracking-wide text-primary/90">Sector Dispersion</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {Object.keys(sectorMap).map(sector => (
                    <div key={sector} className="border border-border bg-card p-6 shadow-sm hover:border-brand/50 transition-colors">
                      <h3 className="font-mono text-sm text-primary uppercase tracking-widest mb-4 border-b border-border pb-2 font-semibold">
                        {sector}
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {sectorMap[sector].map(stock => {
                          const s = Number(stock.Tech_Score)
                          const isPos = s > 0
                          const isNeg = s < 0
                          const bg = isPos ? 'bg-green-600/10 dark:bg-green-500/10 text-green-600 dark:text-green-500 border-green-600/30 dark:border-green-500/30 hover:bg-green-600/20 hover:border-green-600 font-medium' : 
                                     isNeg ? 'bg-red-600/10 dark:bg-red-500/10 text-red-600 dark:text-red-500 border-red-600/30 dark:border-red-500/30 hover:bg-red-600/20 hover:border-red-600 font-medium' : 
                                     'bg-btn-border text-muted border-transparent hover:border-primary/30 hover:text-primary font-medium'
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
      <footer className="border-t border-border mt-12 py-12 px-10 bg-card">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-12 items-start">
          
          <div className="flex flex-col gap-6 w-full max-w-xs opacity-80">
            <div className="flex flex-col gap-2 border border-border bg-card p-4 rounded-sm shadow-sm">
              <h4 className="font-mono text-brand text-xs uppercase tracking-widest font-bold">System Status</h4>
              <div className="flex justify-between text-xs font-mono uppercase tracking-wider text-muted mt-2">
                <span className="flex items-center gap-2"><Database size={12} /> Database</span>
                <span className="text-primary">Static JSON</span>
              </div>
              <div className="flex justify-between text-xs font-mono uppercase tracking-wider text-muted border-t border-border/50 pt-2">
                <span className="flex items-center gap-2"><Activity size={12} /> Last Updated</span>
                <span className="text-primary text-right flex flex-col items-end">
                  {lastUpdated} 
                  {isDynamic && <span className="text-[10px] text-brand ml-1">(Dynamic)</span>}
                </span>
              </div>
            </div>
          </div>

          <div>
            <h4 className="font-display font-semibold text-lg mb-4 uppercase text-primary">Disclaimer</h4>
            <p className="font-mono text-xs text-sub leading-relaxed">
              This platform is for educational purposes only and does not constitute financial advice. 
              The models and signals provided are experimental. Always consult a certified financial advisor before making investment decisions. 
              Alpha Research and Investment Club, FMS Delhi is not responsible for any trading losses incurred.
            </p>
          </div>

          <div className="text-right flex flex-col pt-2 h-full">
             <p className="font-mono text-xs text-muted">Alpha Research and Investment Club<br/>FMS Delhi</p>
             <p className="font-mono text-[10px] text-sub mt-4 tracking-widest uppercase">Made with &hearts; by Abhishek Kumar</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
