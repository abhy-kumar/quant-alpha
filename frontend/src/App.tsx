import React, { useEffect, useState, useMemo } from 'react'
import axios from 'axios'
import { Activity, Database, TrendingUp, BarChart2, Layers, Moon, Sun, Zap } from 'lucide-react'
import type { DashboardData } from './types'
import SignalsTab from './components/SignalsTab'
import ScreenerTab from './components/ScreenerTab'
import ChartingTab from './components/ChartingTab'
import HeatmapTab from './components/HeatmapTab'
import FactorLabTab from './components/FactorLabTab'

function Tape({ data }: { data: DashboardData[] }) {
  const items = useMemo(() => data.slice(0, 30).map(d => ({
    t: d.Ticker.replace('.NS', ''),
    p: Number(d.Price) || 0,
    c: Number(d['1d_Chg_%']) || 0,
  })), [data])
  if (!items.length) return null
  return (
    <div className="overflow-hidden" style={{ background: '#010409' }}>
      <div className="tape flex whitespace-nowrap">
        {[...items, ...items].map((x, i) => (
          <span key={i} className="inline-flex items-center gap-2 px-4 py-1.5 text-[11px]">
            <span className="font-medium" style={{ color: '#E6EDF3' }}>{x.t}</span>
            <span className="font-mono" style={{ color: '#8B949E' }}>{x.p.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            <span className="font-mono" style={{ color: x.c >= 0 ? '#3FB950' : '#F85149' }}>{x.c >= 0 ? '\u25B2' : '\u25BC'} {Math.abs(x.c).toFixed(2)}%</span>
          </span>
        ))}
      </div>
    </div>
  )
}

const TABS = [
  { id: 'picks', label: 'Signals', icon: TrendingUp },
  { id: 'fundamentals', label: 'Screen', icon: Database },
  { id: 'charting', label: 'Charts', icon: BarChart2 },
  { id: 'heatmap', label: 'Heatmap', icon: Layers },
  { id: 'factorlab', label: 'Factor Lab', icon: Activity },
] as const

export default function App() {
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
  const [isDark, setIsDark] = useState(false)
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
  const [scoreHistory, setScoreHistory] = useState<Record<string,{date:string;composite:number}[]>>({})

  useEffect(() => { localStorage.setItem('qa_watchlist', JSON.stringify(watchlist)) }, [watchlist])
  useEffect(() => { isDark ? document.documentElement.classList.add('dark') : document.documentElement.classList.remove('dark') }, [isDark])
  useEffect(() => { fetch('/score_history.json?t='+Date.now()).then(r=>r.json()).then(setScoreHistory).catch(()=>{}) }, [])

  const dataRef = React.useRef<DashboardData[]>([])
  useEffect(() => { dataRef.current = data }, [data])

  const fetchLive = async () => {
    if (!dataRef.current.length) return
    try {
      const res = await axios.post('/api/live_data', { tickers: dataRef.current.map(d=>d.Ticker) })
      if (res.data.status === 'ok') {
        const lp = res.data.data
        setData(dataRef.current.map(d => lp[d.Ticker] ? { ...d, Price: lp[d.Ticker].price||d.Price, "1d_Chg_%": lp[d.Ticker].change_pct??d["1d_Chg_%"] } : d))
        if (res.data.nifty_50) setNiftyData(res.data.nifty_50)
        setPricesUpdated(new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true})+' IST')
        setIsDynamic(true)
        return res.data.is_market_closed ? 'closed' : 'ok'
      }
    } catch { return 'err' }
  }

  const fetchData = async () => {
    try {
      const res = await axios.get(`/market_data.json?t=${Date.now()}`)
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
  const Pill = ({children, className=''}:{children:React.ReactNode;className?:string}) => <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-md ${className}`}>{children}</span>

  return (
    <div className="min-h-screen flex flex-col" style={{ background:'var(--bg)' }}>
      <Tape data={data} />

      {/* Header */}
      <header className="sticky top-0 z-40" style={{ background:'#0D1117', borderBottom:'1px solid #21262D' }}>
        <div className="max-w-[1400px] mx-auto px-5 h-16 flex items-center">
          {/* Left: nav */}
          <nav className="hidden md:flex items-center gap-0.5">
            {TABS.map(tab => (
              <button key={tab.id} onClick={()=>setActiveTab(tab.id as any)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium rounded-md transition-colors"
                style={{ color: activeTab===tab.id?'#F0F6FC':'#8B949E', background: activeTab===tab.id?'rgba(255,255,255,0.08)':'transparent' }}>
                <tab.icon size={14} />{tab.label}
              </button>
            ))}
          </nav>

          <div className="flex-1" />

          {/* Center: logo */}
          <button onClick={()=>setActiveTab('picks')} className="absolute left-1/2 -translate-x-1/2 hover:opacity-80 transition-opacity">
            <img src="/logo-dark.svg" alt="Alpha" className="h-10 w-auto" />
          </button>

          <div className="flex-1" />

          {/* Right: indicators */}
          <div className="hidden lg:flex items-center gap-3 text-[12px]">
            {niftyData && <>
              <span style={{color:'#8B949E'}}>NIFTY</span>
              <span className="font-mono font-medium whitespace-nowrap" style={{color:'#E6EDF3'}}>{niftyData.price.toLocaleString('en-IN')}</span>
              <span className="font-mono font-medium whitespace-nowrap" style={{color:niftyData.is_up?'#3FB950':'#F85149'}}>
                {niftyData.is_up?'+':''}{niftyData.change_pct}%
              </span>
            </>}
            <span className="w-px h-3.5" style={{background:'#21262D'}}/>
            {marketRegimeScore!==null && <Pill className={marketRegimeScore>=1?'text-[#3FB950]':marketRegimeScore<=-1?'text-[#F85149]':'text-[#D29922]'}><Zap size={11}/>{regimeLabel}</Pill>}
            {fiiNet!==null && <span className="font-mono whitespace-nowrap" style={{color:fiiNet>0?'#3FB950':'#F85149'}}>FII {fiiNet>0?'+':''}{Math.round(fiiNet)}</span>}
            {diiNet!==null && <span className="font-mono whitespace-nowrap" style={{color:diiNet>0?'#3FB950':'#F85149'}}>DII {diiNet>0?'+':''}{Math.round(diiNet)}</span>}
            {pcr!==null && <span className="font-mono" style={{color:'#8B949E'}}>PCR {pcr.toFixed(2)}</span>}
            {coveragePct!==null && <span style={{color:'#484F58'}}>{coveragePct}%</span>}
          </div>

          <button onClick={()=>setIsDark(!isDark)} className="ml-3 p-1.5 rounded-md" style={{color:'#8B949E'}} title="Toggle theme">
            {isDark?<Sun size={15}/>:<Moon size={15}/>}
          </button>
        </div>
      </header>

      {/* Content — consistent start position for all tabs */}
      <main className="flex-1 max-w-[1400px] mx-auto w-full px-5 py-5">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <div className="w-48 h-1 rounded-full overflow-hidden" style={{background:'var(--border)'}}>
              <div className="h-full rounded-full animate-[scroll_2s_ease-in-out_infinite_alternate] origin-left" style={{background:'var(--brand)',width:'100%'}}/>
            </div>
            <span className="text-sm" style={{color:'var(--text-3)'}}>Loading...</span>
          </div>
        ) : !data.length ? (
          <div className="flex flex-col items-center justify-center h-96 gap-3 text-center">
            <span className="text-sm" style={{color:'var(--text-2)'}}>Could not load market data.</span>
            {loadError && <span className="text-xs" style={{color:'var(--red)'}}>{loadError}</span>}
          </div>
        ) : (
          <div className="animate-in">
            {activeTab==='picks' && <SignalsTab topPicks={topPicks} horizon={horizon} setHorizon={setHorizon} onSelect={handleSelect}/>}
            {activeTab==='fundamentals' && <ScreenerTab data={data} onSelect={handleSelect} expandedRow={expandedRow} setExpandedRow={setExpandedRow} watchlist={watchlist} toggleWatchlist={t=>setWatchlist(p=>p.includes(t)?p.filter(x=>x!==t):[...p,t])} scoreHistory={scoreHistory}/>}
            {activeTab==='charting' && <ChartingTab data={data} selectedTicker={selectedTicker} setSelectedTicker={setSelectedTicker} chartData={chartData} chartLoading={chartLoading} chartPeriod={chartPeriod} setChartPeriod={setChartPeriod} chartInterval={chartInterval} setChartInterval={setChartInterval} isDark={isDark} peerGroup={peerGroup} selectedAsset={selectedAsset}/>}
            {activeTab==='heatmap' && <HeatmapTab sectorMap={sectorMap} onSelect={handleSelect} isDark={isDark}/>}
            {activeTab==='factorlab' && <FactorLabTab outcomeAccuracy={outcomeAccuracy} firstScanDate={firstScanDate} isDark={isDark}/>}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto" style={{borderTop:'1px solid var(--border)'}}>
        <div className="max-w-[1400px] mx-auto px-5 py-5 flex flex-wrap items-center justify-between gap-4 text-[11px]" style={{color:'var(--text-3)'}}>
          <div className="flex items-center gap-4">
            <span>Signals {scanUpdated||'\u2014'}</span>
            <span>Prices {pricesUpdated||scanUpdated||'\u2014'}{isDynamic&&<span className="ml-1" style={{color:'var(--green)'}}>Live</span>}</span>
          </div>
          <span>Educational purposes only. Not investment advice.</span>
          <span>Alpha Research &amp; Investment Club, FMS Delhi</span>
        </div>
      </footer>
    </div>
  )
}
