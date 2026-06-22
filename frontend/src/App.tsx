import React, { useEffect, useState, useMemo, memo, lazy, Suspense } from 'react'
import axios from 'axios'
import { TrendingUp, BarChart2, Layers, Moon, Sun, AlertCircle, Database, Activity } from 'lucide-react'
import { Analytics } from '@vercel/analytics/react'
import type { DashboardData } from './types'

console.log('[Alpha] App.tsx module loaded')

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[Alpha] ErrorBoundary caught:', error, info.componentStack)
    this.setState({ error })
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, fontFamily: 'monospace', whiteSpace: 'pre-wrap', background: '#fff', color: '#c00' }}>
          <h2>Component Error</h2>
          <p>{this.state.error.message}</p>
          <pre>{this.state.error.stack}</pre>
          <button onClick={() => this.setState({ error: null })} style={{ marginTop: 16, padding: '8px 16px', cursor: 'pointer' }}>Retry</button>
        </div>
      )
    }
    return this.props.children
  }
}

const SignalsTab   = lazy(() => import('./components/SignalsTab').then(m => { console.log('[Alpha] SignalsTab chunk loaded'); return m }))
const ScreenerTab  = lazy(() => import('./components/ScreenerTab').then(m => { console.log('[Alpha] ScreenerTab chunk loaded'); return m }))
const ChartingTab  = lazy(() => import('./components/ChartingTab').then(m => { console.log('[Alpha] ChartingTab chunk loaded'); return m }))
const HeatmapTab   = lazy(() => import('./components/HeatmapTab').then(m => { console.log('[Alpha] HeatmapTab chunk loaded'); return m }))
const FactorLabTab = lazy(() => import('./components/FactorLabTab').then(m => { console.log('[Alpha] FactorLabTab chunk loaded'); return m }))

function TabSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            height: 340, background: 'var(--surface)',
            borderRadius: 'var(--radius)',
            animation: `pulse 1.5s ${i * 0.12}s ease-in-out infinite`,
          }}/>
        ))}
      </div>
    </div>
  )
}

