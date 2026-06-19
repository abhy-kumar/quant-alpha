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

  useEffect(() => {
    localStorage.setItem('qa_watchlist', JSON.stringify(watchlist))
  }, [watchlist])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (watchlistRef.current && !watchlistRef.current.contains(e.target as Node)) setWatchlistOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const addToWatchlist = useCallback(() => {
    const ticker = watchlistInput.trim().toUpperCase().replace('.NS', '')
    if (ticker && !watchlist.includes(ticker)) {
      setWatchlist(prev => [...prev, ticker])
    }
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

  return (
    <div className="min-h-screen flex flex-col bg-app transition-colors duration-300">
      {/* Header */}
      <header className="sticky top-0 z-40 glass border-b border-border">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 sm:py-4 flex items-center gap-3 sm:gap-4">
          {/* Logo */}
          <button onClick={() => setActiveTab('picks')} className="flex-shrink-0 hover:opacity-80 transition-opacity">
            {isDark
              ? <img src="/logo-dark.svg" alt="Alpha" className="h-7 sm:h-8 w-auto" />
              : <img src="/logo-light.svg" alt="Alpha" className="h-7 sm:h-8 w-auto" />
            }
          </button>

          <div className="h-5 w-px bg-border hidden sm:block"></div>
          <span className="font-mono text-[9px] text-sub tracking-widest uppercase hidden lg:block whitespace-nowrap">Alpha Research & Investment Club | FMS Delhi</span>

          <div className="flex-1"></div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            {niftyData && (
              <span className={`px-2.5 py-1 font-mono text-[10px] border border-border rounded-md ${niftyData.is_up ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                NIFTY {niftyData.price.toLocaleString()} <span className={`${niftyData.change_pct >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{niftyData.change_pct > 0 ? '+' : ''}{niftyData.change_pct}%</span>
              </span>
            )}
            <button
              onClick={() => setShowIndicators(!showIndicators)}
              className="sm:hidden p-1.5 border border-border rounded-md text-muted hover:text-primary transition-colors"
              title="Market Indicators"
            >
              <Layers size={12} />
            </button>
            {coveragePct !== null && (
              <span className="px-2.5 py-1 font-mono text-[10px] border border-border rounded-md text-muted hidden sm:block">
                {coveragePct}% Coverage
              </span>
            )}
            {marketRegimeScore !== null && (
              <span className={`px-2.5 py-1 font-mono text-[10px] border rounded-md hidden sm:flex items-center gap-1.5 ${
                marketRegimeScore >= 1 ? 'border-green-500/30 text-green-600 dark:text-green-400'
                : marketRegimeScore <= -1 ? 'border-red-500/30 text-red-600 dark:text-red-400'
                : 'border-amber-400/30 text-amber-600 dark:text-amber-400'
              }`}>
                <Zap size={9} />
                {regimeLabel}
              </span>
            )}
            {fiiNet !== null && (
              <span className={`px-2.5 py-1 font-mono text-[10px] border rounded-md hidden md:flex items-center gap-1.5 ${
                fiiNet > 0 ? 'border-green-500/30 text-green-600 dark:text-green-400' : 'border-red-500/30 text-red-600 dark:text-red-400'
              }`}>
                FII {fiiNet > 0 ? '+' : ''}{Math.round(fiiNet)} Cr
              </span>
            )}
            {diiNet !== null && (
              <span className={`px-2.5 py-1 font-mono text-[10px] border rounded-md hidden md:flex items-center gap-1.5 ${
                diiNet > 0 ? 'border-green-500/30 text-green-600 dark:text-green-400' : 'border-red-500/30 text-red-600 dark:text-red-400'
              }`}>
                DII {diiNet > 0 ? '+' : ''}{Math.round(diiNet)} Cr
              </span>
            )}
            {pcr !== null && (
              <span className={`px-2.5 py-1 font-mono text-[10px] border rounded-md hidden lg:flex items-center gap-1.5 ${
                pcr > 1.2 ? 'border-green-500/30 text-green-600 dark:text-green-400' : pcr < 0.7 ? 'border-red-500/30 text-red-600 dark:text-red-400' : 'border-amber-400/30 text-amber-600 dark:text-amber-400'
              }`}>
                PCR {pcr.toFixed(2)}
              </span>
            )}
            {watchlist.length > 0 && (
              <div className="relative" ref={watchlistRef}>
                <button
                  onClick={() => setWatchlistOpen(!watchlistOpen)}
                  className="px-2.5 py-1 font-mono text-[10px] border border-brand/30 text-brand hover:bg-brand-soft rounded-md transition-colors flex items-center gap-1.5"
                >
                  <Star size={10} fill="currentColor" /> <span className="hidden sm:inline">{watchlist.length} Watchlist</span><span className="sm:hidden">{watchlist.length}</span>
                </button>
                {watchlistOpen && (
                  <div className="absolute z-50 right-0 top-full mt-2 w-56 border border-border bg-card rounded-card shadow-card-hover overflow-hidden">
                    <div className="p-3 border-b border-border">
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          value={watchlistInput}
                          onChange={e => setWatchlistInput(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && addToWatchlist()}
                          placeholder="Add ticker..."
                          className="flex-1 bg-surface text-primary font-mono text-[10px] uppercase outline-none px-2.5 py-1.5 border border-border rounded-md focus:border-brand transition-colors"
                        />
                        <button onClick={addToWatchlist} className="px-2.5 py-1.5 bg-brand text-background font-mono text-[10px] rounded-md hover:bg-brand-hover transition-colors">
                          <Plus size={10} />
                        </button>
                      </div>
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                      {watchlist.map(t => (
                        <div key={t} className="flex items-center justify-between px-3 py-2 hover:bg-brand-soft group transition-colors">
                          <button
                            onClick={() => { setSelectedTicker(t); setActiveTab('charting'); setWatchlistOpen(false) }}
                            className="font-mono text-[10px] text-primary uppercase hover:text-brand transition-colors"
                          >
                            {t}
                          </button>
                          <button
                            onClick={() => removeFromWatchlist(t)}
                            className="text-sub hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <X size={10} />
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
              className="p-1.5 border border-border rounded-md text-muted hover:text-primary hover:border-brand/30 transition-all"
              title="Toggle Theme"
            >
              {isDark ? <Sun size={14} /> : <Moon size={14} />}
            </button>
          </div>
        </div>

        {/* Mobile: collapsible indicator chips */}
        {showIndicators && (
          <div className="sm:hidden max-w-7xl mx-auto px-3 sm:px-6 flex flex-wrap items-center gap-2 pb-3 border-t border-border pt-3">
            {coveragePct !== null && (
              <span className="px-2.5 py-1 font-mono text-[10px] border border-border rounded-md text-muted">
                {coveragePct}% Coverage
              </span>
            )}
            {marketRegimeScore !== null && (
              <span className={`px-2.5 py-1 font-mono text-[10px] border rounded-md flex items-center gap-1.5 ${
                marketRegimeScore >= 1 ? 'border-green-500/30 text-green-600 dark:text-green-400'
                : marketRegimeScore <= -1 ? 'border-red-500/30 text-red-600 dark:text-red-400'
                : 'border-amber-400/30 text-amber-600 dark:text-amber-400'
              }`}>
                <Zap size={9} />
                {regimeLabel}
              </span>
            )}
            {fiiNet !== null && (
              <span className={`px-2.5 py-1 font-mono text-[10px] border rounded-md flex items-center gap-1.5 ${
                fiiNet > 0 ? 'border-green-500/30 text-green-600 dark:text-green-400' : 'border-red-500/30 text-red-600 dark:text-red-400'
              }`}>
                FII {fiiNet > 0 ? '+' : ''}{Math.round(fiiNet)} Cr
              </span>
            )}
            {diiNet !== null && (
              <span className={`px-2.5 py-1 font-mono text-[10px] border rounded-md flex items-center gap-1.5 ${
                diiNet > 0 ? 'border-green-500/30 text-green-600 dark:text-green-400' : 'border-red-500/30 text-red-600 dark:text-red-400'
              }`}>
                DII {diiNet > 0 ? '+' : ''}{Math.round(diiNet)} Cr
              </span>
            )}
            {pcr !== null && (
              <span className={`px-2.5 py-1 font-mono text-[10px] border rounded-md flex items-center gap-1.5 ${
                pcr > 1.2 ? 'border-green-500/30 text-green-600 dark:text-green-400' : pcr < 0.7 ? 'border-red-500/30 text-red-600 dark:text-red-400' : 'border-amber-400/30 text-amber-600 dark:text-amber-400'
              }`}>
                PCR {pcr.toFixed(2)}
              </span>
            )}
          </div>
        )}

        {/* Tab Navigation */}
        <div className="max-w-7xl mx-auto px-3 sm:px-6 pb-3 flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-1.5 px-3 py-2 sm:py-1.5 font-mono text-[10px] uppercase tracking-widest transition-all border whitespace-nowrap rounded-md ${
                activeTab === tab.id
                  ? 'border-brand bg-brand text-background font-semibold shadow-sm'
                  : 'border-transparent text-muted hover:text-primary hover:bg-brand-soft'
              }`}
            >
              <tab.icon size={12} /> {tab.label}
            </button>
          ))}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow px-3 sm:px-6 py-6 sm:py-8 max-w-7xl mx-auto w-full">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 gap-6 max-w-md mx-auto">
            <div className="w-full bg-border rounded-full h-1 overflow-hidden">
              <div className="bg-brand h-1 w-full rounded-full animate-progress origin-left"></div>
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
              {loadError && <div className="text-red-500 text-xs mt-4 normal-case max-w-sm overflow-hidden break-words">Error: {loadError}</div>}
            </div>
          </div>
        ) : (
          <div className="animate-fade-in">
            {/* Section Header */}
            <div className="flex items-center gap-3 mb-5 sm:mb-7">
              <div className="h-7 w-[3px] bg-brand rounded-full"></div>
              <h2 className="font-display font-bold text-lg sm:text-xl tracking-wide text-primary">
                {activeTab === 'picks' && 'High Conviction Signals'}
                {activeTab === 'fundamentals' && 'Universe Screening'}
                {activeTab === 'charting' && 'Technical Analysis'}
                {activeTab === 'heatmap' && 'Sector Heatmap'}
                {activeTab === 'factorlab' && 'Factor Lab'}
              </h2>
              {activeTab === 'picks' && (
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-brand"></span>
                </span>
              )}
              {activeTab === 'fundamentals' && (
                <span className="font-mono text-[10px] text-sub">{data.length} securities</span>
              )}
              {activeTab === 'factorlab' && (
                <span className="font-mono text-[10px] text-sub">Conviction Accuracy Tracker</span>
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
      <footer className="border-t border-border mt-12">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-8 grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8 items-start">
          <div className="flex flex-col gap-2.5">
            <h4 className="font-mono text-brand text-[9px] uppercase tracking-[0.2em] font-bold mb-1">System Status</h4>
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-muted">
              <Database size={10} className="text-sub" /><span>Signals</span>
              <span className="text-primary">{scanUpdated || '\u2014'}</span>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-muted">
              <Activity size={10} className="text-sub" /><span>Prices</span>
              <span className="text-primary">{pricesUpdated || scanUpdated || '\u2014'}</span>
              {isDynamic && (
                <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                  Live
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2.5">
            <h4 className="font-mono text-brand text-[9px] uppercase tracking-[0.2em] font-bold mb-1">Disclaimer</h4>
            <p className="font-mono text-[9px] text-muted leading-relaxed">
              Educational and academic research purposes only. Not investment advice. Not registered with SEBI. Models are experimental; past performance is not indicative of future results. Consult a SEBI-registered advisor before investing.
            </p>
          </div>
          <div className="flex flex-col gap-2.5 sm:items-end">
            <h4 className="font-mono text-brand text-[9px] uppercase tracking-[0.2em] font-bold mb-1">Alpha Research</h4>
            <p className="font-mono text-[10px] text-muted">Alpha Research and Investment Club</p>
            <p className="font-mono text-[10px] text-muted">Faculty of Management Studies, Delhi</p>
            <p className="font-mono text-[9px] text-sub tracking-widest uppercase mt-1">Made with &#9829; by Abhishek Kumar</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
