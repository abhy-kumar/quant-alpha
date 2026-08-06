import { useState, useEffect, useCallback } from 'react'

export function useWatchlist() {
  const [watchlist, setWatchlist] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('qa_watchlist')
      if (stored) return JSON.parse(stored)
    } catch {}
    const params = new URLSearchParams(window.location.search).get('watchlist')
    return params ? params.split(',').map(t => t.toUpperCase().trim()) : []
  })

  useEffect(() => {
    try {
      localStorage.setItem('qa_watchlist', JSON.stringify(watchlist))
    } catch {}
  }, [watchlist])

  const toggleWatchlist = useCallback((ticker: string) => {
    setWatchlist(prev =>
      prev.includes(ticker) ? prev.filter(x => x !== ticker) : [...prev, ticker]
    )
  }, [])

  return { watchlist, setWatchlist, toggleWatchlist }
}
