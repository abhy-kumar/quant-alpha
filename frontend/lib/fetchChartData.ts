import YahooFinance from 'yahoo-finance2'

const yahooFinance = new YahooFinance()

export type ChartPoint = {
  time: string
  open: number | null
  high: number | null
  low: number | null
  close: number
  volume: number | null
  value: number
  sma50: number | null
  sma200: number | null
  rsi: number | null
}

function periodToStart(period: string, end: Date): Date {
  const start = new Date(end)
  if (period === '1y') start.setFullYear(end.getFullYear() - 1)
  else if (period === '3mo') start.setMonth(end.getMonth() - 3)
  else if (period === '5d') start.setDate(end.getDate() - 5)
  else start.setMonth(end.getMonth() - 1)
  return start
}

function rollingMean(values: number[], window: number): (number | null)[] {
  return values.map((_, i) => {
    if (i < window - 1) return null
    const slice = values.slice(i - window + 1, i + 1)
    return slice.reduce((sum, value) => sum + value, 0) / window
  })
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

export async function fetchChartData(
  ticker: string,
  period = '1mo',
  interval = '1d',
): Promise<ChartPoint[]> {
  const end = new Date()
  const start = periodToStart(period, end)

  const result = await yahooFinance.chart(ticker, {
    period1: start,
    period2: end,
    interval: interval as '1d' | '1wk',
  })

  const quotes = result.quotes.filter((quote) => quote.close !== null)
  const closes = quotes.map((quote) => quote.close as number)
  const sma50 = rollingMean(closes, 50)
  const sma200 = rollingMean(closes, 200)
  const rsi = computeRsi(closes, 14)

  return quotes.map((quote, index) => ({
    time: quote.date.toISOString().split('T')[0],
    open: quote.open ?? null,
    high: quote.high ?? null,
    low: quote.low ?? null,
    close: quote.close as number,
    volume: quote.volume ?? null,
    value: quote.close as number,
    sma50: sma50[index],
    sma200: sma200[index],
    rsi: rsi[index],
  }))
}
