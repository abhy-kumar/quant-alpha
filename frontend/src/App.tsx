import { topRanked } from './utils/ranking'
import React, { useEffect, useLayoutEffect, useState, useMemo, memo, lazy, Suspense } from 'react'
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
import { ModalShell } from './components/common/ModalShell'
import { X } from '@phosphor-icons/react'
import { ShareNetwork } from '@phosphor-icons/react'

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
        <div style={{ padding: 40, background: 'var(--surface-2)', color: 'var(--text)', borderRadius: 'var(--radius-lg)', margin: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Something went wrong</h2>
          <p style={{ fontSize: 14, color: 'var(--text-2)', marginBottom: 16 }}>
            {import.meta.env.DEV ? this.state.error.message : 'An unexpected error occurred in this view.'}
          </p>
          {import.meta.env.DEV && (
            <pre style={{ padding: 12, background: 'var(--surface-3)', borderRadius: 8, fontSize: 12, overflowX: 'auto', marginBottom: 16 }}>
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
          <div key={i} className="card loading-shimmer" style={{
            height: 340,
            borderRadius: 'var(--radius-lg)',
          }}/>
        ))}
      </div>
    </div>
  )
}

function TapeInner({ data, flashTickers }: { data: DashboardData[]; flashTickers?: Record<string, 'up' | 'down'> }) {
  const items = useMemo(() => {
    return data.map(d => ({
      ticker: d.Ticker,
      t: d.Ticker.replace('.NS', ''),
      p: Number(d.Price) || 0,
      c: Number(d['1d_Chg_%']) || 0,
    }))
  }, [data])
  if (!items.length) return null


  return (
    <div role="region" aria-label="Market prices" tabIndex={0} className="overflow-x-auto market-tape" style={{ borderBottom: '1px solid var(--glass-border)' }}>
      <div className="flex w-max whitespace-nowrap">
        {items.map(x => {
          const flash = flashTickers?.[x.ticker]
          return (
            <span
              key={x.ticker}
              className={`inline-flex items-center gap-3 px-4 py-1.5 text-[12px] shrink-0 transition-colors duration-500 rounded ${
                flash === 'up' ? 'bg-emerald-500/20' : flash === 'down' ? 'bg-rose-500/20' : ''
              }`}
            >
              <span className="font-semibold" style={{ color: 'var(--text)' }}>{x.t}</span>
              <span className="flex items-center gap-2">
                <span className="font-mono text-right w-[65px] shrink-0" style={{ color: 'var(--text-2)' }}>{x.p.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                <span className="font-mono text-right w-[60px] shrink-0 font-medium" style={{ color: x.c >= 0 ? 'var(--green)' : 'var(--red)' }}>{x.c >= 0 ? '▲' : '▼'} {Math.abs(x.c).toFixed(2)}%</span>
              </span>
            </span>
          )
        })}
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
  } = useMarketData(selectedTicker, setSelectedTicker, isLoggedIn)

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

  useEffect(() => { try { localStorage.setItem('qa_dark', String(isDark)) } catch { /* Storage may be disabled. */ } }, [isDark])
  useLayoutEffect(() => { document.documentElement.classList.toggle('dark', isDark) }, [isDark])

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

      if (e.key === '1') { e.preventDefault(); navigate(isLoggedIn ? '/signals' : '/') }
      else if (e.key === '2') { e.preventDefault(); navigate('/screen') }
      else if (e.key === '3') { e.preventDefault(); navigate('/') }
      else if (e.key === '4') { e.preventDefault(); navigate('/heatmap') }
      else if (e.key === '5') { e.preventDefault(); navigate(isLoggedIn ? '/quant' : '/') }
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

  const requestedTab = PATH_TABS[location.pathname] ?? 'charting'
  const activeTab = (!isLoggedIn && ['picks', 'quantlab'].includes(requestedTab) ? 'charting' : requestedTab) as 'picks'|'fundamentals'|'charting'|'heatmap'|'quantlab'
  const setActiveTab = (id: 'picks'|'fundamentals'|'charting'|'heatmap'|'quantlab') => navigate(TAB_PATHS[id] ?? '/')


  const topPicks = useMemo(() => {
    return topRanked(data, horizon)
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
      <a href="#main-content" className="skip-link">Skip to content</a>
      <SeoHead activeTab={activeTab} selectedTicker={selectedTicker} selectedAsset={selectedAsset} />
      <Tape data={data} flashTickers={flashTickers} />

      <div>
        {/* Header - Web Application Navigation Bar */}
        <header className="app-header glass">
          <div className="app-toolbar">
            <button type="button" onClick={() => setActiveTab('charting')} aria-label="Alpha home" className="shrink-0">
              <img src={isDark ? '/logo-dark.svg' : '/logo-light.svg'} alt="Alpha" className="h-11 w-auto" />
            </button>
            <nav className="app-navigation" aria-label="Main navigation">
              {visibleTabs.map(tab => (
                <button type="button" key={tab.id} onClick={() => setActiveTab(tab.id)} aria-current={activeTab === tab.id ? 'page' : undefined}>
                  <tab.icon size={18} weight="regular" aria-hidden="true" />{tab.label}
                </button>
              ))}
            </nav>
            <div className="toolbar-actions">
              <button type="button" onClick={() => setIsShareOpen(true)} aria-label="Share research" className="btn-glass">
                <ShareNetwork size={18} weight="regular" aria-hidden="true" /><span className="hidden sm:inline toolbar-action-label">Share</span>
              </button>
              <button type="button" onClick={() => setIsDark(!isDark)} aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'} className="btn-glass">
                {isDark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
                <span className="hidden sm:inline toolbar-action-label">{isDark ? 'Light' : 'Dark'}</span>
              </button>
              {isLoggedIn ? (
                <button type="button" onClick={() => handleLogout(() => { if (activeTab === 'picks' || activeTab === 'quantlab') setActiveTab('charting') })} aria-label="Sign out" className="btn-glass">
                  <SignOut size={18} aria-hidden="true" /><span className="hidden sm:inline toolbar-action-label">Sign out</span>
                </button>
              ) : (
                <button type="button" onClick={() => setShowLogin(true)} aria-label="Sign in" className="btn-glass">
                  <LockSimple size={18} aria-hidden="true" /><span className="hidden sm:inline toolbar-action-label">Sign in</span>
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Row 2: Market Data Sub-Header */}
        <div className="market-status">
          <div className="max-w-[1400px] mx-auto px-3 md:px-6 h-[32px] flex items-center gap-3 overflow-x-auto scrollbar-none text-[12px]">
          {/* LIVE indicator */}
          <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
            <div className={isDynamic ? 'live-pulse-glow' : ''} style={{ width:6, height:6, borderRadius:'50%',
              background: isDynamic ? 'var(--green)' : 'var(--text-3)',
              transition: 'background 300ms ease',
              boxShadow: isDynamic ? '0 0 6px var(--green)' : 'none' }}/>
            <span style={{ fontSize: 12, color: isDynamic ? 'var(--green)' : 'var(--text-3)', letterSpacing:'0.04em', fontWeight:600 }}>
              NSE: {isDynamic ? 'Live, updates every 30s' : 'Closed'}
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
            <span style={{ flexShrink:0, color:'var(--text-3)', fontSize: 12 }}>
              {pricesUpdated}
            </span>
          )}
        </div>
      </div>
      </div>

      {/* Content */}
      <main id="main-content" tabIndex={-1} className="flex-1 max-w-[1400px] mx-auto w-full px-4 md:px-6 py-5 md:py-6">
        <div className="mb-5">
          <h1 className="typo-h1">{TABS.find(tab => tab.id === activeTab)?.label}</h1>
          <p className="typo-caption mt-1">{{charting: 'Price history and company fundamentals', picks: 'Research signals for your investment horizon', fundamentals: 'Explore the NSE universe', heatmap: 'Research scores by sector', quantlab: 'Portfolio research and strategy analysis'}[activeTab]}</p>
        </div>
        {loading ? (
          <TabSkeleton />
        ) : !data.length ? (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <WarningCircle size={32} weight="regular" style={{ color: 'var(--red)', margin: '0 auto 12px' }}/>
            <p style={{ color: 'var(--text-2)', marginBottom: 8, fontSize: 14 }}>Could not load market data.</p>
            {loadError && <p style={{ color: 'var(--red)', fontSize: 12, marginBottom: 16 }}>{loadError}</p>}
            <button onClick={() => fetchData()} className="btn-glass">Retry</button>
          </div>
        ) : (
          <ErrorBoundary>
            <Suspense fallback={<TabSkeleton />}>
              <div className={activeTab === 'charting' ? 'block animate-fade-in' : 'hidden'}>
                <ChartingTab data={data} selectedTicker={selectedTicker} setSelectedTicker={setSelectedTicker} chartData={chartData} chartLoading={chartLoading} chartPeriod={chartPeriod} setChartPeriod={setChartPeriod} chartInterval={chartInterval} setChartInterval={setChartInterval} isDark={isDark} peerGroup={peerGroup} selectedAsset={selectedAsset} scoreHistory={scoreHistory} horizon={horizon} isLoggedIn={isLoggedIn} onRequestSignIn={() => setShowLogin(true)}/>
              </div>
              <div className={activeTab === 'picks' ? 'block animate-fade-in' : 'hidden'}>
                {isLoggedIn && <SignalsTab topPicks={topPicks} horizon={horizon} setHorizon={setHorizon} onSelect={handleSelect}/>}
              </div>
              <div className={activeTab === 'fundamentals' ? 'block animate-fade-in' : 'hidden'}>
                <ScreenerTab data={data} onSelect={handleSelect} watchlist={watchlist} toggleWatchlist={toggleWatchlist} scoreHistory={scoreHistory} flashTickers={flashTickers} isLoggedIn={isLoggedIn} onRequestSignIn={() => setShowLogin(true)}/>
              </div>
              <div className={activeTab === 'heatmap' ? 'block animate-fade-in' : 'hidden'}>
                <HeatmapTab sectorMap={sectorMap} onSelect={handleSelect} isDark={isDark}/>
              </div>
              <div className={activeTab === 'quantlab' ? 'block animate-fade-in' : 'hidden'}>
                {isLoggedIn && <QuantLabTab isDark={isDark} scanUpdated={scanUpdated} onSelect={handleSelect}/>}
              </div>
            </Suspense>
          </ErrorBoundary>
        )}
      </main>

      {/* Mobile Bottom Navigation Dock */}
      <nav className="mobile-navigation md:hidden glass" aria-label="Mobile navigation">
        <div className="flex items-center justify-around max-w-md mx-auto">
          {visibleTabs.map(tab => (
            <button type="button" key={tab.id} onClick={() => setActiveTab(tab.id)} aria-current={activeTab === tab.id ? 'page' : undefined}>
              <tab.icon size={22} weight="regular" aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Footer */}
      <footer className="mt-auto bottom-nav-pad md:pb-0" style={{ borderTop: '1px solid var(--glass-border)', background: 'var(--surface)' }}>
        <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-4 space-y-2 typo-caption">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
            <span>Built by Abhishek Kumar</span>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {scanUpdated && <span className="font-mono">Last scan: {scanUpdated}</span>}
              <a href="https://github.com/abhy-kumar/quant-alpha" target="_blank" rel="noopener noreferrer"
                style={{ color:'var(--text-3)', textDecoration:'none', display:'inline-flex', alignItems:'center', gap:3 }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
                Source
              </a>
            </div>
          </div>
          <p>Educational and academic research only. Not investment advice. Data from third-party sources may contain errors. Consult a SEBI-registered advisor before investing.</p>
        </div>
      </footer>
      {showLogin && !isLoggedIn && (
        <ModalShell title="Sign in" onClose={() => setShowLogin(false)} className="max-w-sm p-6">
          <button type="button" onClick={() => setShowLogin(false)} aria-label="Close dialog" className="icon-button absolute top-4 right-4"><X size={18} /></button>
          <h2 className="typo-h2 pr-10">Sign in</h2>
          <p className="typo-body mt-2 mb-5">Use the shared club account to access Signals and Quant Lab.</p>
          <form onSubmit={event => { event.preventDefault(); handleLogin() }} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="block typo-caption mb-1.5">Email</label>
              <input id="login-email" type="email" autoComplete="username" autoFocus value={loginEmail} onChange={event => setLoginEmail(event.target.value)} className="glass-input w-full" required />
            </div>
            <div>
              <label htmlFor="login-password" className="block typo-caption mb-1.5">Password</label>
              <input id="login-password" type="password" autoComplete="current-password" value={loginPassword} onChange={event => setLoginPassword(event.target.value)} className="glass-input w-full" required />
            </div>
            {loginError && <p role="alert" className="typo-body text-[var(--red)]">{loginError}</p>}
            <button type="submit" disabled={loginLoading} className="btn-primary w-full">{loginLoading ? 'Signing in…' : 'Sign in'}</button>
          </form>
        </ModalShell>
      )}
      <SocialShareModal isOpen={isShareOpen} onClose={() => setIsShareOpen(false)} asset={selectedAsset} />
      <Analytics />
    </div>
  )
}
