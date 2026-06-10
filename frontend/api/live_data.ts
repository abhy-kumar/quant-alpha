// @ts-nocheck
import YahooFinance from 'yahoo-finance2'

const yahooFinance = new YahooFinance()

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version',
  )

  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  try {
    // Calculate current IST time
    const currentUTC = new Date()
    const istOffset = 5.5 * 60 * 60 * 1000
    const istTime = new Date(currentUTC.getTime() + istOffset)

    const day = istTime.getUTCDay()
    const hour = istTime.getUTCHours()
    const minute = istTime.getUTCMinutes()

    const isWeekend = day === 0 || day === 6
    const isOutsideMarketHours = hour < 9 || hour > 16 || (hour === 16 && minute >= 30)

    if (isWeekend || isOutsideMarketHours) {
      return res.status(200).json({ status: 'market_closed' })
    }
    let tickers = req.body?.tickers || req.query.tickers
    
    if (!tickers) {
      return res.status(400).json({ error: 'Tickers parameter is required' })
    }

    let tickerList = []
    if (typeof tickers === 'string') {
      tickerList = tickers.split(',')
    } else if (Array.isArray(tickers)) {
      tickerList = tickers
    }

    if (tickerList.length === 0) {
      return res.status(400).json({ error: 'Tickers list cannot be empty' })
    }

    // Always ensure Nifty 50 is included for the frontend indicator
    if (!tickerList.includes('^NSEI')) {
      tickerList.push('^NSEI')
    }

    // Fetch batch quotes
    const quotes = await yahooFinance.quote(tickerList)

    const results = {}
    let niftyData = null

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

    return res.status(200).json({
      status: 'ok',
      data: results,
      nifty_50: niftyData,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Yahoo Finance Live Data Error:', error)
    return res.status(500).json({ error: 'Failed to fetch live data' })
  }
}
