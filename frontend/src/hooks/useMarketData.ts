import { useState, useEffect, useRef, useCallback } from 'react'
import axios from 'axios'
import type { DashboardData, ScoreHistoryItem } from '../types'


export function useMarketData(selectedTicker: string, setSelectedTicker: (t: string) => void) {
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

  const lastScanUpdatedRef = useRef<string>('')

  // Score History Fetcher with cache invalidation check
  const fetchScoreHistory = useCallback((currentScanTime?: string) => {
    const cachedScanTime = sessionStorage.getItem('qa_score_history_scan_time')
    const cached = sessionStorage.getItem('qa_score_history')

    if (cached && cachedScanTime && currentScanTime && cachedScanTime === currentScanTime) {
      try {
        setScoreHistory(JSON.parse(cached))
        return
      } catch {}
    }

    axios
      .get(`/score_history.json?t=${Date.now()}`)
      .then(r => {
        setScoreHistory(r.data)
        try {
          sessionStorage.setItem('qa_score_history', JSON.stringify(r.data))
          if (currentScanTime) {
            sessionStorage.setItem('qa_score_history_scan_time', currentScanTime)
          }
        } catch {}
      })
      .catch(() => {})
  }, [])

  const fetchLive = useCallback(async () => {
    if (!dataRef.current.length) return
    // Skip fetching if tab is hidden
    if (document.visibilityState === 'hidden') return

    try {
      const res = await axios.post('/api/live_data', {
        tickers: dataRef.current.map(d => d.Ticker),
      })

      if (res.data.status === 'ok') {
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
          new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }) + ' IST'
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
          setTimeout(() => setFlashTickers({}), 800)
        }

        return res.data.is_market_closed ? 'closed' : 'ok'
      }
    } catch (e) {
      return 'err'
    }
  }, [])

  const fetchData = useCallback(async () => {
    try {
      const res = await axios.get(`/market_data.json?t=${Date.now()}`)
      if (res.data.status === 'ok' && res.data.data.length > 0) {
        const d = res.data.data.sort((a: any, b: any) => a.Ticker.localeCompare(b.Ticker))
        setData(d)
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
        if (updatedTime !== lastScanUpdatedRef.current) {
          lastScanUpdatedRef.current = updatedTime
          fetchScoreHistory(updatedTime)
        }

        setLoading(false)
        return true
      }
    } catch (e: any) {
      setLoadError(e.message || String(e))
    }
    setLoading(false)
    return false
  }, [fetchScoreHistory])

  useEffect(() => {
    let liveId: ReturnType<typeof setInterval>
    let dataId: ReturnType<typeof setInterval>

    const init = async () => {
      if (await fetchData()) {
        setTimeout(async () => {
          const status = await fetchLive()
          if (status !== 'closed') {
            liveId = setInterval(async () => {
              if ((await fetchLive()) === 'closed') clearInterval(liveId)
            }, 15 * 1000)
          }
        }, 1000)

        dataId = setInterval(async () => {
          await fetchData()
        }, 15 * 60 * 1000)
      }
    }

    init()

    const handleActiveState = () => {
      if (document.visibilityState === 'visible') {
        fetchLive()
      }
    }
    document.addEventListener('visibilitychange', handleActiveState)
    window.addEventListener('focus', handleActiveState)

    return () => {
      clearInterval(liveId)
      clearInterval(dataId)
      document.removeEventListener('visibilitychange', handleActiveState)
      window.removeEventListener('focus', handleActiveState)
    }
  }, [fetchData, fetchLive])

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
