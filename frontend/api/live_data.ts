import YahooFinance from 'yahoo-finance2'
import type { IncomingMessage, ServerResponse } from 'http'

const yahooFinance = new YahooFinance()

interface QuoteResult {
  symbol: string
  regularMarketPrice: number
  regularMarketChangePercent: number
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
    const currentUTC = new Date()
    const istOffset = 5.5 * 60 * 60 * 1000
    const istTime = new Date(currentUTC.getTime() + istOffset)

    const day = istTime.getUTCDay()
    const hour = istTime.getUTCHours()
    const minute = istTime.getUTCMinutes()

    const isWeekend = day === 0 || day === 6
    const isOutsideMarketHours = hour < 9 || hour > 16 || (hour === 16 && minute >= 30)
    const isMarketClosed = isWeekend || isOutsideMarketHours

    if (isMarketClosed) {
      res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400')
    } else {
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120')
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

    const quotes: QuoteResult[] = await yahooFinance.quote(tickerList)

    const results: Record<string, { price: number; change_pct: number }> = {}
    let niftyData: { price: number; change_pct: number; is_up: boolean } | null = null

    for (const q of quotes) {
      if (q.symbol === '^NSEI') {
        niftyData = {
          price: q.regularMarketPrice,
          change_pct: Number((q.regularMarketChangePercent || 0).toFixed(2)),
          is_up: (q.regularMarketChangePercent || 0) >= 0
        }
      } else {
        results[q.symbol] = {
          price: q.regularMarketPrice,
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
