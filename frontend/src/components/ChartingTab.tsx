import { useState, useRef, useEffect } from 'react'
import type { DashboardData } from '../types'
import { num, colorCode, scoreColor, scoreBar } from './shared'
import { Search } from 'lucide-react'
import {
  ComposedChart, Line, Bar, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell, ReferenceLine
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
  scoreHistory: Record<string, {date: string; composite: number; composite_tech?: number; composite_fund?: number; tech: number; fund: number; research: number}[]>
  horizon: 'short'|'long'
}

function StockSearch({ data, selectedTicker, onSelect }: { data: DashboardData[]; selectedTicker: string; onSelect: (t: string) => void }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const filtered = data.filter(d => {
    const q = query.toUpperCase()
    return d.Ticker.replace('.NS', '').includes(q) || (d.Long_Name || '').toUpperCase().includes(q) || (d.Sector || '').toUpperCase().includes(q)
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
      <div className="flex items-center gap-3 px-3 py-2.5 card">
        <Search size={15} style={{ color: 'var(--text-3)' }} />
        <input
          ref={inputRef}
          type="text"
          value={open ? query : selectedTicker.replace('.NS', '')}
          onFocus={() => { setOpen(true); setQuery('') }}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search ticker or company…"
          className="bg-transparent text-sm outline-none w-full"
          style={{ color: 'var(--text)' }}
        />
        <kbd className="text-[10px] px-1.5 py-0.5 hidden sm:block" style={{ color: 'var(--text-3)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>{navigator.platform.includes('Mac') ? '⌘' : 'Ctrl+'}K</kbd>
      </div>
      {open && query && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 overflow-hidden max-h-60 overflow-y-auto card" style={{ boxShadow: 'var(--shadow-lg)' }}>
          {filtered.length === 0 ? (
            <div className="p-3 text-xs text-center" style={{ color: 'var(--text-3)' }}>No results</div>
          ) : filtered.map(d => (
            <button
              key={d.Ticker}
              onClick={() => { onSelect(d.Ticker); setOpen(false); setQuery('') }}
              className="w-full text-left px-3 py-2 text-sm flex items-center justify-between transition-colors"
              style={{
                background: d.Ticker === selectedTicker ? 'var(--brand-soft)' : 'transparent',
                color: 'var(--text)',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
              onMouseLeave={e => (e.currentTarget.style.background = d.Ticker === selectedTicker ? 'var(--brand-soft)' : 'transparent')}
            >
              <span className="font-medium">{d.Ticker.replace('.NS', '')}</span>
              <span className="text-xs" style={{ color: 'var(--text-3)' }}>{d.Sector}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border-2)',
      borderRadius: 'var(--radius)', padding: '8px 12px',
      boxShadow: 'var(--shadow-lg)', fontSize: 11 }}>
      <p style={{ color: 'var(--text-3)', marginBottom: 4, fontWeight: 500 }}>{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <span style={{ color: p.color || 'var(--text-2)' }}>{p.name}</span>
          <span style={{ fontFamily: 'Space Mono', fontWeight: 600, color: 'var(--text)' }}>
            {typeof p.value === 'number' ? p.value.toFixed(2) : p.value}
          </span>
        </div>
      ))}
    </div>
  )
}

const Panel = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="overflow-hidden card">
    <div className="px-4 py-3 text-xs font-medium" style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-2)' }}>
      {title}
    </div>
    {children}
  </div>
)

const InfoBlock = ({ label, value, accent }: { label: string; value: React.ReactNode; accent?: string }) => (
  <div>
    <div className="text-[11px] mb-0.5" style={{ color: 'var(--text-3)' }}>{label}</div>
    <div className="text-sm font-medium" style={{ color: accent || 'var(--text)' }}>{value}</div>
  </div>
)

export default function ChartingTab({
  data, selectedTicker, setSelectedTicker, chartData, chartLoading,
  chartPeriod, setChartPeriod, chartInterval, setChartInterval,
  isDark, peerGroup, selectedAsset, scoreHistory, horizon
}: Props) {
  const rawTickerScores = scoreHistory[selectedTicker] || []
  const tickerScores = rawTickerScores.map(s => ({
    ...s,
    composite: horizon === 'long' ? (s.composite_fund ?? s.composite) : horizon === 'short' ? (s.composite_tech ?? s.composite) : s.composite,
  }))
  const price = Number(selectedAsset?.Price) || 0
  const ath = selectedAsset?.All_Time_High ? Number(selectedAsset.All_Time_High) : null

  return (
    <div className="space-y-5">
      <div className="flex flex-col xl:flex-row gap-6 xl:gap-8">
      {/* Left: Controls & Info - sticky */}
      <div className="w-full xl:w-72 flex flex-col gap-5 order-2 xl:order-1 shrink-0" style={{ position: 'sticky', top: 60, maxHeight: 'calc(100vh - 80px)', overflowY: 'auto' }}>
        <StockSearch data={data} selectedTicker={selectedTicker} onSelect={setSelectedTicker} />

        {/* Company Profile */}
        <div className="card p-5">
          <div className="flex items-start justify-between mb-4">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Company Profile</h3>
            {selectedAsset?.News_Sentiment !== undefined && selectedAsset.News_Sentiment !== null && (
              <span className={`text-xs font-medium ${Number(selectedAsset.News_Sentiment) > 0.1 ? 'text-[var(--green)]' : Number(selectedAsset.News_Sentiment) < -0.1 ? 'text-[var(--red)]' : 'text-[var(--text-3)]'}`}>
                {selectedAsset.News_Sentiment}
              </span>
            )}
          </div>
          <div className="mb-4">
            <div className="text-sm font-medium truncate" style={{ color: 'var(--text)' }} title={selectedAsset?.Long_Name || '-'}>{selectedAsset?.Long_Name?.replace(' Limited', ' Ltd').replace(' Industries', ' Ind.') || '-'}</div>
          </div>
          <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
            <InfoBlock label="Price" value={`₹${num(selectedAsset?.Price)}`} />
            <InfoBlock
              label="1D Change"
              value={selectedAsset?.["1d_Chg_%"] ? `${selectedAsset["1d_Chg_%"] > 0 ? '+' : ''}${selectedAsset["1d_Chg_%"].toFixed(2)}%` : '-'}
              accent={selectedAsset?.["1d_Chg_%"] && selectedAsset["1d_Chg_%"] > 0 ? 'var(--green)' : selectedAsset?.["1d_Chg_%"] && selectedAsset["1d_Chg_%"] < 0 ? 'var(--red)' : undefined}
            />
            <InfoBlock label="CEO" value={selectedAsset?.CEO || '-'} />
            <InfoBlock label="Market Cap" value={selectedAsset?.Market_Cap_B ? `₹${num(selectedAsset?.Market_Cap_B)}B` : '-'} />
            <InfoBlock label="Revenue" value={selectedAsset?.Total_Revenue ? `₹${num(selectedAsset?.Total_Revenue)}B` : '-'} />
            <InfoBlock label="Profit" value={selectedAsset?.Net_Income ? `₹${num(selectedAsset?.Net_Income)}B` : '-'} />
            <InfoBlock label="EBITDA" value={selectedAsset?.EBITDA ? `₹${num(selectedAsset?.EBITDA)}B` : '-'} />
            <InfoBlock label="Div Yield" value={selectedAsset?.["Div_Yield_%"] ? `${num(selectedAsset?.["Div_Yield_%"])}%` : '-'} />
            <InfoBlock label="52W High" value={selectedAsset?.["52W_High"] ? `₹${num(selectedAsset?.["52W_High"])}` : '-'} />
            <InfoBlock label="52W Low" value={selectedAsset?.["52W_Low"] ? `₹${num(selectedAsset?.["52W_Low"])}` : '-'} />
            {ath && price > 0 && (
              <InfoBlock label="vs ATH" value={`${(((price / ath) - 1) * 100).toFixed(1)}%`} accent={(price / ath) > 0.95 ? 'var(--green)' : 'var(--amber)'} />
            )}
            <InfoBlock label="ATH" value={ath ? `₹${num(ath)}` : '-'} />
            <InfoBlock label="ATL" value={selectedAsset?.All_Time_Low ? `₹${num(selectedAsset?.All_Time_Low)}` : '-'} />
          </div>
        </div>

        {/* Technicals */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text)' }}>Technical Snapshot</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <InfoBlock label="Tech Score" value={num(selectedAsset?.Tech_Score)} accent={colorCode(selectedAsset?.Tech_Score)} />
            <InfoBlock label="Conviction" value={selectedAsset?.Conviction || '-'} />
            <InfoBlock label="RSI(14)" value={num(selectedAsset?.RSI_Value)} />
            <InfoBlock label="ADX(14)" value={num(selectedAsset?.ADX_Value)} />
            <InfoBlock label="MACD" value={num(selectedAsset?.MACD_Value)} />
            <InfoBlock label="Supertrend" value={selectedAsset?.ST_Signal || '-'} />
            <div className="col-span-2">
              <div className="text-[11px] mb-0.5" style={{ color: 'var(--text-3)' }}>Bull / Neutral / Bear</div>
              <span style={{color:'var(--green)'}}>{selectedAsset?.Bull_Count ?? '-'}</span>
              <span className="mx-1" style={{color:'var(--text-3)'}}>/</span>
              <span style={{color:'var(--text-2)'}}>{selectedAsset?.Bull_Count != null && selectedAsset?.Bear_Count != null ? 15 - selectedAsset.Bull_Count - selectedAsset.Bear_Count : '-'}</span>
              <span className="mx-1" style={{color:'var(--text-3)'}}>/</span>
              <span style={{color:'var(--red)'}}>{selectedAsset?.Bear_Count ?? '-'}</span>
            </div>
          </div>
        </div>

        {/* Research */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Research Factors</h3>
            <span className="text-sm font-medium" style={{ color: Number(selectedAsset?.Research_Score) >= 7 ? 'var(--green)' : Number(selectedAsset?.Research_Score) < 4 ? 'var(--red)' : 'var(--text)' }}>
              {num(selectedAsset?.Research_Score)}/10
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <InfoBlock label="Piotroski" value={`${selectedAsset?.Piotroski_F ?? '-'}/9`} accent={Number(selectedAsset?.Piotroski_F) >= 7 ? 'var(--green)' : Number(selectedAsset?.Piotroski_F) <= 3 ? 'var(--red)' : undefined} />
            <InfoBlock label="Gross Profit" value={num(selectedAsset?.Gross_Profit_Score)} />
            <InfoBlock label="Earnings Quality" value={num(selectedAsset?.Earnings_Quality)} />
            <InfoBlock label="Z-Score" value={num(selectedAsset?.Z_Score_60)} accent={Number(selectedAsset?.Z_Score_60) > 2 ? 'var(--red)' : Number(selectedAsset?.Z_Score_60) < -2 ? 'var(--green)' : undefined} />
            <InfoBlock label="Value Score" value={num(selectedAsset?.Value_Score)} accent={Number(selectedAsset?.Value_Score) >= 7 ? 'var(--green)' : Number(selectedAsset?.Value_Score) < 4 ? 'var(--red)' : undefined} />
            <InfoBlock label="Investment" value={num(selectedAsset?.Investment_Score)} />
            <InfoBlock label="SUE" value={num(selectedAsset?.SUE_Score)} />
            <InfoBlock label="Beta" value={selectedAsset?.Beta != null ? selectedAsset.Beta.toFixed(2) : '-'} accent={selectedAsset?.Beta != null && selectedAsset.Beta < 0.8 ? 'var(--green)' : selectedAsset?.Beta != null && selectedAsset.Beta > 1.2 ? 'var(--red)' : undefined} />
          </div>
        </div>

        {/* Momentum */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text)' }}>Momentum</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <InfoBlock label="1 Month" value={selectedAsset?.Momentum_1M != null ? `${(selectedAsset.Momentum_1M * 100).toFixed(2)}%` : '-'} accent={colorCode(selectedAsset?.Momentum_1M)} />
            <InfoBlock label="3 Month" value={selectedAsset?.Momentum_3M != null ? `${(selectedAsset.Momentum_3M * 100).toFixed(2)}%` : '-'} accent={colorCode(selectedAsset?.Momentum_3M)} />
            <InfoBlock label="6 Month" value={selectedAsset?.Momentum_6M != null ? `${(selectedAsset.Momentum_6M * 100).toFixed(2)}%` : '-'} accent={colorCode(selectedAsset?.Momentum_6M)} />
            <InfoBlock label="12 Month" value={selectedAsset?.Momentum_12M != null ? `${(selectedAsset.Momentum_12M * 100).toFixed(2)}%` : '-'} accent={colorCode(selectedAsset?.Momentum_12M)} />
            <div className="col-span-2 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
              <InfoBlock label="Risk-Adjusted" value={num(selectedAsset?.Risk_Adj_Mom)} accent={colorCode(selectedAsset?.Risk_Adj_Mom)} />
            </div>
          </div>
        </div>

        {/* Fundamentals */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text)' }}>Fundamentals</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <InfoBlock label="Fund Score" value={num(selectedAsset?.Fund_Score)} accent={Number(selectedAsset?.Fund_Score) >= 5 ? 'var(--green)' : undefined} />
            <InfoBlock label="Forward P/E" value={num(selectedAsset?.['Forward_P/E'])} />
            <InfoBlock label="D/E" value={num(selectedAsset?.['Debt_to_Equity'])} />
            <InfoBlock label="ROE" value={`${num(selectedAsset?.['ROE_%'])}%`} />
            <InfoBlock label="ROCE" value={`${num(selectedAsset?.['ROCE_%'])}%`} />
            <InfoBlock label="Promoter" value={`${num(selectedAsset?.['Promoter_Holding_%'])}%`} />
          </div>
        </div>

        {/* Risk */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text)' }}>Risk Metrics</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <InfoBlock label="Volatility (60D)" value={`${num(selectedAsset?.Vol_60D)}%`} accent={Number(selectedAsset?.Vol_60D) < 25 ? 'var(--green)' : Number(selectedAsset?.Vol_60D) > 40 ? 'var(--red)' : undefined} />
            <InfoBlock label="Sharpe" value={num(selectedAsset?.Sharpe)} accent={colorCode(selectedAsset?.Sharpe)} />
            <InfoBlock label="Max Drawdown" value={`${num(selectedAsset?.['Max_Drawdown_%'])}%`} accent="var(--red)" />
            <InfoBlock label="Total Return" value={`${num(selectedAsset?.['Total_Return_%'])}%`} accent={colorCode(selectedAsset?.['Total_Return_%'])} />
            <InfoBlock label="Beta" value={selectedAsset?.Beta != null ? selectedAsset.Beta.toFixed(2) : '-'} accent={selectedAsset?.Beta != null && selectedAsset.Beta < 0.8 ? 'var(--green)' : selectedAsset?.Beta != null && selectedAsset.Beta > 1.2 ? 'var(--red)' : undefined} />
            <InfoBlock label="Alpha (60D)" value={selectedAsset?.Alpha_60D != null ? `${selectedAsset.Alpha_60D.toFixed(1)}%` : '-'} accent={selectedAsset?.Alpha_60D != null && selectedAsset.Alpha_60D > 0 ? 'var(--green)' : selectedAsset?.Alpha_60D != null && selectedAsset.Alpha_60D < 0 ? 'var(--red)' : undefined} />
          </div>
        </div>
      </div>

      {/* Right: Charts */}
      <div className="w-full xl:flex-1 flex flex-col gap-5 order-1 xl:order-2 min-w-0">
        {/* Period + Interval - segmented controls */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="inline-flex" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
            {['1w', '1mo', '3mo', '6mo', '1y', '2y', '5y'].map(p => (
              <button key={p} onClick={() => setChartPeriod(p)} style={{
                padding: '4px 10px', fontSize: 11, fontWeight: 500,
                background: chartPeriod === p ? 'var(--brand)' : 'transparent',
                color: chartPeriod === p ? 'white' : 'var(--text-3)',
                border: 'none', cursor: 'pointer',
                borderRight: '1px solid var(--border)',
                transition: 'background var(--dur-fast), color var(--dur-fast)',
              }}>
                {p.replace('mo', 'M').replace('y', 'Y').replace('w', 'W')}
              </button>
            ))}
          </div>
          <div className="inline-flex" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
            {['1d', '1wk'].map(i => (
              <button key={i} onClick={() => setChartInterval(i)} style={{
                padding: '4px 10px', fontSize: 11, fontWeight: 500,
                background: chartInterval === i ? 'var(--brand)' : 'transparent',
                color: chartInterval === i ? 'white' : 'var(--text-3)',
                border: 'none', cursor: 'pointer',
                borderRight: i !== '1wk' ? '1px solid var(--border)' : 'none',
                transition: 'background var(--dur-fast), color var(--dur-fast)',
              }}>
                {i === '1d' ? 'Daily' : 'Weekly'}
              </button>
            ))}
          </div>
        </div>

        {/* Main chart */}
        <Panel title={`${selectedTicker.replace('.NS', '')} - Price · SMA 50 · SMA 200 · Supertrend`}>
          <div className="chart-main" role="img" aria-label={`${selectedTicker} price chart`}>
            {chartLoading ? (
              <div className="flex items-center justify-center h-full text-sm animate-pulse" style={{ color: 'var(--text-3)' }}>Loading…</div>
            ) : chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData}>
                  <defs>
                    <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--brand)" stopOpacity={isDark ? 0.25 : 0.08}/>
                      <stop offset="95%" stopColor="var(--brand)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="time" stroke="var(--border)" tick={{fill:'var(--text-3)', fontSize: 10, fontFamily: 'Inter, system-ui, sans-serif'}} tickMargin={10} minTickGap={30} />
                  <YAxis yAxisId="price" domain={['auto', 'auto']} stroke="var(--border)" tick={{fill:'var(--text-3)', fontSize: 10, fontFamily: 'Inter, system-ui, sans-serif'}} width={55} />
                  <YAxis yAxisId="volume" orientation="right" domain={[0, dataMax => dataMax * 4]} hide={true} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend verticalAlign="top" height={30} align="right" wrapperStyle={{fontFamily: 'Inter, system-ui, sans-serif', fontSize: '10px', color: 'var(--text-3)'}}/>
                  <Bar yAxisId="volume" name="Volume" dataKey="volume" fill="var(--border)" maxBarSize={6} />
                  <Area yAxisId="price" type="monotone" name="Close" dataKey="close" stroke="var(--brand)" strokeWidth={2} fillOpacity={1} fill="url(#colorPrice)" />
                  <Line yAxisId="price" type="monotone" name="SMA 50" dataKey="sma50" stroke="var(--blue)" strokeWidth={1} dot={false} />
                  <Line yAxisId="price" type="monotone" name="SMA 200" dataKey="sma200" stroke="var(--amber)" strokeWidth={1} dot={false} strokeDasharray="5 5" />
                  <Line yAxisId="price" type="monotone" name="Supertrend" dataKey="supertrend" stroke="#06B6D4" strokeWidth={1.5} dot={false} strokeDasharray="2 2" />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-sm" style={{ color: 'var(--text-3)' }}>No chart data for {selectedTicker}</div>
            )}
          </div>
        </Panel>

        {/* RSI with reference lines */}
        <Panel title="RSI(14) - 30 oversold · 70 overbought">
          <div className="chart-sub" role="img" aria-label={`${selectedTicker} RSI chart`}>
            {chartData.length > 0 && !chartLoading && (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="time" hide={true} />
                  <YAxis domain={[0, 100]} ticks={[30, 50, 70]} stroke="var(--border)" tick={{fill:'var(--text-3)', fontSize: 10, fontFamily: 'Inter, system-ui, sans-serif'}} width={50} />
                  <Tooltip content={<ChartTooltip />} />
                  <ReferenceLine y={70} stroke="var(--red)" strokeDasharray="3 3" strokeOpacity={0.5}
                    label={{ value: '70', fontSize: 9, fill: 'var(--red)', position: 'right' }}/>
                  <ReferenceLine y={30} stroke="var(--green)" strokeDasharray="3 3" strokeOpacity={0.5}
                    label={{ value: '30', fontSize: 9, fill: 'var(--green)', position: 'right' }}/>
                  <ReferenceLine y={50} stroke="var(--border-2)" strokeDasharray="2 4" strokeOpacity={0.4}/>
                  <Line type="monotone" dataKey="rsi" name="RSI" stroke="#A855F7" strokeWidth={1.5} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </Panel>

        {/* MACD with zero line */}
        <Panel title="MACD (12, 26, 9) - histogram · signal line">
          <div className="chart-sub" role="img" aria-label={`${selectedTicker} MACD chart`}>
            {chartData.length > 0 && !chartLoading && (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="time" hide={true} />
                  <YAxis stroke="var(--border)" tick={{fill:'var(--text-3)', fontSize: 10, fontFamily: 'Inter, system-ui, sans-serif'}} width={50} />
                  <Tooltip content={<ChartTooltip />} />
                  <ReferenceLine y={0} stroke="var(--text-3)" strokeOpacity={0.4} strokeWidth={1}/>
                  <Bar dataKey="macd_hist" name="Histogram" maxBarSize={4}>
                    {chartData.map((entry, index) => (
                      <Cell
                        key={`macd-${index}`}
                        fill={(entry.macd_hist ?? 0) >= 0
                          ? (isDark ? '#3DD68C' : '#0D7C3F')
                          : (isDark ? '#FF6B6B' : '#C92A2A')
                        }
                        fillOpacity={0.6}
                      />
                    ))}
                  </Bar>
                  <Line type="monotone" dataKey="macd" name="MACD" stroke="var(--blue)" strokeWidth={1.5} dot={false} />
                  <Line type="monotone" dataKey="macd_signal" name="Signal" stroke="var(--amber)" strokeWidth={1} dot={false} strokeDasharray="3 3" />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </Panel>

        {/* Score History */}
        {tickerScores.length > 1 && (
          <Panel title={`Composite Score History - ${tickerScores.length} scans`}>
            <div className="chart-score">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={tickerScores}>
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="date" stroke="var(--border)" tick={{fill:'var(--text-3)', fontSize: 9, fontFamily: 'Inter, system-ui, sans-serif'}} tickMargin={8} minTickGap={20} />
                  <YAxis domain={[0, 10]} stroke="var(--border)" tick={{fill:'var(--text-3)', fontSize: 10, fontFamily: 'Inter, system-ui, sans-serif'}} width={35} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend verticalAlign="top" height={24} align="right" wrapperStyle={{fontFamily: 'Inter, system-ui, sans-serif', fontSize: '9px', color: 'var(--text-3)'}}/>
                  <Line type="monotone" name="Composite" dataKey="composite" stroke="var(--brand)" strokeWidth={2} dot={{r: 2, fill: 'var(--brand)'}} />
                  <Line type="monotone" name="Tech" dataKey="tech" stroke="var(--blue)" strokeWidth={1} dot={false} strokeDasharray="4 2" />
                  <Line type="monotone" name="Fund" dataKey="fund" stroke="var(--green)" strokeWidth={1} dot={false} strokeDasharray="4 2" />
                  <Line type="monotone" name="Research" dataKey="research" stroke="var(--amber)" strokeWidth={1} dot={false} strokeDasharray="4 2" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        )}

        {/* Score Breakdown */}
        {selectedAsset && (
        <div className="card p-5">
            <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text)' }}>Score Breakdown</h3>
            <div className="space-y-2.5">
              {scoreBar('Composite', Number(selectedAsset.Composite_Score) || 0, 0, 10)}
              {scoreBar('Tech', Number(selectedAsset.Tech_Score) || 0, -1, 1)}
              {scoreBar('Fund', Number(selectedAsset.Fund_Score) || 0, 0, 10)}
              {scoreBar('Research', Number(selectedAsset.Research_Score) || 0, 0, 10)}
              <div className="pt-2 space-y-2.5" style={{ borderTop: '1px solid var(--border)' }}>
                {scoreBar('Piotroski', Number(selectedAsset.Piotroski_F) || 0, 0, 9)}
                {scoreBar('Gross Profit', Number(selectedAsset.Gross_Profit_Score) || 0, 0, 10)}
                {scoreBar('Earnings Q', Number(selectedAsset.Earnings_Quality) || 0, 0, 10)}
                {scoreBar('Value', Number(selectedAsset.Value_Score) || 0, 0, 10)}
                {scoreBar('Investment', Number(selectedAsset.Investment_Score) || 0, 0, 10)}
                {scoreBar('SUE', Number(selectedAsset.SUE_Score) || 0, 0, 10)}
                {scoreBar('Volatility', Number(selectedAsset.Vol_60D) || 0, 0, 60)}
              </div>
            </div>
          </div>
        )}

        {/* Peer Comparison */}
  <div className="overflow-hidden card">
          <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Sector Peer Comparison</h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>Comparing {selectedAsset?.Sector} by market cap</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
                  <th className="py-3 px-4 text-xs font-medium" style={{ color: 'var(--text-2)' }}>Ticker</th>
                  <th className="py-3 px-4 text-xs font-medium text-right hidden sm:table-cell" style={{ color: 'var(--text-2)' }}>Mkt Cap</th>
                  <th className="py-3 px-4 text-xs font-medium text-right" style={{ color: 'var(--text-2)' }}>Score</th>
                  <th className="py-3 px-4 text-xs font-medium text-right hidden md:table-cell" style={{ color: 'var(--text-2)' }}>Tech</th>
                  <th className="py-3 px-4 text-xs font-medium text-right hidden lg:table-cell" style={{ color: 'var(--text-2)' }}>Fund</th>
                  <th className="py-3 px-4 text-xs font-medium text-right hidden lg:table-cell" style={{ color: 'var(--text-2)' }}>Research</th>
                  <th className="py-3 px-4 text-xs font-medium text-right hidden xl:table-cell" style={{ color: 'var(--text-2)' }}>P/E</th>
                  <th className="py-3 px-4 text-xs font-medium text-right hidden xl:table-cell" style={{ color: 'var(--text-2)' }}>F-Score</th>
                  <th className="py-3 px-4 text-xs font-medium text-right hidden xl:table-cell" style={{ color: 'var(--text-2)' }}>Value</th>
                  <th className="py-3 px-4 text-xs font-medium text-right hidden xl:table-cell" style={{ color: 'var(--text-2)' }}>Beta</th>
                  <th className="py-3 px-4 text-xs font-medium text-right" style={{ color: 'var(--text-2)' }}>Conv</th>
                </tr>
              </thead>
              <tbody>
                {peerGroup.length > 0 ? peerGroup.map((row, i) => (
                  <tr
                    key={i}
                    onClick={() => setSelectedTicker(row.Ticker)}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      background: row.Ticker === selectedTicker ? 'var(--brand-soft)' : 'transparent',
                      borderLeft: row.Ticker === selectedTicker ? '2px solid var(--brand)' : '2px solid transparent',
                      cursor: 'pointer',
                      transition: 'background var(--dur-fast)',
                    }}
                    onMouseEnter={e => { if (row.Ticker !== selectedTicker) e.currentTarget.style.background = 'var(--surface-2)' }}
                    onMouseLeave={e => { if (row.Ticker !== selectedTicker) e.currentTarget.style.background = 'transparent' }}
                  >
                    <td className="py-3 px-4 text-sm font-medium" style={{ color: 'var(--text)' }}>{row.Ticker.replace('.NS', '')}</td>
                    <td className="py-3 px-4 text-right text-sm hidden sm:table-cell" style={{ color: 'var(--text-2)' }}>{num(row.Market_Cap_B)}B</td>
                    <td className={`py-3 px-4 text-right text-sm font-medium ${scoreColor(row.Composite_Score)}`}>{num(row.Composite_Score)}</td>
                    <td className={`py-3 px-4 text-right text-sm font-medium hidden md:table-cell ${colorCode(row.Tech_Score)}`}>{num(row.Tech_Score)}</td>
                    <td className={`py-3 px-4 text-right text-sm font-medium hidden lg:table-cell`}>{num(row.Fund_Score)}</td>
                    <td className={`py-3 px-4 text-right text-sm font-medium hidden lg:table-cell`}>{num(row.Research_Score)}</td>
                    <td className="py-3 px-4 text-right text-sm hidden xl:table-cell" style={{ color: 'var(--text-2)' }}>{num(row['P/E'])}</td>
                    <td className={`py-3 px-4 text-right text-sm font-medium hidden xl:table-cell`}>{row.Piotroski_F ?? '-'}</td>
                    <td className={`py-3 px-4 text-right text-sm font-medium hidden xl:table-cell ${Number(row.Value_Score) >= 7 ? 'text-green' : Number(row.Value_Score) < 4 ? 'text-red' : ''}`}>{num(row.Value_Score)}</td>
                    <td className={`py-3 px-4 text-right text-sm font-medium hidden xl:table-cell ${row.Beta != null && row.Beta < 0.8 ? 'text-green' : row.Beta != null && row.Beta > 1.2 ? 'text-red' : ''}`}>{row.Beta != null ? row.Beta.toFixed(2) : '-'}</td>
                    <td className="py-3 px-4 text-right text-sm font-medium" style={{ color: 'var(--text)' }}>{row.Conviction || '-'}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={11} className="py-4 text-center text-sm" style={{ color: 'var(--text-3)' }}>No peers in {selectedAsset?.Sector}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
    </div>
  )
}
