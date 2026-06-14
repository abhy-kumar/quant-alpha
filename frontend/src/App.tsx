import React, { useEffect, useState, useMemo } from 'react'
import axios from 'axios'
import { Activity, Database, TrendingUp, BarChart2, Layers, Moon, Sun, Zap } from 'lucide-react'
import type { DashboardData } from './types'
import SignalsTab from './components/SignalsTab'
import ScreenerTab from './components/ScreenerTab'
import ChartingTab from './components/ChartingTab'
import HeatmapTab from './components/HeatmapTab'
import FactorLabTab from './components/FactorLabTab'

const STATIC_URL = '/market_data.json'

export default function App() {
  const [data, setData] = useState<DashboardData[]>([])
  const [lastUpdated, setLastUpdated] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [niftyData, setNiftyData] = useState<{price: number, change_pct: number, is_up: boolean} | null>(null)
  const [coveragePct, setCoveragePct] = useState<number | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [marketRegimeScore, setMarketRegimeScore] = useState<number | null>(null)
  const [regimeMeta, setRegimeMeta] = useState<{ nifty_change_pct?: number; vix_level?: number; breadth_pct?: number }>({})
  const [isDynamic, setIsDynamic] = useState<boolean>(false)
  const [activeTab, setActiveTab] = useState<'picks' | 'fundamentals' | 'charting' | 'heatmap' | 'factorlab'>('picks')
  const [isDark, setIsDark] = useState(false)
  const [horizon, setHorizon] = useState<'short' | 'long'>('short')
  const [selectedTicker, setSelectedTicker] = useState<string>('')
  const [chartPeriod, setChartPeriod] = useState<string>('1y')
  const [chartInterval, setChartInterval] = useState<string>('1d')
  const [chartData, setChartData] = useState<any[]>([])
  const [chartLoading, setChartLoading] = useState(false)
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [outcomeAccuracy, setOutcomeAccuracy] = useState<Record<string, any>>({})
  const [watchlist, setWatchlist] = useState<string[]>([])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const wl = params.get('watchlist')
    if (wl) setWatchlist(wl.split(',').map(t => t.toUpperCase().trim()))
  }, [])

  useEffect(() => {
    if (isDark) document.documentElement.classList.add('dark')
    else document.documentElement.classList.remove('dark')
  }, [isDark])

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
        setLastUpdated(new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) + ' IST')
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
        setLastUpdated(res.data.last_updated || 'Unknown')
        if (res.data.nifty_50) setNiftyData(res.data.nifty_50)
        setCoveragePct(res.data.coverage_pct ?? null)
        setMarketRegimeScore(res.data.market_regime_score ?? null)
        setRegimeMeta({
          nifty_change_pct: res.data.nifty_change_pct,
          vix_level: res.data.vix_level,
          breadth_pct: res.data.breadth_pct,
        })
        setOutcomeAccuracy(res.data.outcome_accuracy || {})
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

  // Momentum sparkline: encode recent price performance as a simple 2-point line
  // (actual historical sparklines require per-ticker chart API calls; using momentum approximation)
  const sparklineData = useMemo(() => {
    const map: Record<string, { time: string; close: number }[]> = {}
    topPicks.forEach(stock => {
      const price = Number(stock.Price) || 0
      const mom1m = Number(stock.Momentum_1M) || 0
      // Back-calculate approximate 1M-ago price from current momentum
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
  const regimeGradient = marketRegimeScore !== null
    ? marketRegimeScore > 0 ? 'from-green-500/20 via-green-500/5 to-transparent dark:from-green-500/10'
    : marketRegimeScore < 0 ? 'from-red-500/20 via-red-500/5 to-transparent dark:from-red-500/10'
    : 'from-amber-500/20 via-amber-500/5 to-transparent dark:from-amber-500/10'
  : ''

  const regimeTextColor = marketRegimeScore !== null
    ? marketRegimeScore > 0 ? 'text-green-600 dark:text-green-400'
    : marketRegimeScore < 0 ? 'text-red-600 dark:text-red-400'
    : 'text-amber-600 dark:text-amber-400'
  : 'text-muted'

  return (
    <div className="min-h-screen flex flex-col transition-colors duration-300">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4">
          <h1 className="font-display font-semibold text-xl uppercase tracking-wider text-primary whitespace-nowrap">
            Quantitative <span className="text-brand">Alpha</span>
          </h1>
          <div className="h-4 w-px bg-border hidden sm:block"></div>
          <span className="font-mono text-[10px] text-sub tracking-widest uppercase hidden lg:block whitespace-nowrap">Alpha Research & Investment Club | FMS Delhi</span>
          <div className="flex-1"></div>
          <div className="flex items-center gap-2 flex-wrap">
            {niftyData && (
              <span className={`px-2 py-1 font-mono text-[10px] border border-border ${niftyData.is_up ? 'text-green-600 dark:text-green-500' : 'text-red-600 dark:text-red-500'}`}>
                NIFTY: {niftyData.price} ({niftyData.change_pct > 0 ? '+' : ''}{niftyData.change_pct}%)
              </span>
            )}
            {coveragePct !== null && (
              <span className="px-2 py-1 font-mono text-[10px] border border-border text-muted hidden sm:block">
                Coverage: {coveragePct}%
              </span>
            )}

            {watchlist.length > 0 && (
              <span className="px-2 py-1 font-mono text-[10px] border border-brand/30 text-brand hidden sm:block">
                {watchlist.length} Watchlist
              </span>
            )}
            <button 
              onClick={() => setIsDark(!isDark)}
              className="p-1.5 border border-border text-muted hover:text-primary hover:border-primary transition-colors"
              title="Toggle Theme"
            >
              {isDark ? <Sun size={14} /> : <Moon size={14} />}
            </button>
          </div>
        </div>

        {/* Market Regime Banner */}
        {marketRegimeScore !== null && (
          <div className={`max-w-7xl mx-auto px-6 pb-3`}>
            <div className={`bg-gradient-to-r ${regimeGradient} border border-border px-4 py-2.5 flex items-center gap-6 flex-wrap`}>
              <div className="flex items-center gap-2">
                <Zap size={14} className={regimeTextColor} />
                <span className={`font-mono text-xs font-semibold uppercase tracking-wider ${regimeTextColor}`}>
                  Market Regime: {regimeLabel} ({marketRegimeScore > 0 ? `+${marketRegimeScore}` : marketRegimeScore})
                </span>
              </div>
              <div className="h-3 w-px bg-border"></div>
              {regimeMeta.nifty_change_pct !== undefined && regimeMeta.nifty_change_pct !== null && (
                <span className={`font-mono text-[10px] ${regimeMeta.nifty_change_pct >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  NIFTY: {regimeMeta.nifty_change_pct >= 0 ? '+' : ''}{regimeMeta.nifty_change_pct}%
                </span>
              )}
              {regimeMeta.vix_level !== undefined && regimeMeta.vix_level !== null && (
                <span className="font-mono text-[10px] text-muted">
                  VIX: {regimeMeta.vix_level.toFixed(1)}
                </span>
              )}
              {regimeMeta.breadth_pct !== undefined && regimeMeta.breadth_pct !== null && (
                <span className="font-mono text-[10px] text-muted">
                  Breadth: {(regimeMeta.breadth_pct * 100).toFixed(0)}%
                </span>
              )}
            </div>
          </div>
        )}

        <div className="max-w-7xl mx-auto px-6 pb-3 flex items-center gap-1">
          {[
            { id: 'picks', label: 'Signals', icon: TrendingUp },
            { id: 'fundamentals', label: 'Screen', icon: Database },
            { id: 'charting', label: 'Charts', icon: BarChart2 },
            { id: 'heatmap', label: 'Heatmap', icon: Layers },
            { id: 'factorlab', label: 'Factor Lab', icon: Activity },
          ].map(tab => (
            <button 
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-1.5 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest transition-all border ${activeTab === tab.id ? 'border-primary bg-primary text-background' : 'border-border text-muted hover:text-primary hover:border-primary'}`}
            >
              <tab.icon size={12} /> {tab.label}
            </button>
          ))}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow px-6 py-8 max-w-7xl mx-auto w-full">
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
              {loadError && <div className="text-red-500 text-xs mt-4 normal-case max-w-sm overflow-hidden break-words">Error: {loadError}</div>}
            </div>
          </div>
        ) : (
          <div className="animate-in fade-in duration-500">
            {activeTab === 'picks' && (
              <SignalsTab
                topPicks={topPicks}
                horizon={horizon}
                setHorizon={setHorizon}
                onSelect={handleSelect}
                isDark={isDark}
                sparklineData={sparklineData}
              />
            )}
            {activeTab === 'fundamentals' && (
              <ScreenerTab
                data={data}
                onSelect={handleSelect}
                expandedRow={expandedRow}
                setExpandedRow={setExpandedRow}
              />
            )}
            {activeTab === 'charting' && (
              <ChartingTab
                data={data}
                selectedTicker={selectedTicker}
                setSelectedTicker={setSelectedTicker}
                chartData={chartData}
                chartLoading={chartLoading}
                chartPeriod={chartPeriod}
                setChartPeriod={setChartPeriod}
                chartInterval={chartInterval}
                setChartInterval={setChartInterval}
                isDark={isDark}
                peerGroup={peerGroup}
                selectedAsset={selectedAsset}
              />
            )}
            {activeTab === 'heatmap' && (
              <HeatmapTab
                sectorMap={sectorMap}
                onSelect={handleSelect}
                isDark={isDark}
              />
            )}
            {activeTab === 'factorlab' && (
              <FactorLabTab
                outcomeAccuracy={outcomeAccuracy}
                isDark={isDark}
              />
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-12 bg-card">
        <div className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
          <div className="flex flex-col gap-2">
            <h4 className="font-mono text-brand text-[10px] uppercase tracking-widest font-bold">System Status</h4>
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-muted">
              <Database size={10} /> <span>Database</span>
              <span className="text-primary">Static JSON</span>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-muted">
              <Activity size={10} /> <span>Last Updated</span>
              <span className="text-primary">{lastUpdated}</span>
              {isDynamic && <span className="text-brand">Live</span>}
            </div>
          </div>
          <div>
            <h4 className="font-display font-semibold text-sm mb-2 uppercase text-primary">Disclaimer</h4>
            <p className="font-mono text-[10px] text-sub leading-relaxed">
              This platform is for educational purposes only and does not constitute financial advice. 
              The models and signals provided are experimental. Always consult a certified financial advisor before making investment decisions. 
              Alpha Research and Investment Club, FMS Delhi is not responsible for any trading losses incurred.
            </p>
          </div>
          <div className="md:text-right">
            <p className="font-mono text-[10px] text-muted">Alpha Research and Investment Club<br/>FMS Delhi</p>
            <p className="font-mono text-[10px] text-sub mt-2 tracking-widest uppercase">Made with &#9829; by Abhishek Kumar</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
