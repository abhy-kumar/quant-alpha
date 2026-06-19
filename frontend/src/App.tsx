import React, { useEffect, useState, useMemo } from 'react'
import axios from 'axios'
import { Activity, Database, TrendingUp, BarChart2, Layers, Moon, Sun, Zap, ChevronUp, ChevronDown } from 'lucide-react'
import type { DashboardData } from './types'
import SignalsTab from './components/SignalsTab'
import ScreenerTab from './components/ScreenerTab'
import ChartingTab from './components/ChartingTab'
import HeatmapTab from './components/HeatmapTab'
import FactorLabTab from './components/FactorLabTab'

const STATIC_URL = '/market_data.json'

function TickerTape({ data }: { data: DashboardData[] }) {
  const tickers = useMemo(() => {
    const items = data.slice(0, 30).map(d => ({
      ticker: d.Ticker.replace('.NS', ''),
      price: Number(d.Price) || 0,
      change: Number(d['1d_Chg_%']) || 0,
    }))
    return items
  }, [data])

  if (tickers.length === 0) return null

  return (
    <div className="overflow-hidden whitespace-nowrap" style={{ background: '#060D1B' }}>
      <div className="ticker-scroll inline-flex">
        {[...tickers, ...tickers].map((t, i) => (
          <span key={i} className="inline-flex items-center gap-2 px-4 py-1.5 text-[11px]" style={{ color: '#94A3B8' }}>
            <span className="font-medium" style={{ color: '#E2E8F0' }}>{t.ticker}</span>
            <span className="font-data" style={{ color: '#CBD5E1' }}>{t.price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            <span className="font-data" style={{ color: t.change >= 0 ? '#34D399' : '#F87171' }}>
              {t.change >= 0 ? '▲' : '▼'} {Math.abs(t.change).toFixed(2)}%
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}

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
  const [scoreHistory, setScoreHistory] = useState<Record<string, {date: string; composite: number}[]>>({})
  const [showIndicators, setShowIndicators] = useState(false)

  useEffect(() => { localStorage.setItem('qa_watchlist', JSON.stringify(watchlist)) }, [watchlist])

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
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-app)' }}>
      {/* Scrolling Ticker Tape */}
      <TickerTape data={data} />

      {/* Dark Header */}
      <header className="sticky top-0 z-40" style={{ background: '#0B1120', borderBottom: '1px solid #1E293B' }}>
        <div className="max-w-[1400px] mx-auto px-4 lg:px-8 h-16 flex items-center gap-4">
          {/* Logo */}
          <button onClick={() => setActiveTab('picks')} className="flex-shrink-0 hover:opacity-80 transition-opacity">
            <img src="/logo-dark.svg" alt="Alpha" className="h-7 w-auto" />
          </button>

          {/* Nav tabs */}
          <nav className="hidden md:flex items-center gap-0.5 ml-4">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className="relative flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium transition-colors whitespace-nowrap rounded-lg"
                style={{
                  color: activeTab === tab.id ? '#F1F5F9' : '#64748B',
                  background: activeTab === tab.id ? 'rgba(255,255,255,0.08)' : 'transparent',
                }}
              >
                <tab.icon size={14} />
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="flex-1" />

          {/* Market indicators */}
          <div className="hidden lg:flex items-center gap-3">
            {niftyData && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium" style={{ color: '#94A3B8' }}>NIFTY</span>
                <span className="text-[13px] font-data font-medium" style={{ color: '#F1F5F9' }}>{niftyData.price.toLocaleString('en-IN')}</span>
                <span className="flex items-center gap-0.5 text-[11px] font-data font-medium" style={{ color: niftyData.is_up ? '#34D399' : '#F87171' }}>
                  {niftyData.is_up ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  {niftyData.change_pct > 0 ? '+' : ''}{niftyData.change_pct}%
                </span>
              </div>
            )}
            <span className="w-px h-4" style={{ background: '#1E293B' }} />
            {marketRegimeScore !== null && (
              <div className="flex items-center gap-1.5">
                <Zap size={12} style={{ color: marketRegimeScore >= 1 ? '#34D399' : marketRegimeScore <= -1 ? '#F87171' : '#FBBF24' }} />
                <span className="text-[11px] font-medium" style={{ color: marketRegimeScore >= 1 ? '#34D399' : marketRegimeScore <= -1 ? '#F87171' : '#FBBF24' }}>{regimeLabel}</span>
              </div>
            )}
            {fiiNet !== null && (
              <span className="text-[11px] font-data" style={{ color: fiiNet > 0 ? '#34D399' : '#F87171' }}>
                FII {fiiNet > 0 ? '+' : ''}{Math.round(fiiNet)}
              </span>
            )}
            {diiNet !== null && (
              <span className="text-[11px] font-data" style={{ color: diiNet > 0 ? '#34D399' : '#F87171' }}>
                DII {diiNet > 0 ? '+' : ''}{Math.round(diiNet)}
              </span>
            )}
            {pcr !== null && (
              <span className="text-[11px] font-data" style={{ color: '#94A3B8' }}>
                PCR {pcr.toFixed(2)}
              </span>
            )}
            {coveragePct !== null && (
              <span className="text-[11px]" style={{ color: '#64748B' }}>
                {coveragePct}%
              </span>
            )}
          </div>

          {/* Mobile toggle + theme */}
          <div className="flex items-center gap-2">
            <button onClick={() => setShowIndicators(!showIndicators)} className="lg:hidden p-2 rounded-lg transition-colors" style={{ color: '#94A3B8' }}>
              <Layers size={16} />
            </button>
            <button
              onClick={() => setIsDark(!isDark)}
              className="p-2 rounded-lg transition-colors"
              style={{ color: '#94A3B8' }}
              title="Toggle Theme"
            >
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        <div className="md:hidden px-4 pb-2 flex gap-1 overflow-x-auto scrollbar-none">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-lg whitespace-nowrap transition-colors"
              style={{
                color: activeTab === tab.id ? '#F1F5F9' : '#64748B',
                background: activeTab === tab.id ? 'rgba(255,255,255,0.08)' : 'transparent',
              }}
            >
              <tab.icon size={13} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Mobile indicators */}
        {showIndicators && (
          <div className="lg:hidden px-4 pb-3 flex flex-wrap gap-3 text-[11px]" style={{ borderTop: '1px solid #1E293B' }}>
            {niftyData && <span style={{ color: '#94A3B8' }}>NIFTY <span className="font-data" style={{ color: '#F1F5F9' }}>{niftyData.price.toLocaleString('en-IN')}</span> <span className="font-data" style={{ color: niftyData.is_up ? '#34D399' : '#F87171' }}>{niftyData.change_pct > 0 ? '+' : ''}{niftyData.change_pct}%</span></span>}
            {fiiNet !== null && <span style={{ color: fiiNet > 0 ? '#34D399' : '#F87171' }}>FII {fiiNet > 0 ? '+' : ''}{Math.round(fiiNet)} Cr</span>}
            {diiNet !== null && <span style={{ color: diiNet > 0 ? '#34D399' : '#F87171' }}>DII {diiNet > 0 ? '+' : ''}{Math.round(diiNet)} Cr</span>}
            {pcr !== null && <span style={{ color: '#94A3B8' }}>PCR {pcr.toFixed(2)}</span>}
            {coveragePct !== null && <span style={{ color: '#64748B' }}>{coveragePct}%</span>}
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-grow max-w-[1400px] mx-auto w-full px-4 lg:px-8 py-6 lg:py-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 gap-6 max-w-md mx-auto">
            <div className="w-full rounded-full h-1 overflow-hidden" style={{ background: 'var(--border-color)' }}>
              <div className="h-1 w-full rounded-full animate-progress origin-left" style={{ background: 'var(--brand)' }} />
            </div>
            <span className="text-sm animate-pulse" style={{ color: 'var(--text-sub)' }}>Loading market data...</span>
          </div>
        ) : data.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-96 gap-4 text-center">
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Could not load market data.</span>
            {loadError && <div className="text-xs max-w-sm break-words" style={{ color: 'var(--red)' }}>{loadError}</div>}
          </div>
        ) : (
          <div className="animate-fade-up">
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
      <footer className="mt-auto" style={{ borderTop: '1px solid var(--border-color)' }}>
        <div className="max-w-[1400px] mx-auto px-4 lg:px-8 py-6 grid grid-cols-1 sm:grid-cols-3 gap-6 text-xs">
          <div>
            <div className="flex items-center gap-2 mb-2" style={{ color: 'var(--text-main)' }}>
              <Database size={12} />
              <span className="font-medium">System Status</span>
            </div>
            <div className="space-y-1" style={{ color: 'var(--text-muted)' }}>
              <p>Signals: <span className="font-data" style={{ color: 'var(--text-main)' }}>{scanUpdated || '\u2014'}</span></p>
              <p>Prices: <span className="font-data" style={{ color: 'var(--text-main)' }}>{pricesUpdated || scanUpdated || '\u2014'}</span>
                {isDynamic && <span className="ml-1 font-medium" style={{ color: 'var(--green)' }}>Live</span>}
              </p>
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-2" style={{ color: 'var(--text-main)' }}>
              <span className="font-medium">Disclaimer</span>
            </div>
            <p className="leading-relaxed" style={{ color: 'var(--text-sub)' }}>
              Educational purposes only. Not investment advice. Not registered with SEBI. Consult a SEBI-registered advisor before investing.
            </p>
          </div>
          <div className="sm:text-right">
            <div className="font-medium mb-2" style={{ color: 'var(--text-main)' }}>Alpha Research</div>
            <p style={{ color: 'var(--text-muted)' }}>Alpha Research and Investment Club</p>
            <p style={{ color: 'var(--text-muted)' }}>FMS Delhi</p>
            <p className="mt-1" style={{ color: 'var(--text-sub)' }}>Made with &#9829; by Abhishek Kumar</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
