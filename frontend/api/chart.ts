// @ts-nocheck
import YahooFinance from 'yahoo-finance2'

const yahooFinance = new YahooFinance()

function periodToStart(period, end) {
  const start = new Date(end)
  if (period === '1w') start.setDate(end.getDate() - 7)
  else if (period === '1mo') start.setMonth(end.getMonth() - 1)
  else if (period === '3mo') start.setMonth(end.getMonth() - 3)
  else if (period === '6mo') start.setMonth(end.getMonth() - 6)
  else if (period === '1y') start.setFullYear(end.getFullYear() - 1)
  else if (period === '2y') start.setFullYear(end.getFullYear() - 2)
  else if (period === '5y') start.setFullYear(end.getFullYear() - 5)
  else start.setMonth(end.getMonth() - 1)
  return start
}

function rollingMean(values, window) {
  return values.map((_, i) => {
    if (i < window - 1) return null
    const slice = values.slice(i - window + 1, i + 1)
    return slice.reduce((sum, value) => sum + value, 0) / window
  })
}

function computeRsi(closes, period = 14) {
  const rsi = Array(closes.length).fill(null)
  if (closes.length <= period) return rsi

  let avgGain = 0
  let avgLoss = 0
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1]
    if (change >= 0) avgGain += change
    else avgLoss -= change
  }
  avgGain /= period
  avgLoss /= period
  rsi[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)

  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1]
    const gain = change > 0 ? change : 0
    const loss = change < 0 ? -change : 0
    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period
    rsi[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  }

  return rsi
}

export async function fetchChartData(ticker, period = '1mo', interval = '1d') {
  const end = new Date()
  const start = periodToStart(period, end)

  // Fetch extra data to prime the SMAs (200 periods)
  // 1wk interval requires ~4 extra years, 1d interval requires ~1 extra year
  const paddingDays = interval === '1wk' ? 200 * 7 : 200 * 1.5;
  const extendedStart = new Date(start.getTime() - paddingDays * 24 * 60 * 60 * 1000)

  const result = await yahooFinance.chart(ticker, {
    period1: extendedStart,
    period2: end,
    interval,
  })

  const quotes = result.quotes.filter((quote) => quote.close !== null)
  const closes = quotes.map((quote) => quote.close)
  const sma50 = rollingMean(closes, 50)
  const sma200 = rollingMean(closes, 200)
  const rsi = computeRsi(closes, 14)

  const fullData = quotes.map((quote, index) => ({
    time: quote.date.toISOString().split('T')[0],
    open: quote.open ?? null,
    high: quote.high ?? null,
    low: quote.low ?? null,
    close: quote.close,
    volume: quote.volume ?? null,
    value: quote.close,
    sma50: sma50[index],
    sma200: sma200[index],
    rsi: rsi[index],
  }))

  const startTimeStr = start.toISOString().split('T')[0]
  return fullData.filter(d => d.time >= startTimeStr)
}

export default async function handler(req, res) {
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
    const ticker = req.query.ticker
    const period = req.query.period || '1mo'
    const interval = req.query.interval || '1d'

    if (!ticker) {
      return res.status(400).json({ error: 'Ticker is required' })
    }

    const data = await fetchChartData(ticker, period, interval)

    return res.status(200).json({
      status: 'ok',
      data,
    })
  } catch (error) {
    console.error('Yahoo Finance Error:', error)
    return res.status(500).json({ error: 'Failed to fetch chart data' })
  }
}