function TapeInner({ data }: { data: DashboardData[] }) {
  const items = useMemo(() => data.map(d => ({
    t: d.Ticker.replace('.NS', ''),
    p: Number(d.Price) || 0,
    c: Number(d['1d_Chg_%']) || 0,
  })), [data])
  if (!items.length) return null

  const tapeBackground = 'hsl(217, 20%, 8%)'
  const duration = (items.length * 217) / 150;

  return (
    <div className="overflow-hidden" style={{ background: tapeBackground }}>
      <div className="tape flex w-max whitespace-nowrap scrollbar-none" style={{ animation: `scroll ${duration}s linear infinite` }}>
          {[...items, ...items].map((x, i) => (
            <span key={i} className="inline-flex items-center px-4 py-1.5 text-[11px] shrink-0">
              <span className="font-medium" style={{ color: '#E6EDF3' }}>{x.t}</span>
              <span style={{ color: 'rgba(255,255,255,0.15)', margin: '0 8px' }}>·</span>
              <span className="flex items-center gap-2">
                <span className="font-mono text-right w-[65px] shrink-0" style={{ color: '#8B949E' }}>{x.p.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                <span className="font-mono text-right w-[60px] shrink-0" style={{ color: x.c >= 0 ? '#3FB950' : '#F85149' }}>{x.c >= 0 ? '▲' : '▼'} {Math.abs(x.c).toFixed(2)}%</span>
              </span>
            </span>
          ))}
        </div>
      </div>
  )
}

const Tape = memo(TapeInner)

const TABS = [
  { id: 'picks', label: 'Signals', icon: TrendingUp },
  { id: 'fundamentals', label: 'Screen', icon: Database },
  { id: 'charting', label: 'Charts', icon: BarChart2 },
  { id: 'heatmap', label: 'Heatmap', icon: Layers },
  { id: 'factorlab', label: 'Factor Lab', icon: Activity },
] as const

export default function App() {
  console.log('[Alpha] App component mounting')
  const [data, setData] = useState<DashboardData[]>([])
  const [scanUpdated, setScanUpdated] = useState('')
  const [pricesUpdated, setPricesUpdated] = useState('')
  const [loading, setLoading] = useState(true)
  const [niftyData, setNiftyData] = useState<{price:number;change_pct:number;is_up:boolean}|null>(null)
  const [coveragePct, setCoveragePct] = useState<number|null>(null)
  const [loadError, setLoadError] = useState<string|null>(null)
  const [marketRegimeScore, setMarketRegimeScore] = useState<number|null>(null)
  const [isDynamic, setIsDynamic] = useState(false)
  const [activeTab, setActiveTab] = useState<'picks'|'fundamentals'|'charting'|'heatmap'|'factorlab'>('picks')
  const [fiiNet, setFiiNet] = useState<number|null>(null)
  const [diiNet, setDiiNet] = useState<number|null>(null)
  const [pcr, setPcr] = useState<number|null>(null)
  const [isDark, setIsDark] = useState(() => {
    try { return localStorage.getItem('qa_dark') === 'true' } catch {}
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })
  const [horizon, setHorizon] = useState<'short'|'long'>('short')
  const [selectedTicker, setSelectedTicker] = useState('')
  const [chartPeriod, setChartPeriod] = useState('1y')
  const [chartInterval, setChartInterval] = useState('1d')
  const [chartData, setChartData] = useState<any[]>([])
  const [chartLoading, setChartLoading] = useState(false)
  const [expandedRow, setExpandedRow] = useState<string|null>(null)
  const [outcomeAccuracy, setOutcomeAccuracy] = useState<Record<string,any>>({})
  const [firstScanDate, setFirstScanDate] = useState('')
  const [watchlist, setWatchlist] = useState<string[]>(() => {
    try { const s = localStorage.getItem('qa_watchlist'); if (s) return JSON.parse(s) } catch {}
    const wl = new URLSearchParams(window.location.search).get('watchlist')
    return wl ? wl.split(',').map(t => t.toUpperCase().trim()) : []
  })
  const [scoreHistory, setScoreHistory] = useState<Record<string,{date:string;composite:number;tech:number;fund:number;research:number}[]>>({})
  const [flashTickers, setFlashTickers] = useState<Record<string, 'up'|'down'>>({})

  useEffect(() => { localStorage.setItem('qa_watchlist', JSON.stringify(watchlist)) }, [watchlist])
  useEffect(() => { localStorage.setItem('qa_dark', String(isDark)) }, [isDark])
  useEffect(() => { isDark ? document.documentElement.classList.add('dark') : document.documentElement.classList.remove('dark') }, [isDark])

  useEffect(() => {
    const cached = sessionStorage.getItem('qa_score_history')
    if (cached) { try { setScoreHistory(JSON.parse(cached)); return } catch {} }
    fetch('/score_history.json?t='+Date.now()).then(r=>r.json()).then(d => {
      setScoreHistory(d)
      try { sessionStorage.setItem('qa_score_history', JSON.stringify(d)) } catch {}
    }).catch(()=>{})
  }, [])

  useEffect(() => {
    const ticker = new URLSearchParams(window.location.search).get('ticker')
    if (ticker && data.length) {
      setSelectedTicker(ticker.toUpperCase() + '.NS')
      setActiveTab('charting')
    }
  }, [data])

  const dataRef = React.useRef<DashboardData[]>([])
  useEffect(() => { dataRef.current = data }, [data])

  const fetchLive = async () => {
    if (!dataRef.current.length) return
    try {
      console.log('[Alpha] fetchLive: calling /api/live_data with', dataRef.current.length, 'tickers')
      const res = await axios.post('/api/live_data', { tickers: dataRef.current.map(d=>d.Ticker) })
      if (res.data.status === 'ok') {
        const lp = res.data.data
        let changed = false
        const newData = dataRef.current.map(d => {
          const live = lp[d.Ticker]
          if (!live) return d
          const price = live.price || d.Price
          const chg = live.change_pct ?? d["1d_Chg_%"]
          if (price !== d.Price || chg !== d["1d_Chg_%"]) changed = true
          return { ...d, Price: price, "1d_Chg_%": chg }
        })
        if (changed) setData(newData)
        if (res.data.nifty_50) setNiftyData(res.data.nifty_50)
        setPricesUpdated(new Date().toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit',hour12:true})+' IST')
        setIsDynamic(true)

        const newFlash: Record<string, 'up'|'down'> = {}
        newData.forEach((d, i) => {
          const old = dataRef.current[i]
          if (old && d.Price !== old.Price) newFlash[d.Ticker] = d.Price > old.Price ? 'up' : 'down'
        })
        if (Object.keys(newFlash).length) {
          setFlashTickers(newFlash)
          setTimeout(() => setFlashTickers({}), 800)
        }

        return res.data.is_market_closed ? 'closed' : 'ok'
      }
    } catch (e) { console.error('[Alpha] fetchLive error:', e); return 'err' }
  }

  const fetchData = async () => {
    try {
      console.log('[Alpha] fetchData: fetching /market_data.json')
      const res = await axios.get(`/market_data.json?t=${Date.now()}`)
      console.log('[Alpha] fetchData: response status =', res.data.status, ', data count =', res.data.data?.length)
      if (res.data.status==='ok' && res.data.data.length>0) {
        const d = res.data.data.sort((a:any,b:any)=>a.Ticker.localeCompare(b.Ticker))
        setData(d); setScanUpdated(res.data.last_updated||'')
        if (res.data.nifty_50) setNiftyData(res.data.nifty_50)
        setCoveragePct(res.data.coverage_pct??null); setMarketRegimeScore(res.data.market_regime_score??null)
        setFiiNet(res.data.fii_net??null); setDiiNet(res.data.dii_net??null); setPcr(res.data.pcr??null)
        setOutcomeAccuracy(res.data.outcome_accuracy||{}); setFirstScanDate(res.data.first_scan_date||'')
        setIsDynamic(res.data.is_dynamic||false); if (!selectedTicker) setSelectedTicker(d[0].Ticker)
        setLoading(false); return true
      }
    } catch(e:any) { setLoadError(e.message||String(e)) }
    setLoading(false); return false
  }

  useEffect(() => {
    let id: ReturnType<typeof setInterval>
    ;(async () => {
      if (await fetchData()) {
        setTimeout(async () => {
          const s = await fetchLive()
          if (s !== 'closed') id = setInterval(async () => { if (await fetchLive()==='closed') clearInterval(id) }, 3*60*1000)
        }, 1000)
      }
    })()
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!selectedTicker) return
    setChartLoading(true)
    axios.get(`/api/chart?ticker=${encodeURIComponent(selectedTicker)}&period=${chartPeriod}&interval=${chartInterval}`)
      .then(r => setChartData(r.data.status==='ok'?r.data.data:[]))
      .catch(() => setChartData([]))
      .finally(() => setChartLoading(false))
  }, [selectedTicker, chartPeriod, chartInterval])

  const topPicks = useMemo(() => {
    let f = [...data].filter(d => !d.Ticker.includes('BEES') && d.Sector!=='ETF')
    if (horizon==='short') f = f.filter(d=>{const v=Number(d.Fund_Score);return isNaN(v)||v>=5}).sort((a,b)=>Number(b.Composite_Score||0)-Number(a.Composite_Score||0))
    else f = f.filter(d=>{const v=Number(d.Research_Score);return !isNaN(v)&&v>5}).sort((a,b)=>Number(b.Composite_Score_Fund||0)-Number(a.Composite_Score_Fund||0))
    return f.slice(0,3)
  }, [data, horizon])

  const sectorMap = useMemo(() => { const m:Record<string,DashboardData[]>={}; data.forEach(d=>{const s=d.Sector||'Unknown';(m[s]=m[s]||[]).push(d)}); return m }, [data])
  const selectedAsset = useMemo(() => data.find(d=>d.Ticker===selectedTicker)||null, [data, selectedTicker])
  const peerGroup = useMemo(() => {
    if (!selectedAsset?.Sector||selectedAsset.Sector==='Unknown') return []
    return [selectedAsset,...data.filter(d=>d.Sector===selectedAsset.Sector&&d.Ticker!==selectedAsset.Ticker).sort((a,b)=>Number(b.Market_Cap_B||0)-Number(a.Market_Cap_B||0)).slice(0,5)]
  }, [data, selectedAsset])

  const handleSelect = (t: string) => { setSelectedTicker(t); setActiveTab('charting') }
  const regimeLabel = marketRegimeScore!==null?(marketRegimeScore>0?'Bullish':marketRegimeScore<0?'Bearish':'Neutral'):''
  const regimeColor = marketRegimeScore!==null?(marketRegimeScore>0?'var(--green)':marketRegimeScore<0?'var(--red)':'var(--amber)'):'var(--text-3)'

  return (
    <div className="min-h-screen flex flex-col" style={{ background:'var(--bg)' }}>
      <Tape data={data} />

      {/* Header - Row 1: Nav */}
      <header className="sticky top-0 z-40" style={{ background:'var(--surface)', borderBottom:'1px solid var(--border)' }}>
        <div className="max-w-[1400px] mx-auto px-3 md:px-6 h-[44px] flex items-center">
          {/* Left: nav */}
          <nav className="hidden md:flex items-center gap-0.5">
            {TABS.map(tab => (
              <button key={tab.id} onClick={()=>setActiveTab(tab.id as any)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium"
                style={{
                  color: activeTab===tab.id ? 'var(--text)' : 'var(--text-3)',
                  borderBottom: activeTab===tab.id ? '2px solid var(--brand)' : '2px solid transparent',
                  paddingBottom: '6px',
                  background: 'transparent',
                  transition: 'color 150ms ease, border-color 150ms ease',
                }}>
                <tab.icon size={14} />{tab.label}
              </button>
            ))}
          </nav>

          <div className="flex-1" />

          {/* Center: logo */}
          <button onClick={()=>setActiveTab('picks')} className="absolute left-1/2 -translate-x-1/2 hover:opacity-80 transition-opacity">
            <img src={isDark?'/logo-dark.svg':'/logo-light.svg'} alt="Alpha" className="h-[36px] md:h-[42px] w-auto" />
          </button>

          <div className="flex-1" />

          <button onClick={()=>setIsDark(!isDark)} aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
              borderRadius: 'var(--radius)', border: '1px solid var(--border)',
              background: 'var(--surface-2)', cursor: 'pointer',
              fontSize: 11, color: 'var(--text-3)',
              transition: 'background var(--dur-base), border-color var(--dur-base)' }}>
            {isDark ? <Sun size={13}/> : <Moon size={13}/>}
            {isDark ? 'Light' : 'Dark'}
          </button>
        </div>
      </header>

      {/* Row 2: Market Data Sub-Header (Bloomberg-style) */}
      <div style={{ background:'var(--surface-2)', borderBottom:'1px solid var(--border)' }}>
        <div className="max-w-[1400px] mx-auto px-3 md:px-6 h-[30px] flex items-center gap-3 overflow-x-auto scrollbar-none text-[11px]">
          {/* LIVE indicator */}
          <div style={{ display:'flex', alignItems:'center', gap:4, flexShrink:0 }}>
            <div style={{ width:5, height:5, borderRadius:'50%',
              background: isDynamic ? 'var(--amber)' : 'var(--text-3)',
              transition: 'background 300ms ease',
              boxShadow: isDynamic ? '0 0 4px var(--amber)' : 'none' }}/>
            <span style={{ fontSize:9, color:'var(--text-3)', letterSpacing:'0.08em', fontWeight:600 }}>
              {isDynamic ? 'LIVE' : 'CLOSED'}
            </span>
          </div>

          <span style={{ width:1, height:12, background:'var(--border)', flexShrink:0 }}/>

          {niftyData && (
            <span style={{ display:'inline-flex', alignItems:'center', gap:4, flexShrink:0 }}>
              <span style={{ color:'var(--text-3)', fontWeight:500 }}>NIFTY</span>
              <span className="font-mono" style={{ fontWeight:700, color:'var(--text)' }}>
                {niftyData.price.toLocaleString('en-IN')}
              </span>
              <span className="font-mono" style={{ color: niftyData.is_up ? 'var(--green)' : 'var(--red)' }}>
                {niftyData.is_up?'▲':'▼'}{niftyData.change_pct}%
              </span>
            </span>
          )}

          {marketRegimeScore!==null && (
            <span style={{ display:'inline-flex', alignItems:'center', gap:3, flexShrink:0 }}>
              <span style={{ width:5, height:5, borderRadius:'50%', background: regimeColor, display:'inline-block' }}/>
              <span className="font-mono" style={{ fontWeight:500, color:'var(--text)' }}>
                {regimeLabel} {marketRegimeScore > 0 ? '+' : ''}{marketRegimeScore}
              </span>
            </span>
          )}

          {fiiNet!==null && (
            <span style={{ display:'inline-flex', alignItems:'center', gap:3, flexShrink:0, fontWeight:500 }}>
              <span style={{ color:'var(--text-3)' }}>FII</span>
              <span className="font-mono" style={{ color: fiiNet > 0 ? 'var(--green)' : 'var(--red)' }}>
                {fiiNet > 0 ? '+' : ''}{Math.round(fiiNet)}
              </span>
            </span>
          )}

          {diiNet!==null && (
            <span style={{ display:'inline-flex', alignItems:'center', gap:3, flexShrink:0, fontWeight:500 }}>
              <span style={{ color:'var(--text-3)' }}>DII</span>
              <span className="font-mono" style={{ color: diiNet > 0 ? 'var(--green)' : 'var(--red)' }}>
                {diiNet > 0 ? '+' : ''}{Math.round(diiNet)}
              </span>
            </span>
          )}

          {pcr!==null && (
            <span style={{ display:'inline-flex', alignItems:'center', gap:3, flexShrink:0, fontWeight:500 }}>
              <span style={{ color:'var(--text-3)' }}>PCR</span>
              <span className="font-mono" style={{ color:'var(--text)' }}>{pcr.toFixed(2)}</span>
            </span>
          )}

          {coveragePct!==null && (
            <span style={{ flexShrink:0, fontWeight:500 }}>
              <span className="font-mono" style={{ color:'var(--text-2)' }}>{coveragePct}%</span>
            </span>
          )}

          <div className="flex-1" />

          {pricesUpdated && (
            <span style={{ flexShrink:0, color:'var(--text-3)', fontSize:10 }}>
              {pricesUpdated}
            </span>
          )}
        </div>
      </div>

      {/* Mobile tab bar */}
      <nav className="md:hidden overflow-x-auto border-b" style={{ borderColor:'var(--border)', background:'var(--surface)' }}>
        <div className="flex items-center gap-0.5 px-3 py-1.5">
          {TABS.map(tab => (
            <button key={tab.id} onClick={()=>setActiveTab(tab.id as any)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium whitespace-nowrap shrink-0"
              style={{
                color: activeTab===tab.id ? 'var(--text)' : 'var(--text-3)',
                borderBottom: activeTab===tab.id ? '2px solid var(--brand)' : '2px solid transparent',
                paddingBottom: '6px',
                background: 'transparent',
              }}>
              <tab.icon size={13} />{tab.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Content */}
      <main className="flex-1 max-w-[1400px] mx-auto w-full px-3 md:px-5 py-3 md:py-5">
        {loading ? (
          <TabSkeleton />
        ) : !data.length ? (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <AlertCircle size={32} style={{ color: 'var(--red)', margin: '0 auto 12px' }}/>
            <p style={{ color: 'var(--text-2)', marginBottom: 8, fontSize: 14 }}>Could not load market data.</p>
            {loadError && <p style={{ color: 'var(--red)', fontSize: 12, marginBottom: 16 }}>{loadError}</p>}
            <button onClick={() => fetchData()} style={{
              background: 'var(--brand)', color: 'white',
              padding: '8px 20px', borderRadius: 'var(--radius)',
              border: 'none', cursor: 'pointer', fontSize: 13
            }}>Retry</button>
          </div>
        ) : (
          <ErrorBoundary key={activeTab}>
            <Suspense fallback={<TabSkeleton/>}>
              <div>
                {activeTab==='picks' && <SignalsTab topPicks={topPicks} horizon={horizon} setHorizon={setHorizon} onSelect={handleSelect}/>}
                {activeTab==='fundamentals' && <ScreenerTab data={data} onSelect={handleSelect} expandedRow={expandedRow} setExpandedRow={setExpandedRow} watchlist={watchlist} toggleWatchlist={t=>setWatchlist(p=>p.includes(t)?p.filter(x=>x!==t):[...p,t])} scoreHistory={scoreHistory} flashTickers={flashTickers}/>}
                {activeTab==='charting' && <ChartingTab data={data} selectedTicker={selectedTicker} setSelectedTicker={setSelectedTicker} chartData={chartData} chartLoading={chartLoading} chartPeriod={chartPeriod} setChartPeriod={setChartPeriod} chartInterval={chartInterval} setChartInterval={setChartInterval} isDark={isDark} peerGroup={peerGroup} selectedAsset={selectedAsset} scoreHistory={scoreHistory} horizon={horizon}/>}
                {activeTab==='heatmap' && <HeatmapTab sectorMap={sectorMap} onSelect={handleSelect} isDark={isDark}/>}
                {activeTab==='factorlab' && <FactorLabTab outcomeAccuracy={outcomeAccuracy} firstScanDate={firstScanDate} isDark={isDark}/>}
              </div>
            </Suspense>
          </ErrorBoundary>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto" style={{borderTop:'1px solid var(--border)', background:'var(--surface)'}}>
        <div className="max-w-[1400px] mx-auto px-3 md:px-5 py-3 flex flex-col sm:flex-row items-center justify-between gap-2 text-[10px]" style={{color:'var(--text-3)'}}>
          <div className="flex items-center gap-3">
            <span>Made with &#10084;&#65039; by Abhishek Kumar</span>
            <span className="hidden sm:inline">|</span>
            <span className="hidden sm:inline">Educational and academic research only. Not investment advice. Data from third-party sources may contain errors. Consult a SEBI-registered advisor before investing.</span>
          </div>
          <div className="flex items-center gap-3">
            {scanUpdated && <span className="font-mono">Last scan: {scanUpdated}</span>}
            <a href="https://github.com/abhy-kumar/quant-alpha" target="_blank" rel="noopener noreferrer"
              style={{ color:'var(--text-3)', textDecoration:'none', display:'inline-flex', alignItems:'center', gap:3 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
              Source
            </a>
          </div>
        </div>
      </footer>
      <Analytics />
    </div>
  )
}
