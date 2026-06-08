// @ts-nocheck
import yahooFinance from 'yahoo-finance2'

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  )

  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  try {
    const ticker = req.query.ticker
    const period = req.query.period || '1mo'
    const interval = req.query.interval || '1d'

    if (!ticker) {
      return res.status(400).json({ error: 'Ticker is required' })
    }

    // Convert period to date ranges
    const queryOptions = {
      period1: period === '1y' ? '1y' : period === '3mo' ? '3mo' : period === '1mo' ? '1mo' : period === '5d' ? '5d' : '1mo',
      interval: interval
    }
    
    // Actually yahoo-finance2 chart takes period1 as Date or string
    // Let's calculate dates manually for precision
    const end = new Date()
    const start = new Date()
    
    if (period === '1y') start.setFullYear(end.getFullYear() - 1)
    else if (period === '3mo') start.setMonth(end.getMonth() - 3)
    else if (period === '1mo') start.setMonth(end.getMonth() - 1)
    else if (period === '5d') start.setDate(end.getDate() - 5)
    else start.setMonth(end.getMonth() - 1)

    const result = await yahooFinance.chart(ticker, {
      period1: start,
      period2: end,
      interval: interval as any
    })

    // Format identical to our old Python backend
    const formattedData = result.quotes.map(q => ({
      time: q.date.toISOString().split('T')[0],
      open: q.open,
      high: q.high,
      low: q.low,
      close: q.close,
      value: q.close // Adding value property for lightweight-charts area series
    })).filter(q => q.close !== null)

    return res.status(200).json({
      status: 'ok',
      data: formattedData
    })
  } catch (error) {
    console.error('Yahoo Finance Error:', error)
    return res.status(500).json({ error: 'Failed to fetch chart data' })
  }
}
