import { useEffect, useState, useMemo } from 'react'
import axios from 'axios'
import { Activity, Database, TrendingUp, BarChart2, Layers, Search, AlertCircle } from 'lucide-react'
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
  LTP: number
  Prev_Close: number
  RSI: number
  MACD_Hist: number
  BB_Pos: number
  Tech_Score: number
  Fund_Score: number
  Conviction: string
  Scan_Time: string
  // Fundamental data from scanner.py
  "P/E"?: number
  "Fwd_P/E"?: number
  "Debt/Eq"?: number
  "ROE_%"?: number
  "Div_Yield_%"?: number
  "Market_Cap_B"?: number
}

interface Diagnostics {
  database: { status: string; message: string; type: string }
  scans: { ok: number; failed: number }
}

const API_BASE = 'http://localhost:8000/api'

export default function App() {
  const [data, setData] = useState<DashboardData[]>([])
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'picks' | 'fundamentals' | 'charting' | 'heatmap'>('picks')
  
  // Toggles
  const [horizon, setHorizon] = useState<'short' | 'long'>('short')

  // Charting state
  const [selectedTicker, setSelectedTicker] = useState<string>('')
  const [chartData, setChartData] = useState<any[]>([])
  const [chartLoading, setChartLoading] = useState(false)

  // Fetch initial data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [dashRes, diagRes] = await Promise.all([
          axios.get(`${API_BASE}/dashboard`),
          axios.get(`${API_BASE}/diagnostics`)
        ])
        
        if (dashRes.data.status === 'ok') {
          setData(dashRes.data.data)
          if (dashRes.data.data.length > 0) {
            setSelectedTicker(dashRes.data.data[0].Ticker)
          }
        }
        setDiagnostics(diagRes.data)
      } catch (err) {
        console.error("Failed to fetch data:", err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  // Fetch chart data when ticker changes
  useEffect(() => {
    if (!selectedTicker) return
    const fetchChart = async () => {
      setChartLoading(true)
      try {
        const res = await axios.get(`${API_BASE}/chart/${selectedTicker}`)
        setChartData(res.data.data)
      } catch (err) {
        console.error("Chart fetch failed", err)
      } finally {
        setChartLoading(false)
      }
    }
    fetchChart()
  }, [selectedTicker])

  // Sorting Logic for Top Picks (Short Term vs Long Term)
  const topPicks = useMemo(() => {
    let filtered = [...data]
    
    if (horizon === 'short') {
      // Short Term: Rank by Tech Score (Momentum), ensure Fund Score >= 5
      filtered = filtered.filter(d => {
        const fund = Number(d.Fund_Score)
        return isNaN(fund) || d.Fund_Score === ("" as any) || fund >= 5
      }).sort((a, b) => Number(b.Tech_Score) - Number(a.Tech_Score))
    } else {
      // Long Term: Rank by Fund Score (Value), ensure Tech Score > 0
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

  // Sector grouping for Heatmap
  const sectorMap = useMemo(() => {
    const map: Record<string, DashboardData[]> = {}
    data.forEach(d => {
      const s = d.Sector || 'Unknown'
      if (!map[s]) map[s] = []
      map[s].push(d)
    })
    return map
  }, [data])

  // Helpers
  const num = (val: any) => (!isNaN(Number(val)) && val !== "" && val !== null ? Number(val).toFixed(1) : '-')
  const colorCode = (val: any) => (Number(val) > 0 ? 'text-green-500' : Number(val) < 0 ? 'text-red-500' : 'text-primary')

  const handleHeatmapClick = (ticker: string) => {
    setSelectedTicker(ticker)
    setActiveTab('charting')
  }

  return (
    <div className="min-h-screen flex flex-col transition-colors">
      {/* Header */}
      <header className="border-b border-border py-6 px-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="font-display text-2xl uppercase tracking-wider text-primary/90">
            Quantitative <span className="text-brand">Alpha</span>
          </h1>
          <p className="font-mono text-[10px] text-sub tracking-widest mt-1 uppercase">
            Alpha Research & Investment Club | FMS Delhi
          </p>
        </div>
        
        {/* Navigation Tabs */}
        <div className="flex gap-2">
          {[
            { id: 'picks', label: 'Top Signals', icon: TrendingUp },
            { id: 'fundamentals', label: 'Screening', icon: Database },
            { id: 'charting', label: 'Charting', icon: BarChart2 },
            { id: 'heatmap', label: 'Sector Heatmap', icon: Layers }
          ].map(tab => (
            <button 
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 font-mono text-xs uppercase tracking-widest transition-all duration-300 ${activeTab === tab.id ? 'bg-primary text-background shadow-[0_0_15px_rgba(255,255,255,0.1)]' : 'border border-btn-border text-muted hover:text-primary hover:border-primary'}`}
            >
              <tab.icon size={14} /> <span className="hidden md:inline">{tab.label}</span>
            </button>
          ))}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow p-10 max-w-7xl mx-auto w-full">
        {loading ? (
          <div className="flex items-center justify-center h-64 font-mono text-muted text-sm uppercase">
            Fetching telemetry...
          </div>
        ) : data.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 font-mono text-muted text-sm uppercase gap-4">
            <AlertCircle size={32} className="text-sub" />
            <div>No scan data available. Check backend logs or run scan.</div>
          </div>
        ) : (
          <div className="animate-in fade-in duration-500">
            
            {/* VIEW: TOP PICKS */}
            {activeTab === 'picks' && (
              <div className="space-y-12">
                <section className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                  <div>
                    <h2 className="font-display text-3xl mb-2 tracking-wide text-primary/90">
                      High Conviction Signals
                    </h2>
                    <p className="font-mono text-muted text-sm max-w-2xl mt-2">
                      Top 3 algorithmic picks automatically ranked by your selected investment horizon.
                    </p>
                  </div>
                  
                  {/* Horizon Toggle */}
                  <div className="flex bg-card border border-border p-1 rounded-sm">
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
                      className="p-8 border border-border bg-card hover:border-primary/50 transition-colors duration-300 cursor-pointer group"
                    >
                      <div className="font-mono text-[10px] text-sub uppercase tracking-widest mb-4 group-hover:text-primary/70 transition-colors">
                        Pick 0{i + 1} • {horizon === 'short' ? 'Momentum' : 'Value'}
                      </div>
                      <h3 className="font-display text-2xl mb-1 text-primary/90">{stock.Ticker.replace('.NS', '')}<span className="text-brand">.</span></h3>
                      <div className="font-mono text-xs text-brand tracking-widest mb-6 uppercase">
                        {stock.Sector || 'Equities'}
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 font-mono text-xs border-t border-border pt-4 mt-4">
                        <div className="flex flex-col gap-1">
                          <span className="text-muted">Tech Score</span>
                          <span className={`text-lg ${colorCode(stock.Tech_Score)}`}>{num(stock.Tech_Score)}</span>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-muted">Fund Score</span>
                          <span className={`text-lg ${Number(stock.Fund_Score) >= 5 ? 'text-green-500' : 'text-primary'}`}>{num(stock.Fund_Score)}/10</span>
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
                          <span className="text-primary">{stock.Conviction || '-'}</span>
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
                <h2 className="font-display text-2xl tracking-wide text-primary/90">Raw Telemetry</h2>
                <div className="overflow-x-auto border border-border bg-card">
                  <table className="w-full text-left font-mono text-xs">
                    <thead>
                      <tr className="border-b border-border text-sub uppercase tracking-widest bg-black/50">
                        <th className="p-4 font-normal">Ticker</th>
                        <th className="p-4 font-normal">Sector</th>
                        <th className="p-4 font-normal text-right">LTP</th>
                        <th className="p-4 font-normal text-right">Tech Score</th>
                        <th className="p-4 font-normal text-right">Fund Score</th>
                        <th className="p-4 font-normal text-right">P/E</th>
                        <th className="p-4 font-normal text-right">Conviction</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.map((row, i) => (
                        <tr 
                          key={i} 
                          onClick={() => handleHeatmapClick(row.Ticker)}
                          className="border-b border-border hover:bg-btn-border cursor-pointer transition-colors duration-200"
                        >
                          <td className="p-4 text-primary font-medium">{row.Ticker.replace('.NS', '')}</td>
                          <td className="p-4 text-muted">{row.Sector || '-'}</td>
                          <td className="p-4 text-right text-muted">{num(row.LTP)}</td>
                          <td className={`p-4 text-right ${colorCode(row.Tech_Score)}`}>{num(row.Tech_Score)}</td>
                          <td className={`p-4 text-right ${Number(row.Fund_Score) >= 5 ? 'text-green-500' : 'text-primary'}`}>{num(row.Fund_Score)}</td>
                          <td className="p-4 text-right text-muted">{num(row['P/E'])}</td>
                          <td className="p-4 text-right text-primary">{row.Conviction || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* VIEW: CHARTING */}
            {activeTab === 'charting' && (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h2 className="font-display text-2xl tracking-wide text-primary/90">Technical Charts</h2>
                  <div className="flex items-center gap-4 bg-card border border-border px-4 py-2 hover:border-primary/50 transition-colors">
                    <Search size={14} className="text-muted" />
                    <select 
                      className="bg-transparent text-primary font-mono text-sm uppercase outline-none cursor-pointer"
                      value={selectedTicker}
                      onChange={e => setSelectedTicker(e.target.value)}
                    >
                      {data.map(d => <option key={d.Ticker} value={d.Ticker} className="bg-card">{d.Ticker}</option>)}
                    </select>
                  </div>
                </div>

                <div className="flex flex-col gap-6">
                  {/* Main Price Chart */}
                  <div className="border border-border bg-card p-6 h-[400px] flex flex-col relative group">
                    <div className="absolute top-4 left-6 font-mono text-xs text-primary/80 z-10 font-bold bg-card/80 px-2 rounded">
                      {selectedTicker.replace('.NS', '')} — Price & Moving Averages
                    </div>
                    {chartLoading ? (
                      <div className="m-auto font-mono text-muted text-xs uppercase animate-pulse">Loading execution logic...</div>
                    ) : chartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={chartData}>
                          <defs>
                            <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#C8102E" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#C8102E" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1A1A1A" vertical={false} />
                          <XAxis 
                            dataKey="time" 
                            stroke="#52525B" 
                            tick={{fill: '#71717A', fontSize: 10, fontFamily: 'Space Mono'}}
                            tickMargin={10}
                            minTickGap={30}
                          />
                          <YAxis 
                            domain={['auto', 'auto']} 
                            stroke="#52525B" 
                            tick={{fill: '#71717A', fontSize: 10, fontFamily: 'Space Mono'}}
                            width={50}
                          />
                          <Tooltip 
                            contentStyle={{backgroundColor: '#0A0A0A', borderColor: '#27272A', fontFamily: 'Space Mono', fontSize: '12px', color: '#fff'}}
                            itemStyle={{color: '#FFFFFF'}}
                            labelStyle={{color: '#A1A1AA', marginBottom: '5px'}}
                          />
                          <Legend verticalAlign="top" height={36} align="right" wrapperStyle={{fontFamily: 'Space Mono', fontSize: '10px', color: '#71717A'}}/>
                          <Area type="monotone" name="Close" dataKey="close" stroke="#C8102E" strokeWidth={2} fillOpacity={1} fill="url(#colorPrice)" />
                          <Line type="monotone" name="SMA 50" dataKey="sma50" stroke="#3B82F6" strokeWidth={1} dot={false} />
                          <Line type="monotone" name="SMA 200" dataKey="sma200" stroke="#F59E0B" strokeWidth={1} dot={false} strokeDasharray="5 5" />
                        </ComposedChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="m-auto font-mono text-muted text-xs uppercase">No chart data for {selectedTicker}</div>
                    )}
                  </div>

                  {/* Subchart: RSI */}
                  <div className="border border-border bg-card p-6 h-[200px] flex flex-col relative">
                     <div className="absolute top-4 left-6 font-mono text-xs text-primary/80 z-10 font-bold bg-card/80 px-2 rounded">
                      RSI (14)
                    </div>
                    {chartData.length > 0 && !chartLoading && (
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1A1A1A" vertical={false} />
                          <XAxis dataKey="time" hide={true} />
                          <YAxis domain={[0, 100]} ticks={[30, 70]} stroke="#52525B" tick={{fill: '#71717A', fontSize: 10, fontFamily: 'Space Mono'}} width={50} />
                          <Tooltip contentStyle={{backgroundColor: '#0A0A0A', borderColor: '#27272A', fontFamily: 'Space Mono', fontSize: '12px'}} />
                          <Line type="monotone" dataKey="rsi" stroke="#A855F7" strokeWidth={1.5} dot={false} />
                          {/* Overbought/Oversold lines */}
                          <Line type="step" dataKey={() => 70} stroke="#52525B" strokeDasharray="3 3" dot={false} activeDot={false} />
                          <Line type="step" dataKey={() => 30} stroke="#52525B" strokeDasharray="3 3" dot={false} activeDot={false} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* VIEW: SECTOR HEATMAP */}
            {activeTab === 'heatmap' && (
              <div className="space-y-6">
                <h2 className="font-display text-2xl tracking-wide text-primary/90">Sector Dispersion</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {Object.keys(sectorMap).map(sector => (
                    <div key={sector} className="border border-border bg-card p-6 hover:border-border transition-colors">
                      <h3 className="font-mono text-sm text-primary uppercase tracking-widest mb-4 border-b border-border pb-2">
                        {sector}
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {sectorMap[sector].map(stock => {
                          const s = Number(stock.Tech_Score)
                          const isPos = s > 0
                          const isNeg = s < 0
                          const bg = isPos ? 'bg-green-500/10 text-green-500 border-green-500/30 hover:bg-green-500/20 hover:border-green-500' : 
                                     isNeg ? 'bg-red-500/10 text-red-500 border-red-500/30 hover:bg-red-500/20 hover:border-red-500' : 
                                     'bg-btn-border text-muted border-transparent hover:border-primary/30 hover:text-primary'
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
      <footer className="border-t border-border mt-12 py-12 px-10">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-12">
          <div>
            <h4 className="font-display text-lg mb-4 uppercase text-primary/80">System Diagnostics</h4>
            {diagnostics && (
              <div className="space-y-2 font-mono text-xs text-muted">
                <div className="flex justify-between items-center group">
                  <span className="flex items-center gap-2 group-hover:text-primary transition-colors"><Database size={14} /> Database</span>
                  <span className={diagnostics.database.status === 'ok' ? 'text-green-500' : 'text-red-500'}>
                    {diagnostics.database.type}
                  </span>
                </div>
                <div className="flex justify-between items-center group">
                  <span className="flex items-center gap-2 group-hover:text-primary transition-colors"><Activity size={14} /> Scans</span>
                  <span><span className="text-green-500">{diagnostics.scans.ok} OK</span> / {diagnostics.scans.failed} Failed</span>
                </div>
              </div>
            )}
          </div>

          <div>
            <h4 className="font-display text-lg mb-4 uppercase text-primary/80">Disclaimer</h4>
            <p className="font-mono text-xs text-sub leading-relaxed">
              This platform is for educational purposes only and does not constitute financial advice. 
              The models and signals provided are experimental. Always consult a certified financial advisor before making investment decisions. 
              Alpha Research and Investment Club, FMS Delhi is not responsible for any trading losses incurred.
            </p>
          </div>

          <div className="text-right">
             <h4 className="font-display text-lg mb-4 uppercase text-primary/80">Project Eura</h4>
             <p className="font-mono text-xs text-muted">Alpha Research and Investment Club<br/>FMS Delhi</p>
             <p className="font-mono text-[10px] text-sub mt-4 tracking-widest uppercase">Made with &hearts; by Abhishek Kumar</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
