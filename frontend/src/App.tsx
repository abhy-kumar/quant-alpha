import React, { useEffect, useState, useMemo, memo, lazy, Suspense } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { TrendUp, ChartBar, StackSimple, Moon, Sun, WarningCircle, Database, Pulse, SignOut, LockSimple } from '@phosphor-icons/react'
import { Analytics } from '@vercel/analytics/react'
import type { DashboardData } from './types'
import { useAuth } from './hooks/useAuth'
import { useMarketData } from './hooks/useMarketData'
import { useChartData } from './hooks/useChartData'
import { useWatchlist } from './hooks/useWatchlist'
import { SeoHead } from './components/common/SeoHead'
import { SocialShareModal } from './components/common/SocialShareModal'
import { NewsletterModal } from './components/common/NewsletterModal'
import { ShareNetwork, EnvelopeSimple } from '@phosphor-icons/react'

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('[Alpha] ErrorBoundary caught:', error, info.componentStack)
    }
    this.setState({ error })
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, fontFamily: 'sans-serif', background: 'var(--surface-2)', color: 'var(--text)', borderRadius: 'var(--radius-lg)', margin: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Something went wrong</h2>
          <p style={{ fontSize: 14, color: 'var(--text-2)', marginBottom: 16 }}>
            {import.meta.env.DEV ? this.state.error.message : 'An unexpected error occurred in this view.'}
          </p>
          {import.meta.env.DEV && (
            <pre style={{ padding: 12, background: 'var(--surface-3)', borderRadius: 8, fontSize: 11, overflowX: 'auto', marginBottom: 16 }}>
              {this.state.error.stack}
            </pre>
          )}
          <button onClick={() => this.setState({ error: null })} className="btn-primary" style={{ padding: '8px 16px', cursor: 'pointer' }}>
            Try Again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

const loadSignalsTab   = () => import('./components/signals/SignalsTab')
const loadScreenerTab  = () => import('./components/screener/ScreenerTab')
const loadChartingTab  = () => import('./components/charting/ChartingTab')
const loadHeatmapTab   = () => import('./components/heatmap/HeatmapTab')
const loadQuantLabTab  = () => import('./components/quantlab/QuantLabTab')

const SignalsTab   = lazy(loadSignalsTab)
const ScreenerTab  = lazy(loadScreenerTab)
const ChartingTab  = lazy(loadChartingTab)
const HeatmapTab   = lazy(loadHeatmapTab)
const QuantLabTab = lazy(loadQuantLabTab)

function TabSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[0, 1, 2].map(i => (
          <div key={i} className="glass" style={{
            height: 340,
            borderRadius: 'var(--radius-lg)',
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

  const duration = (items.length * 217) / 150;

  return (
    <div className="overflow-hidden glass-subtle" style={{ borderBottom: '0.5px solid var(--glass-border)' }}>
      <div className="tape flex w-max whitespace-nowrap scrollbar-none" style={{ animation: `scroll ${duration}s linear infinite` }}>
          {[...items, ...items].map((x, i) => (
            <span key={i} className="inline-flex items-center px-4 py-1.5 text-[11px] shrink-0">
              <span className="font-semibold" style={{ color: 'var(--text)' }}>{x.t}</span>
              <span style={{ color: 'var(--text-3)', opacity: 0.4, margin: '0 8px' }}>·</span>
              <span className="flex items-center gap-2">
                <span className="font-mono text-right w-[65px] shrink-0" style={{ color: 'var(--text-2)' }}>{x.p.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                <span className="font-mono text-right w-[60px] shrink-0 font-medium" style={{ color: x.c >= 0 ? 'var(--green)' : 'var(--red)' }}>{x.c >= 0 ? '▲' : '▼'} {Math.abs(x.c).toFixed(2)}%</span>
              </span>
            </span>
          ))}
        </div>
      </div>
  )
}

const Tape = memo(TapeInner)

const TABS = [
  { id: 'charting', label: 'Charts', icon: ChartBar },
  { id: 'picks', label: 'Signals', icon: TrendUp },
  { id: 'fundamentals', label: 'Screener', icon: Database },
  { id: 'heatmap', label: 'Heatmap', icon: StackSimple },
  { id: 'quantlab', label: 'Quant Lab', icon: Pulse },
] as const

const TAB_PATHS: Record<string, string> = {
  charting:     '/',
  picks:        '/signals',
  fundamentals: '/screen',
  heatmap:      '/heatmap',
  quantlab:     '/quant',
}
const PATH_TABS: Record<string, string> = Object.fromEntries(
  Object.entries(TAB_PATHS).map(([id, path]) => [path, id])
)

export default function App() {
  const navigate = useNavigate()
  const location = useLocation()

  const [selectedTicker, setSelectedTicker] = useState('')
  const [horizon, setHorizon] = useState<'short'|'long'>('short')
  const [isShareOpen, setIsShareOpen] = useState(false)
  const [isNewsletterOpen, setIsNewsletterOpen] = useState(false)

  const {
    isLoggedIn,
    showLogin,
    setShowLogin,
    loginEmail,
    setLoginEmail,
    loginPassword,
    setLoginPassword,
    loginError,
    loginLoading,
    loginRef,
    handleLogin,
    handleLogout,
  } = useAuth()

  const {
    data,
    scanUpdated,
    pricesUpdated,
    loading,
    niftyData,
    coveragePct,
    loadError,
    marketRegimeScore,
    isDynamic,
    fiiNet,
    diiNet,
    pcr,
    scoreHistory,
    flashTickers,
    fetchData,
  } = useMarketData(selectedTicker, setSelectedTicker)

  const {
    chartPeriod,
    setChartPeriod,
    chartInterval,
    setChartInterval,
    chartData,
    chartLoading,
  } = useChartData(selectedTicker)

  const { watchlist, toggleWatchlist } = useWatchlist()

  const [isDark, setIsDark] = useState(() => {
    try { return localStorage.getItem('qa_dark') === 'true' } catch {}
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  useEffect(() => { localStorage.setItem('qa_dark', String(isDark)) }, [isDark])
  useEffect(() => { isDark ? document.documentElement.classList.add('dark') : document.documentElement.classList.remove('dark') }, [isDark])

  useEffect(() => {
    const timer = setTimeout(() => {
      loadSignalsTab()
      loadScreenerTab()
      loadChartingTab()
      loadHeatmapTab()
      loadQuantLabTab()
    }, 150)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    const tickerParam = new URLSearchParams(window.location.search).get('ticker')
    if (tickerParam && data.length) {
      setSelectedTicker(tickerParam.toUpperCase() + '.NS')
      navigate('/')
    }
  }, [data, navigate])

  // Global keyboard shortcuts (1-5 for tab navigation, / to focus search)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'
      if (isInput) return

      if (e.key === '1') { e.preventDefault(); setActiveTab('picks') }
      else if (e.key === '2') { e.preventDefault(); setActiveTab('fundamentals') }
      else if (e.key === '3') { e.preventDefault(); setActiveTab('charting') }
      else if (e.key === '4') { e.preventDefault(); setActiveTab('heatmap') }
      else if (e.key === '5') { e.preventDefault(); setActiveTab('quantlab') }
      else if (e.key === '/') {
        e.preventDefault()
        const searchInput = document.querySelector<HTMLInputElement>('input[placeholder*="Search"]')
        if (searchInput) {
          searchInput.focus()
          searchInput.select()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isLoggedIn, navigate])

  const activeTab = (PATH_TABS[location.pathname] ?? 'charting') as 'picks'|'fundamentals'|'charting'|'heatmap'|'quantlab'
  const setActiveTab = (id: 'picks'|'fundamentals'|'charting'|'heatmap'|'quantlab') => navigate(TAB_PATHS[id] ?? '/')


  const topPicks = useMemo(() => {
    let f = [...data].filter(d => !d.Ticker.includes('BEES') && d.Sector!=='ETF')
    if (horizon==='short') f = f.filter(d=>{const v=Number(d.Fund_Score);return isNaN(v)||v>=5}).sort((a,b)=>Number(b.Composite_Score||0)-Number(a.Composite_Score||0))
    else f = f.filter(d=>{const v=Number(d.Research_Score);return !isNaN(v)&&v>5}).sort((a,b)=>Number(b.Composite_Score_Fund||0)-Number(a.Composite_Score_Fund||0))
    return f.slice(0,3)
  }, [data, horizon])

  const sectorMap = useMemo(() => {
    const m:Record<string,DashboardData[]>={}
    data.forEach(d=>{const s=d.Sector||'Unknown';(m[s]=m[s]||[]).push(d)})
    return m
  }, [data])

  const selectedAsset = useMemo(() => data.find(d=>d.Ticker===selectedTicker)||null, [data, selectedTicker])
  const visibleTabs = isLoggedIn ? TABS : TABS.filter(t => t.id === 'fundamentals' || t.id === 'charting' || t.id === 'heatmap')

  const peerGroup = useMemo(() => {
    if (!selectedAsset?.Sector||selectedAsset.Sector==='Unknown') return []
    return [selectedAsset,...data.filter(d=>d.Sector===selectedAsset.Sector&&d.Ticker!==selectedAsset.Ticker).sort((a,b)=>Number(b.Market_Cap_B||0)-Number(a.Market_Cap_B||0)).slice(0,5)]
  }, [data, selectedAsset])

  const handleSelect = (t: string) => { setSelectedTicker(t); setActiveTab('charting') }
  const regimeLabel = marketRegimeScore!==null?(marketRegimeScore>0?'Bullish':marketRegimeScore<0?'Bearish':'Neutral'):''
  const regimeColor = marketRegimeScore!==null?(marketRegimeScore>0?'var(--green)':marketRegimeScore<0?'var(--red)':'var(--amber)'):'var(--text-3)'

  return (
    <div className="min-h-screen flex flex-col" style={{ background:'var(--bg-gradient)' }}>
      <SeoHead activeTab={activeTab} selectedTicker={selectedTicker} selectedAsset={selectedAsset} />
      <Tape data={data} />

      <div>
        {/* Header - Web Application Navigation Bar */}
        <header className="glass-strong" style={{ borderBottom:'0.5px solid var(--glass-border)', borderRadius: 0 }}>
          <div className="max-w-[1400px] mx-auto px-3 md:px-6 h-[52px] flex items-center justify-between relative">
            {/* Left: Brand Logo */}
            <div className="flex items-center gap-3">
              <button onClick={()=>setActiveTab('charting')} className="flex items-center gap-2 shrink-0 hover:opacity-80 transition-opacity">
                <img src={isDark ? '/logo-dark.svg' : '/logo-light.svg'} alt="Alpha" className="h-[36px] w-auto" />
              </button>
            </div>

            {/* Desktop Center: Segmented Navigation Bar - Truly Centered */}
            <nav className="hidden md:flex items-center p-1 rounded-full glass-subtle absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 shadow-sm"
              style={{ border: '0.5px solid var(--glass-border)', backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)' }}>
              {visibleTabs.map(tab => (
                <button key={tab.id} onClick={()=>setActiveTab(tab.id as any)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 text-[12px] font-medium rounded-full transition-all duration-200"
                  style={{
                    color: activeTab===tab.id ? 'var(--text)' : 'var(--text-3)',
                    background: activeTab===tab.id ? 'var(--glass-bg-strong)' : 'transparent',
                    border: activeTab===tab.id ? '0.5px solid var(--glass-border-strong)' : '0.5px solid transparent',
                    boxShadow: activeTab===tab.id ? '0 1px 4px rgba(0,0,0,0.12), inset 0 0.5px 0 rgba(255,255,255,0.15)' : 'none',
                  }}>
                  <tab.icon size={13} weight="duotone" />{tab.label}
                </button>
              ))}
            </nav>

            {/* Right: Mode & Auth Controls */}
            <div className="flex items-center gap-1.5" ref={loginRef} style={{ position: 'relative' }}>
              <button onClick={() => setIsShareOpen(true)} title="Share Quant Research" aria-label="Share Quant Research"
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-full transition-all duration-200 hover:opacity-90 active:scale-95"
                style={{
                  color: 'var(--brand)',
                  background: 'var(--brand-soft)',
                  border: '0.5px solid var(--glass-border)',
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                  boxShadow: 'var(--glass-shadow)',
                  cursor: 'pointer',
                }}>
                <ShareNetwork size={13} weight="duotone" /><span className="hidden sm:inline">Share</span>
              </button>
              <button onClick={() => setIsNewsletterOpen(true)} title="Subscribe to Research Brief" aria-label="Subscribe to Research Brief"
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-full transition-all duration-200 hover:opacity-90 active:scale-95"
                style={{
                  color: 'var(--text-2)',
                  background: 'var(--glass-bg-subtle)',
                  border: '0.5px solid var(--glass-border)',
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                  boxShadow: 'var(--glass-shadow)',
                  cursor: 'pointer',
                }}>
                <EnvelopeSimple size={13} weight="duotone" /><span className="hidden sm:inline">Brief</span>
              </button>
              <button onClick={()=>setIsDark(!isDark)} aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-full transition-all duration-200 hover:opacity-90 active:scale-95"
                style={{
                  color: 'var(--text-3)',
                  background: 'var(--glass-bg-subtle)',
                  border: '0.5px solid var(--glass-border)',
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                  boxShadow: 'var(--glass-shadow)',
                  cursor: 'pointer',
                }}>
                {isDark ? <Sun size={13} weight="duotone"/> : <Moon size={13} weight="duotone"/>}
                <span className="hidden sm:inline">{isDark ? 'Light' : 'Dark'}</span>
              </button>
              {isLoggedIn ? (
                <button onClick={() => handleLogout(() => { if (activeTab === 'picks' || activeTab === 'quantlab') setActiveTab('charting') })} aria-label="Logout"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-full transition-all duration-200 hover:opacity-90 active:scale-95"
                  style={{
                    color: 'var(--text-3)',
                    background: 'var(--glass-bg-subtle)',
                    border: '0.5px solid var(--glass-border)',
                    backdropFilter: 'blur(16px)',
                    WebkitBackdropFilter: 'blur(16px)',
                    boxShadow: 'var(--glass-shadow)',
                    cursor: 'pointer',
                  }}>
                  <SignOut size={13} weight="duotone"/><span className="hidden sm:inline">Logout</span>
                </button>
              ) : (
                <button onClick={()=>setShowLogin(!showLogin)} aria-label="Login"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-full transition-all duration-200 hover:opacity-90 active:scale-95"
                  style={{
                    color: 'var(--text-3)',
                    background: 'var(--glass-bg-subtle)',
                    border: '0.5px solid var(--glass-border)',
                    backdropFilter: 'blur(16px)',
                    WebkitBackdropFilter: 'blur(16px)',
                    boxShadow: 'var(--glass-shadow)',
                    cursor: 'pointer',
                  }}>
                  <LockSimple size={13} weight="duotone"/><span className="hidden sm:inline">Login</span>
                </button>
              )}
              {showLogin && !isLoggedIn && (
                <div style={{
                  position: 'absolute', top: '100%', right: 0, marginTop: 8, padding: 16,
                  borderRadius: 'var(--radius-lg)', zIndex: 100, minWidth: 240,
                  background: 'var(--glass-bg-strong)',
                  backdropFilter: 'blur(40px) saturate(1.8)',
                  WebkitBackdropFilter: 'blur(40px) saturate(1.8)',
                  border: '0.5px solid var(--glass-border-strong)',
                  boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.3)' : '0 8px 32px rgba(0,0,0,0.12)',
                }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>Club Member Login</div>
                  <input type="email" placeholder="Email" value={loginEmail}
                    onChange={e => setLoginEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleLogin()}
                    className="glass-input" style={{ width: '100%', marginBottom: 8, fontSize: 12 }} />
                  <input type="password" placeholder="Password" value={loginPassword}
                    onChange={e => setLoginPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleLogin()}
                    className="glass-input" style={{ width: '100%', marginBottom: 8, fontSize: 12 }} />
                  {loginError && <div style={{ fontSize: 11, color: 'var(--red)', marginBottom: 8 }}>{loginError}</div>}
                  <button onClick={handleLogin} disabled={loginLoading} className="btn-primary w-full text-xs py-2">
                    {loginLoading ? 'Signing In...' : 'Sign In'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Row 2: Market Data Sub-Header */}
        <div className="glass-subtle" style={{ borderBottom:'0.5px solid var(--glass-border)', borderRadius: 0 }}>
          <div className="max-w-[1400px] mx-auto px-3 md:px-6 h-[32px] flex items-center gap-3 overflow-x-auto scrollbar-none text-[11px]">
          {/* LIVE indicator */}
          <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
            <div className={isDynamic ? 'live-pulse-glow' : ''} style={{ width:6, height:6, borderRadius:'50%',
              background: isDynamic ? 'var(--green)' : 'var(--text-3)',
              transition: 'background 300ms ease',
              boxShadow: isDynamic ? '0 0 6px var(--green)' : 'none' }}/>
            <span style={{ fontSize:11, color: isDynamic ? 'var(--green)' : 'var(--text-3)', letterSpacing:'0.04em', fontWeight:600 }}>
              NSE: {isDynamic ? 'LIVE (15s)' : 'CLOSED'}
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
              <span style={{ width:6, height:6, borderRadius:'50%', background: regimeColor, display:'inline-block' }}/>
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
            <span style={{ flexShrink:0, color:'var(--text-3)', fontSize:11 }}>
              {pricesUpdated}
            </span>
          )}
        </div>
      </div>
      </div>

      {/* Content */}
      <main className="flex-1 max-w-[1400px] mx-auto w-full px-3 md:px-5 py-3 md:py-5 bottom-nav-pad md:pb-5">
        {loading ? (
          <TabSkeleton />
        ) : !data.length ? (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <WarningCircle size={32} weight="duotone" style={{ color: 'var(--red)', margin: '0 auto 12px' }}/>
            <p style={{ color: 'var(--text-2)', marginBottom: 8, fontSize: 14 }}>Could not load market data.</p>
            {loadError && <p style={{ color: 'var(--red)', fontSize: 12, marginBottom: 16 }}>{loadError}</p>}
            <button onClick={() => fetchData()} className="rounded-xl px-5 py-2 text-[13px] font-medium transition-all duration-200"
              style={{
                background: 'var(--glass-bg-strong)',
                color: 'var(--brand)',
                border: '1px solid var(--glass-border-strong)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                boxShadow: 'var(--glass-shadow)',
                cursor: 'pointer',
              }}>Retry</button>
          </div>
        ) : (
          <ErrorBoundary>
            <Suspense fallback={<TabSkeleton />}>
              <div className={activeTab === 'charting' ? 'block animate-fade-in' : 'hidden'}>
                <ChartingTab data={data} selectedTicker={selectedTicker} setSelectedTicker={setSelectedTicker} chartData={chartData} chartLoading={chartLoading} chartPeriod={chartPeriod} setChartPeriod={setChartPeriod} chartInterval={chartInterval} setChartInterval={setChartInterval} isDark={isDark} peerGroup={peerGroup} selectedAsset={selectedAsset} scoreHistory={scoreHistory} horizon={horizon} isLoggedIn={isLoggedIn}/>
              </div>
              <div className={activeTab === 'picks' ? 'block animate-fade-in' : 'hidden'}>
                <SignalsTab topPicks={topPicks} horizon={horizon} setHorizon={setHorizon} onSelect={handleSelect}/>
              </div>
              <div className={activeTab === 'fundamentals' ? 'block animate-fade-in' : 'hidden'}>
                <ScreenerTab data={data} onSelect={handleSelect} watchlist={watchlist} toggleWatchlist={toggleWatchlist} scoreHistory={scoreHistory} flashTickers={flashTickers} isLoggedIn={isLoggedIn}/>
              </div>
              <div className={activeTab === 'heatmap' ? 'block animate-fade-in' : 'hidden'}>
                <HeatmapTab sectorMap={sectorMap} onSelect={handleSelect} isDark={isDark}/>
              </div>
              <div className={activeTab === 'quantlab' ? 'block animate-fade-in' : 'hidden'}>
                <QuantLabTab isDark={isDark} scanUpdated={scanUpdated} onSelect={handleSelect}/>
              </div>
            </Suspense>
          </ErrorBoundary>
        )}
      </main>

      {/* Mobile Bottom Navigation Dock */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 glass-strong border-t border-[var(--glass-border)] px-2 py-1 pb-safe backdrop-blur-xl" style={{ borderRadius: 0 }}>
        <div className="flex items-center justify-around max-w-md mx-auto">
          {visibleTabs.map(tab => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className="flex flex-col items-center justify-center py-1 px-3 min-w-[56px] min-h-[44px] rounded-xl transition-all duration-200"
                style={{
                  color: isActive ? 'var(--brand)' : 'var(--text-3)',
                  background: isActive ? 'var(--brand-soft)' : 'transparent',
                }}
              >
                <tab.icon size={18} weight={isActive ? "fill" : "duotone"} />
                <span className="text-[10px] font-medium mt-0.5" style={{ color: isActive ? 'var(--brand)' : 'var(--text-3)' }}>
                  {tab.label}
                </span>
              </button>
            )
          })}
        </div>
      </nav>

      {/* Footer */}
      <footer className="mt-auto glass" style={{borderTop:'0.5px solid var(--glass-border)', borderRadius: 0 }}>
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
      <SocialShareModal isOpen={isShareOpen} onClose={() => setIsShareOpen(false)} asset={selectedAsset} />
      <NewsletterModal isOpen={isNewsletterOpen} onClose={() => setIsNewsletterOpen(false)} />
      <Analytics />
    </div>
  )
}

