import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import axios from 'axios'
import { Activity, Database, TrendingUp, BarChart2, Layers, Moon, Sun, Zap, Star, X, Plus } from 'lucide-react'
import type { DashboardData } from './types'
import SignalsTab from './components/SignalsTab'
import ScreenerTab from './components/ScreenerTab'
import ChartingTab from './components/ChartingTab'
import HeatmapTab from './components/HeatmapTab'
import FactorLabTab from './components/FactorLabTab'

const STATIC_URL = '/market_data.json'

export default function App() {
  const [data, setData] = useState<DashboardData[]>([])
  const [scanUpdated, setScanUpdated] = useState<string>('')
  const [pricesUpdated, setPricesUpdated] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [niftyData, setNiftyData] = useState<{price: number, change_pct: number, is_up: boolean} | null>(null)
  const [coveragePct, setCoveragePct] = useState<number | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [marketRegimeScore, setMarketRegimeScore] = useState<number | null>(null)
  const [isDynamic, setIsDynamic] = useState<boolean>(false)
  const [activeTab, setActiveTab] = useState<'picks' | 'fundamentals' | 'charting' | 'heatmap' | 'factorlab'>('picks')
  const [fiiNet, setFiiNet] = useState<number | null>(null)
  const [diiNet, setDiiNet] = useState<number | null>(null)
  const [pcr, setPcr] = useState<number | null>(null)
  const [isDark, setIsDark] = useState(false)
  const [horizon, setHorizon] = useState<'short' | 'long'>('short')
  const [selectedTicker, setSelectedTicker] = useState<string>('')
  const [chartPeriod, setChartPeriod] = useState<string>('1y')
  const [chartInterval, setChartInterval] = useState<string>('1d')
  const [chartData, setChartData] = useState<any[]>([])
  const [chartLoading, setChartLoading] = useState(false)
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [outcomeAccuracy, setOutcomeAccuracy] = useState<Record<string, any>>({})
  const [firstScanDate, setFirstScanDate] = useState<string>('')
  const [watchlist, setWatchlist] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('qa_watchlist')
      if (saved) return JSON.parse(saved)
    } catch {}
    const params = new URLSearchParams(window.location.search)
    const wl = params.get('watchlist')
    if (wl) return wl.split(',').map(t => t.toUpperCase().trim())
    return []
  })
  const [watchlistOpen, setWatchlistOpen] = useState(false)
  const [watchlistInput, setWatchlistInput] = useState('')
  const watchlistRef = useRef<HTMLDivElement>(null)
  const [scoreHistory, setScoreHistory] = useState<Record<string, {date: string; composite: number}[]>>({})
  const [showIndicators, setShowIndicators] = useState(false)

  useEffect(() => { localStorage.setItem('qa_watchlist', JSON.stringify(watchlist)) }, [watchlist])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (watchlistRef.current && !watchlistRef.current.contains(e.target as Node)) setWatchlistOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const addToWatchlist = useCallback(() => {
    const ticker = watchlistInput.trim().toUpperCase().replace('.NS', '')
    if (ticker && !watchlist.includes(ticker)) setWatchlist(prev => [...prev, ticker])
    setWatchlistInput('')
  }, [watchlistInput, watchlist])

  const removeFromWatchlist = useCallback((ticker: string) => {
    setWatchlist(prev => prev.filter(t => t !== ticker))
  }, [])

  useEffect(() => {
    if (isDark) document.documentElement.classList.add('dark')
    else document.documentElement.classList.remove('dark')
  }, [isDark])

  useEffect(() => {
    fetch('/score_history.json?t=' + Date.now())
      .then(r => r.json())
      .then(d => setScoreHistory(d))
      .catch(() => {})
  }, [])

  const dataRef = React.useRef<DashboardData[]>([])
  useEffect(() => { dataRef.current = data }, [data])

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
            return { ...d, Price: livePrices[d.Ticker].price || d.Price, "1d_Chg_%": livePrices[d.Ticker].change_pct !== undefined ? livePrices[d.Ticker].change_pct : d["1d_Chg_%"] }
          }
          return d
        })
        setData(updatedData)
        if (res.data.nifty_50) setNiftyData(res.data.nifty_50)
        setPricesUpdated(new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) + ' IST')
        setIsDynamic(true)
        return res.data.is_market_closed ? 'market_closed' : 'ok'
      }
    } catch(err) { console.error("Failed to fetch live data", err); return 'error' }
  }

  const fetchData = async () => {
    try {
      const res = await axios.get(`${STATIC_URL}?t=${new Date().getTime()}`)
      if (res.data.status === 'ok' && res.data.data.length > 0) {
        const sortedData = res.data.data.sort((a: any, b: any) => a.Ticker.localeCompare(b.Ticker))
        setData(sortedData)
        setScanUpdated(res.data.last_updated || 'Unknown')
        if (res.data.nifty_50) setNiftyData(res.data.nifty_50)
        setCoveragePct(res.data.coverage_pct ?? null)
        setMarketRegimeScore(res.data.market_regime_score ?? null)
        setFiiNet(res.data.fii_net ?? null)
        setDiiNet(res.data.dii_net ?? null)
        setPcr(res.data.pcr ?? null)
        setOutcomeAccuracy(res.data.outcome_accuracy || {})
        setFirstScanDate(res.data.first_scan_date || '')
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
        setTimeout(async () => {
           const status = await fetchLiveData()
           if (status !== 'market_closed') {
              intervalId = setInterval(async () => {
                const currentStatus = await fetchLiveData()
                if (currentStatus === 'market_closed') clearInterval(intervalId)
              }, 3 * 60 * 1000)
           }
        }, 1000)
      }
    }
    init()
    return () => { if (intervalId) clearInterval(intervalId) }
  }, [])

  useEffect(() => {
    if (!selectedTicker) return
    const fetchChart = async () => {
      setChartLoading(true)
      try {
        const res = await axios.get(`/api/chart?ticker=${encodeURIComponent(selectedTicker)}&period=${chartPeriod}&interval=${chartInterval}`)
        setChartData(res.data.status === 'ok' ? res.data.data : [])
      } catch (err) { console.error("Chart fetch failed", err); setChartData([]) }
      finally { setChartLoading(false) }
    }
    fetchChart()
  }, [selectedTicker, chartPeriod, chartInterval])

  const topPicks = useMemo(() => {
    let filtered = [...data].filter(d => !d.Ticker.includes('BEES') && d.Sector !== 'ETF')
    if (horizon === 'short') {
      filtered = filtered.filter(d => { const fund = Number(d.Fund_Score); return isNaN(fund) || fund >= 5 })
        .sort((a, b) => Number(b.Composite_Score || 0) - Number(a.Composite_Score || 0))
    } else {
      filtered = filtered.filter(d => { const research = Number(d.Research_Score); return !isNaN(research) && research > 5 })
        .sort((a, b) => Number(b.Composite_Score_Fund || 0) - Number(a.Composite_Score_Fund || 0))
    }
    return filtered.slice(0, 3)
  }, [data, horizon])

  const sectorMap = useMemo(() => {
    const map: Record<string, DashboardData[]> = {}
    data.forEach(d => { const s = d.Sector || 'Unknown'; if (!map[s]) map[s] = []; map[s].push(d) })
    return map
  }, [data])

  const selectedAsset = useMemo(() => data.find(d => d.Ticker === selectedTicker) || null, [data, selectedTicker])

  const peerGroup = useMemo(() => {
    if (!selectedAsset || !selectedAsset.Sector || selectedAsset.Sector === 'Unknown') return []
    return [selectedAsset, ...data.filter(d => d.Sector === selectedAsset.Sector && d.Ticker !== selectedAsset.Ticker)
      .sort((a, b) => Number(b.Market_Cap_B || 0) - Number(a.Market_Cap_B || 0)).slice(0, 5)]
  }, [data, selectedAsset])

  const sparklineData = useMemo(() => {
    const map: Record<string, { time: string; close: number }[]> = {}
    topPicks.forEach(stock => {
      const price = Number(stock.Price) || 0
      const mom1m = Number(stock.Momentum_1M) || 0
      const prevPrice = price / (1 + mom1m)
      if (price > 0 && prevPrice > 0) {
        map[stock.Ticker] = [
          { time: '1M ago', close: prevPrice },
          { time: 'now', close: price },
        ]
      }
    })
    return map
  }, [topPicks])

  const handleSelect = (ticker: string) => {
    setSelectedTicker(ticker)
    setActiveTab('charting')
  }

  const regimeLabel = marketRegimeScore !== null ? (marketRegimeScore > 0 ? 'Bullish' : marketRegimeScore < 0 ? 'Bearish' : 'Neutral') : 'Unknown'

  const tabs = [
    { id: 'picks', label: 'Signals', icon: TrendingUp },
    { id: 'fundamentals', label: 'Screen', icon: Database },
    { id: 'charting', label: 'Charts', icon: BarChart2 },
    { id: 'heatmap', label: 'Heatmap', icon: Layers },
    { id: 'factorlab', label: 'Factor Lab', icon: Activity },
  ] as const

  const Pill = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full ${className}`}>
      {children}
    </span>
  )

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-app)' }}>
      {/* Header */}
      <header className="sticky top-0 z-40 border-b" style={{ borderColor: 'var(--border-color)', background: 'color-mix(in srgb, var(--bg-app) 85%, transparent)', backdropFilter: 'blur(20px) saturate(1.5)', WebkitBackdropFilter: 'blur(20px) saturate(1.5)' }}>
        {/* Top row: logo + indicators */}
        <div className="max-w-[1400px] mx-auto px-5 lg:px-8 h-14 flex items-center gap-5">
          <button onClick={() => setActiveTab('picks')} className="flex-shrink-0 hover:opacity-80 transition-opacity">
            {isDark
              ? <img src="/logo-dark.svg" alt="Alpha" className="h-10 w-auto" />
              : <img src="/logo-light.svg" alt="Alpha" className="h-10 w-auto" />
            }
          </button>

          <div className="flex-1" />

          {/* Live indicators */}
          <div className="hidden md:flex items-center gap-2">
            {niftyData && (
              <Pill className={niftyData.is_up ? 'bg-green-soft text-green' : 'bg-red-soft text-red'}>
                NIFTY {niftyData.price.toLocaleString()}{' '}
                <span className="font-data text-[11px]">{niftyData.change_pct > 0 ? '+' : ''}{niftyData.change_pct}%</span>
              </Pill>
            )}
            {marketRegimeScore !== null && (
              <Pill className={
                marketRegimeScore >= 1 ? 'bg-green-soft text-green'
                : marketRegimeScore <= -1 ? 'bg-red-soft text-red'
                : 'bg-amber-soft text-amber'
              }>
                <Zap size={12} />
                {regimeLabel}
              </Pill>
            )}
            {fiiNet !== null && (
              <Pill className={fiiNet > 0 ? 'bg-green-soft text-green' : 'bg-red-soft text-red'}>
                FII <span className="font-data text-[11px]">{fiiNet > 0 ? '+' : ''}{Math.round(fiiNet)} Cr</span>
              </Pill>
            )}
            {diiNet !== null && (
              <Pill className={diiNet > 0 ? 'bg-green-soft text-green' : 'bg-red-soft text-red'}>
                DII <span className="font-data text-[11px]">{diiNet > 0 ? '+' : ''}{Math.round(diiNet)} Cr</span>
              </Pill>
            )}
            {pcr !== null && (
              <Pill className={
                pcr > 1.2 ? 'bg-green-soft text-green' : pcr < 0.7 ? 'bg-red-soft text-red' : 'bg-amber-soft text-amber'
              }>
                PCR <span className="font-data text-[11px]">{pcr.toFixed(2)}</span>
              </Pill>
            )}
            {coveragePct !== null && (
              <Pill className="bg-surface text-sub">
                {coveragePct}% coverage
              </Pill>
            )}
          </div>

          <div className="hidden md:block" />

          {/* Mobile indicators toggle + actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowIndicators(!showIndicators)}
              className="md:hidden px-2 py-1.5 rounded-lg text-sub hover:text-heading transition-colors"
              title="Market Indicators"
            >
              <Layers size={16} />
            </button>

            {watchlist.length > 0 && (
              <div className="relative" ref={watchlistRef}>
                <button
                  onClick={() => setWatchlistOpen(!watchlistOpen)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors"
                  style={{ color: 'var(--brand)', background: 'var(--brand-soft)' }}
                >
                  <Star size={13} fill="currentColor" />
                  <span className="hidden sm:inline">{watchlist.length}</span>
                </button>
                {watchlistOpen && (
                  <div className="absolute z-50 right-0 top-full mt-2 w-56 rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-lg)' }}>
                    <div className="p-3" style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          value={watchlistInput}
                          onChange={e => setWatchlistInput(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && addToWatchlist()}
                          placeholder="Add ticker..."
                          className="flex-1 bg-transparent text-heading text-xs uppercase outline-none px-2 py-1.5 rounded-lg"
                          style={{ border: '1px solid var(--border-color)' }}
                        />
                        <button onClick={addToWatchlist} className="px-2 py-1.5 rounded-lg text-white" style={{ background: 'var(--brand)' }}>
                          <Plus size={12} />
                        </button>
                      </div>
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                      {watchlist.map(t => (
                        <div key={t} className="flex items-center justify-between px-3 py-2 hover:bg-brand-soft group transition-colors">
                          <button
                            onClick={() => { setSelectedTicker(t); setActiveTab('charting'); setWatchlistOpen(false) }}
                            className="text-xs font-medium uppercase transition-colors"
                            style={{ color: 'var(--text-main)' }}
                          >
                            {t}
                          </button>
                          <button onClick={() => removeFromWatchlist(t)} className="text-sub hover:text-red transition-colors opacity-0 group-hover:opacity-100">
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={() => setIsDark(!isDark)}
              className="p-2 rounded-lg transition-colors"
              style={{ color: 'var(--text-sub)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-main)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-sub)')}
              title="Toggle Theme"
            >
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </div>

        {/* Mobile: collapsible indicator row */}
        {showIndicators && (
          <div className="md:hidden px-5 pb-3 flex flex-wrap items-center gap-2" style={{ borderTop: '1px solid var(--border-color)' }}>
            {niftyData && (
              <Pill className={niftyData.is_up ? 'bg-green-soft text-green' : 'bg-red-soft text-red'}>
                NIFTY {niftyData.price.toLocaleString()} {niftyData.change_pct > 0 ? '+' : ''}{niftyData.change_pct}%
              </Pill>
            )}
            {coveragePct !== null && <Pill className="bg-surface text-sub">{coveragePct}%</Pill>}
            {marketRegimeScore !== null && (
              <Pill className={marketRegimeScore >= 1 ? 'bg-green-soft text-green' : marketRegimeScore <= -1 ? 'bg-red-soft text-red' : 'bg-amber-soft text-amber'}>
                <Zap size={11} /> {regimeLabel}
              </Pill>
            )}
            {fiiNet !== null && <Pill className={fiiNet > 0 ? 'bg-green-soft text-green' : 'bg-red-soft text-red'}>FII {fiiNet > 0 ? '+' : ''}{Math.round(fiiNet)} Cr</Pill>}
            {diiNet !== null && <Pill className={diiNet > 0 ? 'bg-green-soft text-green' : 'bg-red-soft text-red'}>DII {diiNet > 0 ? '+' : ''}{Math.round(diiNet)} Cr</Pill>}
            {pcr !== null && <Pill className={pcr > 1.2 ? 'bg-green-soft text-green' : pcr < 0.7 ? 'bg-red-soft text-red' : 'bg-amber-soft text-amber'}>PCR {pcr.toFixed(2)}</Pill>}
          </div>
        )}

        {/* Tab bar */}
        <div className="max-w-[1400px] mx-auto px-5 lg:px-8">
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className="relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap"
                style={{
                  color: activeTab === tab.id ? 'var(--text-main)' : 'var(--text-sub)',
                }}
              >
                <tab.icon size={15} strokeWidth={activeTab === tab.id ? 2.2 : 1.8} />
                {tab.label}
                {activeTab === tab.id && (
                  <span className="absolute bottom-0 left-3 right-3 h-[2px] rounded-full" style={{ background: 'var(--brand)' }} />
                )}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow max-w-[1400px] mx-auto w-full px-5 lg:px-8 py-8 lg:py-10">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 gap-6 max-w-md mx-auto">
            <div className="w-full rounded-full h-1 overflow-hidden" style={{ background: 'var(--border-color)' }}>
              <div className="h-1 w-full rounded-full animate-progress origin-left" style={{ background: 'var(--brand)' }}></div>
            </div>
            <span className="text-sm animate-pulse" style={{ color: 'var(--text-sub)' }}>Loading market data...</span>
          </div>
        ) : data.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-96 gap-4 max-w-md mx-auto text-center">
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Could not load market data.
            </span>
            <span className="text-xs" style={{ color: 'var(--text-sub)' }}>
              Ensure market_data.json exists in the public directory.
            </span>
            {loadError && <div className="text-xs mt-2 max-w-sm overflow-hidden break-words" style={{ color: 'var(--red)' }}>{loadError}</div>}
          </div>
        ) : (
          <div className="animate-fade-up">
            {/* Section heading */}
            <div className="mb-8">
              <h1 className="text-xl font-semibold" style={{ color: 'var(--text-main)' }}>
                {activeTab === 'picks' && 'High Conviction Signals'}
                {activeTab === 'fundamentals' && 'Universe Screener'}
                {activeTab === 'charting' && 'Technical Analysis'}
                {activeTab === 'heatmap' && 'Sector Heatmap'}
                {activeTab === 'factorlab' && 'Factor Lab'}
              </h1>
              {activeTab === 'picks' && (
                <p className="text-sm mt-1" style={{ color: 'var(--text-sub)' }}>
                  Top picks ranked by composite score across technical, fundamental, and research dimensions.
                </p>
              )}
              {activeTab === 'fundamentals' && (
                <p className="text-sm mt-1" style={{ color: 'var(--text-sub)' }}>
                  {data.length} securities across NSE. Sort, filter, and expand for signal breakdowns.
                </p>
              )}
              {activeTab === 'factorlab' && (
                <p className="text-sm mt-1" style={{ color: 'var(--text-sub)' }}>
                  Tracking conviction accuracy across 21-day and 63-day forward windows.
                </p>
              )}
            </div>

            {activeTab === 'picks' && (
              <SignalsTab topPicks={topPicks} horizon={horizon} setHorizon={setHorizon} onSelect={handleSelect} isDark={isDark} sparklineData={sparklineData} />
            )}
            {activeTab === 'fundamentals' && (
              <ScreenerTab data={data} onSelect={handleSelect} expandedRow={expandedRow} setExpandedRow={setExpandedRow} watchlist={watchlist} toggleWatchlist={(ticker: string) => { setWatchlist(prev => prev.includes(ticker) ? prev.filter(t => t !== ticker) : [...prev, ticker]) }} scoreHistory={scoreHistory} />
            )}
            {activeTab === 'charting' && (
              <ChartingTab data={data} selectedTicker={selectedTicker} setSelectedTicker={setSelectedTicker} chartData={chartData} chartLoading={chartLoading} chartPeriod={chartPeriod} setChartPeriod={setChartPeriod} chartInterval={chartInterval} setChartInterval={setChartInterval} isDark={isDark} peerGroup={peerGroup} selectedAsset={selectedAsset} />
            )}
            {activeTab === 'heatmap' && (
              <HeatmapTab sectorMap={sectorMap} onSelect={handleSelect} isDark={isDark} />
            )}
            {activeTab === 'factorlab' && (
              <FactorLabTab outcomeAccuracy={outcomeAccuracy} firstScanDate={firstScanDate} isDark={isDark} />
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid var(--border-color)' }}>
        <div className="max-w-[1400px] mx-auto px-5 lg:px-8 py-8 grid grid-cols-1 sm:grid-cols-3 gap-8">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-main)' }}>System Status</h4>
            <div className="space-y-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              <div className="flex items-center gap-2">
                <Database size={13} style={{ color: 'var(--text-sub)' }} />
                <span>Signals updated</span>
                <span className="font-data text-[11px]" style={{ color: 'var(--text-main)' }}>{scanUpdated || '\u2014'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Activity size={13} style={{ color: 'var(--text-sub)' }} />
                <span>Prices updated</span>
                <span className="font-data text-[11px]" style={{ color: 'var(--text-main)' }}>{pricesUpdated || scanUpdated || '\u2014'}</span>
                {isDynamic && (
                  <span className="inline-flex items-center gap-1 font-medium" style={{ color: 'var(--green)' }}>
                    <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--green)' }} />
                    Live
                  </span>
                )}
              </div>
            </div>
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-main)' }}>Disclaimer</h4>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-sub)' }}>
              Educational and academic research purposes only. Not investment advice. Not registered with SEBI. Models are experimental; past performance is not indicative of future results. Consult a SEBI-registered advisor before investing.
            </p>
          </div>
          <div className="sm:text-right">
            <h4 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-main)' }}>Alpha Research</h4>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Alpha Research and Investment Club</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Faculty of Management Studies, Delhi</p>
            <p className="text-xs mt-2" style={{ color: 'var(--text-sub)' }}>Made with &#9829; by Abhishek Kumar</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
