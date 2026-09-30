/// <reference types="node" />
import YahooFinance from 'yahoo-finance2'
import type { IncomingMessage, ServerResponse } from 'http'

import calendar from '../server/market_calendar.json' with { type: 'json' }
const yahooFinance = new YahooFinance()

interface QuoteResult {
  symbol?: string
  regularMarketPrice?: number
  regularMarketChangePercent?: number
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'GET') { res.statusCode = 405; res.end(JSON.stringify({ error: 'Use GET' })); return }
  try {
    const istString = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
    const istDate = new Date(istString)
    const day = istDate.getDay() // 0 = Sun, 6 = Sat
    const hour = istDate.getHours()
    const minute = istDate.getMinutes()

    const isWeekend = day === 0 || day === 6
    const isOutsideMarketHours = hour < 9 || (hour === 9 && minute < 15) || hour > 15 || (hour === 15 && minute >= 30)
    const dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
    const isMarketClosed = isWeekend || isOutsideMarketHours || calendar.holidays.includes(dateKey)

    // Keep edge cache short so market transitions and live quotes are always fresh
    if (isMarketClosed) {
      res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=60')
    } else {
      res.setHeader('Cache-Control', 'public, s-maxage=5, stale-while-revalidate=10')
    }

    const url = new URL(req.url || '/', 'http://localhost')
    const tickerList = [...new Set((url.searchParams.get('tickers') || '').split(','))].sort()
    if (!tickerList.length || tickerList.length > 600 || tickerList.some(t => !/^(?:[A-Z0-9&_-]{1,30}\.(?:NS|BO)|\^NSEI)$/.test(t))) {
      res.statusCode = 400
      res.setHeader('Cache-Control', 'no-store')
      res.end(JSON.stringify({ error: 'Provide 1–600 valid NSE/BSE tickers' }))
      return
    }
    if (!tickerList.includes('^NSEI')) {
      tickerList.push('^NSEI')
    }

    // Batch into groups of 50 to avoid Yahoo Finance rate limits and Vercel timeouts
    const BATCH_SIZE = 50
    const batches: string[][] = []
    for (let i = 0; i < tickerList.length; i += BATCH_SIZE) {
      batches.push(tickerList.slice(i, i + BATCH_SIZE))
    }

    const batchResults = await Promise.all(
      batches.map(batch => yahooFinance.quote(batch) as Promise<QuoteResult[]>)
    )
    const quotes = batchResults.flat()

    const results: Record<string, { price: number; change_pct: number }> = {}
    let niftyData: { price: number; change_pct: number; is_up: boolean } | null = null

    for (const q of quotes) {
      if (!q.symbol) continue
      if (q.symbol === '^NSEI') {
        niftyData = {
          price: q.regularMarketPrice ?? 0,
          change_pct: Number((q.regularMarketChangePercent || 0).toFixed(2)),
          is_up: (q.regularMarketChangePercent || 0) >= 0
        }
      } else {
        results[q.symbol] = {
          price: q.regularMarketPrice ?? 0,
          change_pct: Number((q.regularMarketChangePercent || 0).toFixed(2))
        }
      }
    }

    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({
      status: 'ok',
      is_market_closed: isMarketClosed,
      data: results,
      nifty_50: niftyData,
      timestamp: new Date().toISOString()
    }))
  } catch (error) {
    console.error('Yahoo Finance Live Data Error:', error)
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Failed to fetch live data' }))
  }
}
