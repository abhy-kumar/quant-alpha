import { useState, useEffect, useRef, useCallback } from 'react'
import axios from 'axios'
import type { DashboardData, ScoreHistoryItem } from '../types'


export function useMarketData(selectedTicker: string, setSelectedTicker: (t: string) => void, isLoggedIn = false) {
  const [data, setData] = useState<DashboardData[]>([])
  const [scanUpdated, setScanUpdated] = useState('')
  const [pricesUpdated, setPricesUpdated] = useState('')
  const [loading, setLoading] = useState(true)
  const [niftyData, setNiftyData] = useState<{ price: number; change_pct: number; is_up: boolean } | null>(null)
  const [coveragePct, setCoveragePct] = useState<number | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [marketRegimeScore, setMarketRegimeScore] = useState<number | null>(null)
  const [isDynamic, setIsDynamic] = useState(false)

  const [fiiNet, setFiiNet] = useState<number | null>(null)
  const [diiNet, setDiiNet] = useState<number | null>(null)
  const [pcr, setPcr] = useState<number | null>(null)

  const [scoreHistory, setScoreHistory] = useState<Record<string, ScoreHistoryItem[]>>({})
  const [flashTickers, setFlashTickers] = useState<Record<string, 'up' | 'down'>>({})

  const dataRef = useRef<DashboardData[]>([])
  // Keep a stable ref to the latest selectedTicker / setter so fetchData
  // doesn't need them in its dependency array (which would re-create the
  // callback and cause the polling interval to be registered multiple times).
  const selectedTickerRef = useRef(selectedTicker)
  const setSelectedTickerRef = useRef(setSelectedTicker)
  useEffect(() => { selectedTickerRef.current = selectedTicker }, [selectedTicker])
  useEffect(() => { setSelectedTickerRef.current = setSelectedTicker }, [setSelectedTicker])
  useEffect(() => {
    dataRef.current = data
  }, [data])

  const controllerRef = useRef(new AbortController())
  const liveBusyRef = useRef(false)
  const dataBusyRef = useRef(false)
  const closedRef = useRef(true)
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const lastScanUpdatedRef = useRef<string>('')

  // Score History Fetcher with cache invalidation check
  const fetchScoreHistory = useCallback(() => {
    if (!isLoggedIn) { setScoreHistory({}); return }
    axios.get('/api/data?resource=scores', { signal: controllerRef.current.signal }).then(r => setScoreHistory(r.data)).catch(() => {})
  }, [isLoggedIn])

  const fetchLive = useCallback(async () => {
    if (!dataRef.current.length || liveBusyRef.current) return
    // Skip fetching if tab is hidden
    if (document.visibilityState === 'hidden') return

    liveBusyRef.current = true
    try {
      const uniqueTickers = Array.from(new Set(dataRef.current.map(d => d.Ticker))).sort()
      const res = await axios.get('/api/live_data', { params: { tickers: uniqueTickers.join(',') }, signal: controllerRef.current.signal })

      if (res.data.status === 'ok') {
        closedRef.current = Boolean(res.data.is_market_closed)
        const lp = res.data.data
        let changed = false

        const newData = dataRef.current.map(d => {
          const live = lp[d.Ticker]
          if (!live) return d
          const price = live.price || d.Price
          const chg = live.change_pct ?? d['1d_Chg_%']
          if (price !== d.Price || chg !== d['1d_Chg_%']) changed = true
          return { ...d, Price: price, '1d_Chg_%': chg }
        })

        if (changed) setData(newData)
        if (res.data.nifty_50) setNiftyData(res.data.nifty_50)
        setPricesUpdated(
          new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }) + ' IST'
        )
        setIsDynamic(!res.data.is_market_closed)

        const newFlash: Record<string, 'up' | 'down'> = {}
        newData.forEach((d, i) => {
          const old = dataRef.current[i]
          if (old && d.Price !== old.Price) {
            newFlash[d.Ticker] = d.Price > old.Price ? 'up' : 'down'
          }
        })
        if (Object.keys(newFlash).length) {
          setFlashTickers(newFlash)
          clearTimeout(flashTimerRef.current)
          flashTimerRef.current = setTimeout(() => setFlashTickers({}), 1200)
        }

        return res.data.is_market_closed ? 'closed' : 'ok'
      }
    } catch {
      return 'err'
    } finally { liveBusyRef.current = false }
  }, [])

  const fetchData = useCallback(async () => {
    if (dataBusyRef.current) return false
    dataBusyRef.current = true
    try {
      const res = await axios.get('/api/data?resource=market', { signal: controllerRef.current.signal })
      if (res.data.status === 'ok' && res.data.data.length > 0) {
        const raw = res.data.data || []
        const seen = new Set<string>()
        const deduped: DashboardData[] = []
        for (const item of raw) {
          const t = item.Ticker ? String(item.Ticker).toUpperCase() : ''
          if (t && !seen.has(t)) {
            seen.add(t)
            deduped.push({ ...item, Ticker: t })
          }
        }
        const d = deduped.sort((a: any, b: any) => a.Ticker.localeCompare(b.Ticker))
        dataRef.current = d
        setData(d)
        setLoadError(null)
        const updatedTime = res.data.last_updated || ''
        setScanUpdated(updatedTime)

        if (res.data.nifty_50) setNiftyData(res.data.nifty_50)
        setCoveragePct(res.data.coverage_pct ?? null)
        setMarketRegimeScore(res.data.market_regime_score ?? null)
        setFiiNet(res.data.fii_net ?? null)
        setDiiNet(res.data.dii_net ?? null)
        setPcr(res.data.pcr ?? null)
        setIsDynamic(res.data.is_dynamic || false)

        if (!selectedTickerRef.current && d.length > 0) {
          setSelectedTickerRef.current(d[0].Ticker)
        }

        // Check if score history needs updating
        if (isLoggedIn) {
          lastScanUpdatedRef.current = updatedTime
          fetchScoreHistory()
        }

        setLoading(false)
        return true
      }
    } catch (e: any) {
      if (e.response?.status === 401) window.dispatchEvent(new Event('qa-session-expired'))
      if (!axios.isCancel(e)) setLoadError(e.message || String(e))
    } finally { dataBusyRef.current = false }
    setLoading(false)
    return false
  }, [fetchScoreHistory, isLoggedIn])

  useEffect(() => {
    controllerRef.current = new AbortController()
    liveBusyRef.current = false
    dataBusyRef.current = false
    let stopped = false
    let liveTimer: ReturnType<typeof setTimeout>
    const poll = async () => {
      await fetchLive()
      if (!stopped) liveTimer = setTimeout(poll, closedRef.current ? 5 * 60_000 : 30_000)
    }
    if (!isLoggedIn) setScoreHistory({})
    fetchData().then(() => { if (!stopped) poll() })
    // Retry remains active even when the initial request fails.
    const dataTimer = setInterval(fetchData, 15 * 60_000)
    const handleActiveState = () => { if (document.visibilityState === 'visible') { fetchData(); fetchLive() } }
    document.addEventListener('visibilitychange', handleActiveState)
    window.addEventListener('focus', handleActiveState)
    return () => {
      stopped = true
      controllerRef.current.abort()
      clearTimeout(liveTimer)
      clearTimeout(flashTimerRef.current)
      clearInterval(dataTimer)
      document.removeEventListener('visibilitychange', handleActiveState)
      window.removeEventListener('focus', handleActiveState)
    }
  }, [fetchData, fetchLive, isLoggedIn])

  return {
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
  }
}
