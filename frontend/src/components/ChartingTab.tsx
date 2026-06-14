import { useState, useRef, useEffect } from 'react'
import type { DashboardData } from '../types'
import { num, colorCode, scoreBar } from './shared'
import { TrendingUp, Search } from 'lucide-react'
import {
  ComposedChart, Line, Bar, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell
} from 'recharts'


interface Props {
  data: DashboardData[]
  selectedTicker: string
  setSelectedTicker: (t: string) => void
  chartData: any[]
  chartLoading: boolean
  chartPeriod: string
  setChartPeriod: (p: string) => void
  chartInterval: string
  setChartInterval: (i: string) => void
  isDark: boolean
  peerGroup: DashboardData[]
  selectedAsset: DashboardData | null
}

function StockSearch({ data, selectedTicker, onSelect }: { data: DashboardData[]; selectedTicker: string; onSelect: (t: string) => void }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const filtered = data.filter(d => {
    const q = query.toUpperCase()
    return d.Ticker.replace('.NS', '').includes(q) || (d.Sector || '').toUpperCase().includes(q)
  }).slice(0, 20)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(true)
        setTimeout(() => inputRef.current?.focus(), 50)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className="relative" ref={containerRef}>
      <div className="flex items-center gap-3 bg-card border border-border p-1 rounded-sm shadow-sm hover:border-brand/50 transition-colors">
        <div className="pl-3"><Search size={14} className="text-muted" /></div>
        <input
          ref={inputRef}
          type="text"
          value={open ? query : selectedTicker.replace('.NS', '')}
          onFocus={() => { setOpen(true); setQuery('') }}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search ticker or sector..."
          className="bg-transparent text-primary font-mono text-xs uppercase outline-none w-full py-1.5 pr-2 placeholder:text-muted"
        />
        <span className="pr-2 font-mono text-[8px] text-sub border border-border px-1 py-0.5 hidden sm:block">⌘K</span>
      </div>
      {open && query && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 border border-border bg-card shadow-lg max-h-60 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-3 font-mono text-[10px] text-muted text-center">No results</div>
          ) : filtered.map(d => (
            <button
              key={d.Ticker}
              onClick={() => { onSelect(d.Ticker); setOpen(false); setQuery('') }}
              className={`w-full text-left px-3 py-2 font-mono text-xs flex items-center justify-between hover:bg-black/5 dark:hover:bg-white/5 transition-colors ${d.Ticker === selectedTicker ? 'bg-brand/10' : ''}`}
            >
              <span className="text-primary uppercase">{d.Ticker.replace('.NS', '')}</span>
              <span className="text-muted text-[10px]">{d.Sector}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const tooltipStyle = (isDark: boolean) => ({
  backgroundColor: isDark ? '#0A0A0A' : '#ffffff',
  borderColor: isDark ? '#27272A' : '#e2e8f0',
  fontFamily: 'Space Mono',
  fontSize: '12px',
  color: isDark ? '#fff' : '#0f172a'
})

export default function ChartingTab({
  data, selectedTicker, setSelectedTicker, chartData, chartLoading,
  chartPeriod, setChartPeriod, chartInterval, setChartInterval,
  isDark, peerGroup, selectedAsset
}: Props) {
  return (
    <div className="flex flex-col xl:flex-row gap-8">
      {/* Left Column: Controls & Snapshots */}
      <div className="w-full xl:w-1/4 flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <label className="font-mono text-xs uppercase tracking-widest text-sub">Security</label>
          <StockSearch data={data} selectedTicker={selectedTicker} onSelect={setSelectedTicker} />
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
            <div className="font-display text-sm mt-1 text-primary truncate" title={selectedAsset?.Long_Name || 'N/A'}>{selectedAsset?.Long_Name || 'N/A'}</div>
          </div>
          <div className="grid grid-cols-2 gap-y-4 gap-x-2">
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
            <div>
              <div className="font-mono text-[10px] text-muted uppercase">CEO</div>
              <div className="font-mono text-xs mt-1 text-primary truncate" title={selectedAsset?.CEO || 'N/A'}>{selectedAsset?.CEO || 'N/A'}</div>
            </div>
            <div>
              <div className="font-mono text-[10px] text-muted uppercase">Market Cap</div>
              <div className="font-mono text-xs mt-1 text-primary truncate">{selectedAsset?.Market_Cap_B ? `₹${num(selectedAsset?.Market_Cap_B)}B` : 'N/A'}</div>
            </div>
            <div>
              <div className="font-mono text-[10px] text-muted uppercase">Revenue</div>
              <div className="font-mono text-xs mt-1 text-primary truncate">{selectedAsset?.Total_Revenue ? `₹${num(selectedAsset?.Total_Revenue / 1e9)}B` : 'N/A'}</div>
            </div>
            <div>
              <div className="font-mono text-[10px] text-muted uppercase">Profit</div>
              <div className="font-mono text-xs mt-1 text-primary truncate">{selectedAsset?.Net_Income ? `₹${num(selectedAsset?.Net_Income / 1e9)}B` : 'N/A'}</div>
            </div>
            <div>
              <div className="font-mono text-[10px] text-muted uppercase">EBITDA</div>
              <div className="font-mono text-xs mt-1 text-primary truncate">{selectedAsset?.EBITDA ? `₹${num(selectedAsset?.EBITDA / 1e9)}B` : 'N/A'}</div>
            </div>
            <div>
              <div className="font-mono text-[10px] text-muted uppercase">Div Yield</div>
              <div className="font-mono text-xs mt-1 text-primary truncate">{selectedAsset?.["Div_Yield_%"] ? `${num(selectedAsset?.["Div_Yield_%"])}%` : 'N/A'}</div>
            </div>
            <div>
              <div className="font-mono text-[10px] text-muted uppercase">52W High</div>
              <div className="font-mono text-xs mt-1 text-primary truncate">{selectedAsset?.["52W_High"] ? `₹${num(selectedAsset?.["52W_High"])}` : 'N/A'}</div>
            </div>
            <div>
              <div className="font-mono text-[10px] text-muted uppercase">52W Low</div>
              <div className="font-mono text-xs mt-1 text-primary truncate">{selectedAsset?.["52W_Low"] ? `₹${num(selectedAsset?.["52W_Low"])}` : 'N/A'}</div>
            </div>
            <div>
              <div className="font-mono text-[10px] text-muted uppercase">All-Time High</div>
              <div className="font-mono text-xs mt-1 text-primary truncate flex items-center gap-1">
                {selectedAsset?.All_Time_High ? `₹${num(selectedAsset?.All_Time_High)}` : 'N/A'}
                {selectedAsset?.ATH_Source === '52W' && <span className="text-[8px] text-sub border border-border px-1 py-0.5 rounded-sm leading-none mt-px">52W</span>}
              </div>
            </div>
            <div>
              <div className="font-mono text-[10px] text-muted uppercase">All-Time Low</div>
              <div className="font-mono text-xs mt-1 text-primary truncate flex items-center gap-1">
                {selectedAsset?.All_Time_Low ? `₹${num(selectedAsset?.All_Time_Low)}` : 'N/A'}
                {selectedAsset?.ATL_Source === '52W' && <span className="text-[8px] text-sub border border-border px-1 py-0.5 rounded-sm leading-none mt-px">52W</span>}
              </div>
            </div>
          </div>
        </div>

        {/* Technical Snapshot */}
        <div className="border border-border bg-card p-6 shadow-sm">
          <h3 className="font-mono text-xs uppercase tracking-widest text-primary mb-4 border-b border-border pb-2 font-semibold">Technical Snapshot</h3>
          <div className="grid grid-cols-2 gap-4">
            <div><div className="font-mono text-[10px] text-muted uppercase">Tech Score</div><div className={`font-mono text-sm mt-1 font-semibold ${colorCode(selectedAsset?.Tech_Score)}`}>{num(selectedAsset?.Tech_Score)}</div></div>
            <div><div className="font-mono text-[10px] text-muted uppercase">Conviction</div><div className="font-mono text-sm mt-1 text-primary font-semibold">{selectedAsset?.Conviction || 'N/A'}</div></div>
            <div><div className="font-mono text-[10px] text-muted uppercase">RS Percentile</div><div className="font-mono text-sm mt-1 text-primary font-semibold">{selectedAsset?.RS_Percentile !== undefined ? `${num(selectedAsset?.RS_Percentile)}%` : 'N/A'}</div></div>
            <div><div className="font-mono text-[10px] text-muted uppercase">RSI (14)</div><div className="font-mono text-sm mt-1 text-primary">{num(selectedAsset?.RSI_Value)}</div></div>
            <div><div className="font-mono text-[10px] text-muted uppercase">ADX (14)</div><div className="font-mono text-sm mt-1 text-primary">{num(selectedAsset?.ADX_Value)}</div></div>
            <div><div className="font-mono text-[10px] text-muted uppercase">MACD</div><div className="font-mono text-sm mt-1 text-primary">{num(selectedAsset?.MACD_Value)}</div></div>
            <div><div className="font-mono text-[10px] text-muted uppercase">Supertrend</div><div className="font-mono text-sm mt-1 text-primary">{selectedAsset?.ST_Signal || 'N/A'}</div></div>
            <div><div className="font-mono text-[10px] text-muted uppercase">Bull / Bear</div><div className="font-mono text-sm mt-1"><span className="text-green-600">{selectedAsset?.Bull_Count ?? '-'}</span> <span className="text-muted">/</span> <span className="text-red-600">{selectedAsset?.Bear_Count ?? '-'}</span></div></div>
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
            <div><div className="font-mono text-[10px] text-muted uppercase">Piotroski F-Score</div><div className="flex items-center gap-2 mt-1"><span className={`font-mono text-sm font-semibold ${Number(selectedAsset?.Piotroski_F) >= 7 ? 'text-green-600 dark:text-green-500' : Number(selectedAsset?.Piotroski_F) <= 3 ? 'text-red-600 dark:text-red-500' : 'text-primary'}`}>{selectedAsset?.Piotroski_F ?? '-'}/9</span></div></div>
            <div><div className="font-mono text-[10px] text-muted uppercase">Gross Profit</div><div className="font-mono text-sm mt-1 text-primary">{num(selectedAsset?.Gross_Profit_Score)}</div></div>
            <div><div className="font-mono text-[10px] text-muted uppercase">Earnings Quality</div><div className="font-mono text-sm mt-1 text-primary">{num(selectedAsset?.Earnings_Quality)}</div></div>
            <div><div className="font-mono text-[10px] text-muted uppercase">Z-Score (60D)</div><div className={`font-mono text-sm mt-1 font-semibold ${Number(selectedAsset?.Z_Score_60) > 2 ? 'text-red-600 dark:text-red-500' : Number(selectedAsset?.Z_Score_60) < -2 ? 'text-green-600 dark:text-green-500' : 'text-primary'}`}>{num(selectedAsset?.Z_Score_60)}</div></div>
          </div>
        </div>

        {/* Momentum Snapshot */}
        <div className="border border-border bg-card p-6 shadow-sm">
          <h3 className="font-mono text-xs uppercase tracking-widest text-primary mb-4 border-b border-border pb-2 font-semibold">Momentum</h3>
          <div className="grid grid-cols-2 gap-4">
            <div><div className="font-mono text-[10px] text-muted uppercase">1 Month</div><div className={`font-mono text-sm mt-1 font-semibold ${colorCode(selectedAsset?.Momentum_1M)}`}>{selectedAsset?.Momentum_1M != null ? `${(selectedAsset.Momentum_1M * 100).toFixed(2)}%` : 'N/A'}</div></div>
            <div><div className="font-mono text-[10px] text-muted uppercase">3 Month</div><div className={`font-mono text-sm mt-1 font-semibold ${colorCode(selectedAsset?.Momentum_3M)}`}>{selectedAsset?.Momentum_3M != null ? `${(selectedAsset.Momentum_3M * 100).toFixed(2)}%` : 'N/A'}</div></div>
            <div><div className="font-mono text-[10px] text-muted uppercase">6 Month</div><div className={`font-mono text-sm mt-1 font-semibold ${colorCode(selectedAsset?.Momentum_6M)}`}>{selectedAsset?.Momentum_6M != null ? `${(selectedAsset.Momentum_6M * 100).toFixed(2)}%` : 'N/A'}</div></div>
            <div><div className="font-mono text-[10px] text-muted uppercase">12 Month</div><div className={`font-mono text-sm mt-1 font-semibold ${colorCode(selectedAsset?.Momentum_12M)}`}>{selectedAsset?.Momentum_12M != null ? `${(selectedAsset.Momentum_12M * 100).toFixed(2)}%` : 'N/A'}</div></div>
            <div className="col-span-2 pt-2 border-t border-border"><div className="font-mono text-[10px] text-muted uppercase">Risk-Adjusted Mom</div><div className={`font-mono text-sm mt-1 font-semibold ${colorCode(selectedAsset?.Risk_Adj_Mom)}`}>{num(selectedAsset?.Risk_Adj_Mom)}</div></div>
          </div>
        </div>

        {/* Fundamental Snapshot */}
        <div className="border border-border bg-card p-6 shadow-sm">
          <h3 className="font-mono text-xs uppercase tracking-widest text-primary mb-4 border-b border-border pb-2 font-semibold">Fundamentals</h3>
          <div className="grid grid-cols-2 gap-4">
            <div><div className="font-mono text-[10px] text-muted uppercase">Fund Score</div><div className={`font-mono text-sm mt-1 font-semibold ${Number(selectedAsset?.Fund_Score) >= 5 ? 'text-green-600 dark:text-green-500' : 'text-primary'}`}>{num(selectedAsset?.Fund_Score)}</div></div>
            <div><div className="font-mono text-[10px] text-muted uppercase">Forward P/E</div><div className="font-mono text-sm mt-1 text-primary">{num(selectedAsset?.['Forward_P/E'])}</div></div>
            <div><div className="font-mono text-[10px] text-muted uppercase">Debt to Eq</div><div className="font-mono text-sm mt-1 text-primary">{num(selectedAsset?.['Debt_to_Equity'])}</div></div>
            <div><div className="font-mono text-[10px] text-muted uppercase">ROE %</div><div className="font-mono text-sm mt-1 text-primary">{num(selectedAsset?.['ROE_%'])}%</div></div>
            <div><div className="font-mono text-[10px] text-muted uppercase">ROCE %</div><div className="font-mono text-sm mt-1 text-primary">{num(selectedAsset?.['ROCE_%'])}%</div></div>
            <div><div className="font-mono text-[10px] text-muted uppercase">Promoter</div><div className="font-mono text-sm mt-1 text-primary">{num(selectedAsset?.['Promoter_Holding_%'])}%</div></div>
          </div>
        </div>

        {/* Risk Metrics */}
        <div className="border border-border bg-card p-6 shadow-sm">
          <h3 className="font-mono text-xs uppercase tracking-widest text-primary mb-4 border-b border-border pb-2 font-semibold">Risk Metrics</h3>
          <div className="grid grid-cols-2 gap-4">
            <div><div className="font-mono text-[10px] text-muted uppercase">Volatility (60D)</div><div className={`font-mono text-sm mt-1 font-semibold ${Number(selectedAsset?.Vol_60D) < 25 ? 'text-green-600 dark:text-green-500' : Number(selectedAsset?.Vol_60D) > 40 ? 'text-red-600 dark:text-red-500' : 'text-primary'}`}>{num(selectedAsset?.Vol_60D)}%</div></div>
            <div><div className="font-mono text-[10px] text-muted uppercase">Downside Dev</div><div className="font-mono text-sm mt-1 text-primary">{num(selectedAsset?.Downside_Dev)}%</div></div>
            <div><div className="font-mono text-[10px] text-muted uppercase">Sharpe Ratio</div><div className={`font-mono text-sm mt-1 font-semibold ${colorCode(selectedAsset?.Sharpe)}`}>{num(selectedAsset?.Sharpe)}</div></div>
            <div><div className="font-mono text-[10px] text-muted uppercase">Max Drawdown</div><div className="font-mono text-sm mt-1 text-red-600 dark:text-red-500">{num(selectedAsset?.['Max_Drawdown_%'])}%</div></div>
            <div><div className="font-mono text-[10px] text-muted uppercase">Ann. Volatility</div><div className="font-mono text-sm mt-1 text-primary">{num(selectedAsset?.['Ann_Vol_%'])}%</div></div>
            <div><div className="font-mono text-[10px] text-muted uppercase">Total Return</div><div className={`font-mono text-sm mt-1 font-semibold ${colorCode(selectedAsset?.['Total_Return_%'])}`}>{num(selectedAsset?.['Total_Return_%'])}%</div></div>
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
                <button key={p} onClick={() => setChartPeriod(p)} className={`px-3 py-1.5 font-mono text-xs uppercase tracking-widest transition-all ${chartPeriod === p ? 'bg-brand text-white shadow-sm' : 'text-muted hover:text-primary'}`}>
                  {p.replace('mo', 'M').replace('y', 'Y').replace('w', 'W')}
                </button>
              ))}
            </div>
            <div className="flex bg-card border border-border p-1 rounded-sm shadow-sm w-fit">
              <button onClick={() => setChartInterval('1d')} className={`px-3 py-1.5 font-mono text-xs uppercase tracking-widest transition-all ${chartInterval === '1d' ? 'bg-primary text-background shadow-sm' : 'text-muted hover:text-primary'}`}>Daily</button>
              <button onClick={() => setChartInterval('1wk')} className={`px-3 py-1.5 font-mono text-xs uppercase tracking-widest transition-all ${chartInterval === '1wk' ? 'bg-primary text-background shadow-sm' : 'text-muted hover:text-primary'}`}>Weekly</button>
            </div>
          </div>
        </div>

        {/* Chart Container */}
        <div className="flex flex-col gap-6">
          {/* Main Price & Volume Chart with Supertrend Overlay */}
          <div className="border border-border bg-card p-6 h-[450px] flex flex-col relative shadow-sm">
            <div className="absolute top-4 left-[66px] font-mono text-xs text-primary/80 z-10 font-semibold bg-card/80 px-2 rounded backdrop-blur-sm">
              {selectedTicker.replace('.NS', '')} — Price, SMAs & Supertrend
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
                    <XAxis dataKey="time" stroke={isDark ? "#52525B" : "#94a3b8"} tick={{fill: isDark ? '#71717A' : '#64748b', fontSize: 10, fontFamily: 'Space Mono'}} tickMargin={10} minTickGap={30} />
                    <YAxis yAxisId="price" domain={['auto', 'auto']} stroke={isDark ? "#52525B" : "#94a3b8"} tick={{fill: isDark ? '#71717A' : '#64748b', fontSize: 10, fontFamily: 'Space Mono'}} width={50} />
                    <YAxis yAxisId="volume" orientation="right" domain={[0, dataMax => dataMax * 4]} hide={true} />
                    <Tooltip contentStyle={tooltipStyle(isDark)} itemStyle={{color: isDark ? '#FFFFFF' : '#0f172a'}} labelStyle={{color: isDark ? '#A1A1AA' : '#64748b', marginBottom: '5px'}} />
                    <Legend verticalAlign="top" height={36} align="right" wrapperStyle={{fontFamily: 'Space Mono', fontSize: '10px', color: isDark ? '#71717A' : '#64748b'}}/>
                    <Bar yAxisId="volume" name="Volume" dataKey="volume" fill={isDark ? "#3F3F46" : "#cbd5e1"} maxBarSize={6} />
                    <Area yAxisId="price" type="monotone" name="Close" dataKey="close" stroke="#C8102E" strokeWidth={2} fillOpacity={1} fill="url(#colorPrice)" />
                    <Line yAxisId="price" type="monotone" name="SMA 50" dataKey="sma50" stroke="#3B82F6" strokeWidth={1} dot={false} />
                    <Line yAxisId="price" type="monotone" name="SMA 200" dataKey="sma200" stroke="#F59E0B" strokeWidth={1} dot={false} strokeDasharray="5 5" />
                    <Line yAxisId="price" type="monotone" name="Supertrend" dataKey="supertrend" stroke="#06B6D4" strokeWidth={1.5} dot={false} strokeDasharray="2 2" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="m-auto font-mono text-muted text-xs uppercase">No chart data for {selectedTicker}</div>
            )}
          </div>

          {/* Subchart: RSI */}
          <div className="border border-border bg-card p-6 h-[200px] flex flex-col relative shadow-sm">
            <div className="absolute top-4 left-[60px] font-mono text-xs text-primary/80 z-10 font-semibold bg-card/80 px-2 rounded backdrop-blur-sm">RSI (14)</div>
            {chartData.length > 0 && !chartLoading && (
              <div style={{ width: '100%', height: '100%', minHeight: '120px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#1A1A1A" : "#e2e8f0"} vertical={false} />
                    <XAxis dataKey="time" hide={true} />
                    <YAxis domain={[0, 100]} ticks={[30, 50, 70]} stroke={isDark ? "#52525B" : "#94a3b8"} tick={{fill: isDark ? '#71717A' : '#64748b', fontSize: 10, fontFamily: 'Space Mono'}} width={50} />
                    <Tooltip contentStyle={tooltipStyle(isDark)} />
                    <Line type="monotone" dataKey="rsi" name="RSI" stroke="#A855F7" strokeWidth={1.5} dot={false} />
                    <Line type="step" dataKey={() => 70} stroke={isDark ? '#ef4444' : '#dc2626'} strokeDasharray="3 3" dot={false} activeDot={false} strokeOpacity={0.5} />
                    <Line type="step" dataKey={() => 50} stroke={isDark ? "#52525B" : "#94a3b8"} strokeDasharray="2 4" dot={false} activeDot={false} strokeOpacity={0.4} />
                    <Line type="step" dataKey={() => 30} stroke={isDark ? '#22c55e' : '#16a34a'} strokeDasharray="3 3" dot={false} activeDot={false} strokeOpacity={0.5} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Subchart: MACD */}
          <div className="border border-border bg-card p-6 h-[200px] flex flex-col relative shadow-sm">
            <div className="absolute top-4 left-[60px] font-mono text-xs text-primary/80 z-10 font-semibold bg-card/80 px-2 rounded backdrop-blur-sm">MACD (12, 26, 9)</div>
            {chartData.length > 0 && !chartLoading && (
              <div style={{ width: '100%', height: '100%', minHeight: '120px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#1A1A1A" : "#e2e8f0"} vertical={false} />
                    <XAxis dataKey="time" hide={true} />
                    <YAxis stroke={isDark ? "#52525B" : "#94a3b8"} tick={{fill: isDark ? '#71717A' : '#64748b', fontSize: 10, fontFamily: 'Space Mono'}} width={50} />
                    <Tooltip contentStyle={tooltipStyle(isDark)} />
                    <Bar dataKey="macd_hist" name="Histogram" maxBarSize={4}>
                      {chartData.map((entry, index) => (
                        <Cell
                          key={`macd-${index}`}
                          fill={(entry.macd_hist ?? 0) >= 0
                            ? (isDark ? '#22c55e' : '#16a34a')
                            : (isDark ? '#ef4444' : '#dc2626')
                          }
                          fillOpacity={0.7}
                        />
                      ))}
                    </Bar>
                    <Line type="monotone" dataKey="macd" name="MACD" stroke="#3B82F6" strokeWidth={1.5} dot={false} />
                    <Line type="monotone" dataKey="macd_signal" name="Signal" stroke="#F59E0B" strokeWidth={1} dot={false} strokeDasharray="3 3" />
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
              {scoreBar('Composite', Number(selectedAsset.Composite_Score) || 0, 0, 10)}
              {scoreBar('Tech', Number(selectedAsset.Tech_Score) || 0, -1, 1)}
              {scoreBar('Fund', Number(selectedAsset.Fund_Score) || 0, 0, 10)}
              {scoreBar('Research', Number(selectedAsset.Research_Score) || 0, 0, 10)}
              <div className="border-t border-border pt-2 mt-2 space-y-2">
                {scoreBar('Piotroski', Number(selectedAsset.Piotroski_F) || 0, 0, 9)}
                {scoreBar('Gross Profit', Number(selectedAsset.Gross_Profit_Score) || 0, 0, 10)}
                {scoreBar('Earnings Q', Number(selectedAsset.Earnings_Quality) || 0, 0, 10)}
                {scoreBar('Volatility', Number(selectedAsset.Vol_60D) || 0, 0, 60)}
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
  )
}
