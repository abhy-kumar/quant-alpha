import YahooFinance from 'yahoo-finance2'
import type { IncomingMessage, ServerResponse } from 'http'

const yahooFinance = new YahooFinance()

interface ChartQuote {
  date: Date
  open: number | null
  high: number | null
  low: number | null
  close: number | null
  volume: number | null
}

interface ChartDataPoint {
  time: string
  open: number | null
  high: number | null
  low: number | null
  close: number | null
  volume: number | null
  value: number | null
  sma50: number | null
  sma200: number | null
  rsi: number | null
  macd: number | null
  macd_signal: number | null
  macd_hist: number | null
  bb_upper: number | null
  bb_lower: number | null
  bb_mid: number | null
  bb_pctb: number | null
  supertrend: number | null
  supertrend_dir: number | null
}

function periodToStart(period: string, end: Date): Date {
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

function rollingMean(values: (number | null)[], window: number): (number | null)[] {
  return values.map((_, i) => {
    if (i < window - 1) return null
    const slice = values.slice(i - window + 1, i + 1)
    return slice.reduce((sum, value) => sum + (value ?? 0), 0) / window
  })
}

function rollingStd(values: (number | null)[], window: number): (number | null)[] {
  return values.map((_, i) => {
    if (i < window - 1) return null
    const slice = values.slice(i - window + 1, i + 1)
    const mean = slice.reduce((sum, v) => sum + (v ?? 0), 0) / window
    const variance = slice.reduce((sum, v) => sum + ((v ?? 0) - mean) ** 2, 0) / (window - 1)
    return Math.sqrt(variance)
  })
}

function ema(values: number[], span: number): number[] {
  const k = 2 / (span + 1)
  const result = [values[0]]
  for (let i = 1; i < values.length; i++) {
    result.push(values[i] * k + result[i - 1] * (1 - k))
  }
  return result
}

function computeMacd(closes: number[]): { macd: number[]; signal: number[]; hist: number[] } {
  const ema12 = ema(closes, 12)
  const ema26 = ema(closes, 26)
  const macdLine = ema12.map((v, i) => v - ema26[i])
  const signalLine = ema(macdLine, 9)
  const histogram = macdLine.map((v, i) => v - signalLine[i])
  return { macd: macdLine, signal: signalLine, hist: histogram }
}

function computeBollingerBands(closes: number[], period = 20, multiplier = 2) {
  const mid = rollingMean(closes, period)
  const std = rollingStd(closes, period)
  const upper = closes.map((_, i) => {
    if (mid[i] === null || std[i] === null) return null
    return mid[i]! + multiplier * std[i]!
  })
  const lower = closes.map((_, i) => {
    if (mid[i] === null || std[i] === null) return null
    return mid[i]! - multiplier * std[i]!
  })
  const pctB = closes.map((c, i) => {
    if (upper[i] === null || lower[i] === null || upper[i] === lower[i]) return null
    return (c - lower[i]!) / (upper[i]! - lower[i]!)
  })
  return { mid, upper, lower, pctB }
}

function computeAtr(highs: number[], lows: number[], closes: number[], period = 14): (number | null)[] {
  const tr = closes.map((c, i) => {
    if (i === 0) return highs[i] - lows[i]
    return Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]))
  })
  const atr: (number | null)[] = Array(tr.length).fill(null)
  let sum = 0
  for (let i = 0; i < tr.length; i++) {
    if (i < period - 1) { sum += tr[i]; continue }
    if (i === period - 1) { sum += tr[i]; atr[i] = sum / period; continue }
    atr[i] = ((atr[i - 1] as number) * (period - 1) + tr[i]) / period
  }
  return atr
}

function computeSupertrend(highs: number[], lows: number[], closes: number[], period = 10, multiplier = 3) {
  const atr = computeAtr(highs, lows, closes, period)
  const hl2 = closes.map((_, i) => (highs[i] + lows[i]) / 2)
  const n = closes.length
  const basicUpper = hl2.map((v, i) => atr[i] !== null ? v + multiplier * atr[i]! : null)
  const basicLower = hl2.map((v, i) => atr[i] !== null ? v - multiplier * atr[i]! : null)
  const finalUpper: (number | null)[] = Array(n).fill(null)
  const finalLower: (number | null)[] = Array(n).fill(null)
  const supertrend: (number | null)[] = Array(n).fill(null)
  const direction: number[] = Array(n).fill(1)

  for (let i = 0; i < n; i++) {
    if (basicUpper[i] === null) continue
    if (i === 0) { finalUpper[i] = basicUpper[i]; finalLower[i] = basicLower[i]; continue }
    finalUpper[i] = (basicUpper[i]! < finalUpper[i - 1]! || closes[i - 1] > finalUpper[i - 1]!) ? basicUpper[i] : finalUpper[i - 1]
    finalLower[i] = (basicLower[i]! > finalLower[i - 1]! || closes[i - 1] < finalLower[i - 1]!) ? basicLower[i] : finalLower[i - 1]
    if (direction[i - 1] === 1) {
      direction[i] = closes[i] > finalUpper[i]! ? -1 : 1
    } else {
      direction[i] = closes[i] < finalLower[i]! ? 1 : -1
    }
    supertrend[i] = direction[i] === -1 ? finalLower[i] : finalUpper[i]
  }
  return { supertrend, direction }
}

function computeRsi(closes: number[], period = 14): (number | null)[] {
  const rsi: (number | null)[] = Array(closes.length).fill(null)
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

export async function fetchChartData(ticker: string, period = '1mo', interval = '1d'): Promise<ChartDataPoint[]> {
  const end = new Date()
  const start = periodToStart(period, end)

  const paddingDays = interval === '1wk' ? 200 * 7 : 200 * 1.5
  const extendedStart = new Date(start.getTime() - paddingDays * 24 * 60 * 60 * 1000)

  const result = await yahooFinance.chart(ticker, {
    period1: extendedStart,
    period2: end,
    interval,
  })

  const quotes = result.quotes.filter((quote: ChartQuote) => quote.close !== null)
  const closes = quotes.map((quote: ChartQuote) => quote.close as number)
  const highs = quotes.map((quote: ChartQuote) => quote.high ?? quote.close as number)
  const lows = quotes.map((quote: ChartQuote) => quote.low ?? quote.close as number)
  const sma50 = rollingMean(closes, 50)
  const sma200 = rollingMean(closes, 200)
  const rsi = computeRsi(closes, 14)
  const macd = computeMacd(closes)
  const bb = computeBollingerBands(closes)
  const st = computeSupertrend(highs, lows, closes)

  const fullData: ChartDataPoint[] = quotes.map((quote: ChartQuote, index: number) => ({
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
    macd: macd.macd[index],
    macd_signal: macd.signal[index],
    macd_hist: macd.hist[index],
    bb_upper: bb.upper[index],
    bb_lower: bb.lower[index],
    bb_mid: bb.mid[index],
    bb_pctb: bb.pctB[index],
    supertrend: st.supertrend[index],
    supertrend_dir: st.direction[index],
  }))

  const startTimeStr = start.toISOString().split('T')[0]
  return fullData.filter(d => d.time >= startTimeStr)
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
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
    const ticker = url.searchParams.get('ticker')
    const period = url.searchParams.get('period') || '1mo'
    const interval = url.searchParams.get('interval') || '1d'

    if (!ticker) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'Ticker is required' }))
      return
    }

    const data = await fetchChartData(ticker, period, interval)

    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({
      status: 'ok',
      data,
    }))
  } catch (error) {
    console.error('Yahoo Finance Error:', error)
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Failed to fetch chart data' }))
  }
}
