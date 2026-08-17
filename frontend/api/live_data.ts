/// <reference types="node" />
import YahooFinance from 'yahoo-finance2'
import type { IncomingMessage, ServerResponse } from 'http'

const yahooFinance = new YahooFinance()

interface QuoteResult {
  symbol?: string
  regularMarketPrice?: number
  regularMarketChangePercent?: number
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version',
  )

  if (req.method === 'OPTIONS') {
    res.statusCode = 200
    res.end()
    return
  }

  try {
    const istString = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
    const istDate = new Date(istString)
    const day = istDate.getDay() // 0 = Sun, 6 = Sat
    const hour = istDate.getHours()
    const minute = istDate.getMinutes()

    const isWeekend = day === 0 || day === 6
    const isOutsideMarketHours = hour < 9 || (hour === 9 && minute < 15) || hour > 15 || (hour === 15 && minute >= 30)
    const isMarketClosed = isWeekend || isOutsideMarketHours

    // Keep edge cache short so market transitions and live quotes are always fresh
    if (isMarketClosed) {
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120')
    } else {
      res.setHeader('Cache-Control', 'public, s-maxage=5, stale-while-revalidate=10')
    }

    let tickers: string | string[] | undefined
    if (req.method === 'POST') {
      const body = await new Promise<string>((resolve, reject) => {
        let data = ''
        req.on('data', chunk => data += chunk)
        req.on('end', () => resolve(data))
        req.on('error', reject)
      })
      const parsed = JSON.parse(body)
      tickers = parsed?.tickers
    } else {
      const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
      tickers = url.searchParams.get('tickers') ?? undefined
    }

    if (!tickers) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'Tickers parameter is required' }))
      return
    }

    let tickerList: string[] = []
    if (typeof tickers === 'string') {
      tickerList = tickers.split(',')
    } else if (Array.isArray(tickers)) {
      tickerList = tickers
    }

    if (tickerList.length === 0) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'Tickers list cannot be empty' }))
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
