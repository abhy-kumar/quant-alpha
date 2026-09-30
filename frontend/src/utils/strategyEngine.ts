/**
 * strategyEngine.ts
 * Vectorized interactive quantitative strategy simulation engine.
 * Computes custom multi-factor backtests, equity curves, drawdown series,
 * monthly return matrices, alpha decay horizons, and trade logs in real-time.
 */

import type { DashboardData, StrategyRuleConfig, StrategyBacktestResult, StrategyTradeRecord, StrategyBacktestStats, StrategyHistory } from '../types'

export const STRATEGY_PRESETS: Record<string, StrategyRuleConfig> = {
  momentum: {
    name: 'Momentum Alpha Breakout',
    description: 'High-conviction trend breakouts with volume confirmation and dynamic ATR trailing stop.',
    minPiotroski: 5,
    minRoe: 12,
    maxDebtEquity: 0,
    maxPe: 65,
    minMomentumRank: 75,
    minRsi: 45,
    maxRsi: 72,
    requireTrend50Sma: true,
    requireVptSurge: true,
    topN: 10,
    rebalanceDays: 20,
    weightingScheme: 'score_weighted',
    stopLossAtr: 2.5,
    takeProfitPct: 25,
  },
  quality: {
    name: 'Buffett-Piotroski Quality Compounder',
    description: 'High-ROCE fortress balance sheets with top-tier accounting quality and low leverage.',
    minPiotroski: 7,
    minRoe: 18,
    maxDebtEquity: 0.6,
    maxPe: 35,
    minMomentumRank: 50,
    minRsi: 35,
    maxRsi: 68,
    requireTrend50Sma: false,
    requireVptSurge: false,
    topN: 10,
    rebalanceDays: 60,
    weightingScheme: 'equal',
    stopLossAtr: 0,
    takeProfitPct: 0,
  },
  valueRebound: {
    name: 'Mean-Reversion Value Rebound',
    description: 'Undervalued quality stocks recovering from oversold RSI pullbacks with volume confirmation.',
    minPiotroski: 6,
    minRoe: 12,
    maxDebtEquity: 0.8,
    maxPe: 22,
    minMomentumRank: 30,
    minRsi: 25,
    maxRsi: 48,
    requireTrend50Sma: false,
    requireVptSurge: true,
    topN: 10,
    rebalanceDays: 10,
    weightingScheme: 'volatility_parity',
    stopLossAtr: 2.0,
    takeProfitPct: 15,
  },
  defensive: {
    name: 'Defensive Low-Vol Yield',
    description: 'Capital preservation strategy targeting low-beta, low-volatility compounders.',
    minPiotroski: 6,
    minRoe: 15,
    maxDebtEquity: 0.5,
    maxPe: 28,
    minMomentumRank: 40,
    minRsi: 40,
    maxRsi: 62,
    requireTrend50Sma: true,
    requireVptSurge: false,
    topN: 15,
    rebalanceDays: 60,
    weightingScheme: 'volatility_parity',
    stopLossAtr: 2.0,
    takeProfitPct: 0,
  },
  garp: {
    name: 'GARP Acceleration',
    description: 'Growth at a Reasonable Price combining strong earnings quality with intermediate momentum.',
    minPiotroski: 6,
    minRoe: 20,
    maxDebtEquity: 1.0,
    maxPe: 42,
    minMomentumRank: 65,
    minRsi: 42,
    maxRsi: 70,
    requireTrend50Sma: true,
    requireVptSurge: false,
    topN: 10,
    rebalanceDays: 20,
    weightingScheme: 'score_weighted',
    stopLossAtr: 2.5,
    takeProfitPct: 30,
  },
}

/**
 * Filter universe based on user-defined strategy rules.
 */
export function filterUniverse(stocks: DashboardData[], config: StrategyRuleConfig): { stock: DashboardData; score: number }[] {
  const passed: { stock: DashboardData; score: number }[] = []

  for (const s of stocks) {
    // 1. Piotroski F-Score filter
    const fScore = s.Piotroski_F ?? -Infinity
    if (fScore < config.minPiotroski) continue

    // 2. ROE filter
    const roe = s['ROE_%'] ?? -Infinity
    if (roe < config.minRoe) continue

    // 3. Debt/Equity filter
    const de = s.Debt_to_Equity == null ? Infinity : s.Debt_to_Equity / 100
    if (de > config.maxDebtEquity) continue

    // 4. P/E filter
    const pe = s['P/E'] ?? Infinity
    if (pe <= 0 || pe > config.maxPe) continue

    // 5. Momentum filter (RS Percentile or Momentum_6M)
    const momRank = s.RS_Percentile ?? -Infinity
    if (momRank < config.minMomentumRank) continue

    // 6. RSI range filter
    const rsi = s.RSI_Value ?? -Infinity
    if (rsi < config.minRsi || rsi > config.maxRsi) continue

    // 7. Trend filter: Price > 50SMA
    if (config.requireTrend50Sma && s.Sig_Price_vs_SMA50 !== 1) continue

    // 8. Volume filter: VPT > EMA20
    if (config.requireVptSurge && s.Sig_VPT !== 1) continue

    // Compute composite ranking score for portfolio selection
    const techScore = s.Tech_Score ?? 5.0
    const fundScore = s.Fund_Score ?? 5.0
    const compositeScore = s.Composite_Score ?? (techScore * 0.5 + fundScore * 0.5)
    const momBonus = ((s.Momentum_6M ?? 0) / 100) * 1.5
    const qualityBonus = (fScore / 9) * 1.2

    let rankScore = compositeScore + momBonus + qualityBonus
    if (s.Conviction === 'Strong Buy') rankScore += 1.0
    if (s.Conviction === 'Caution' || s.Conviction === 'Avoid') rankScore -= 2.0

    passed.push({ stock: s, score: rankScore })
  }

  // Sort descending by rank score
  return passed.sort((a, b) => b.score - a.score)
}

/**
 * Execute vectorized strategy simulation over benchmark and stock universe.
 */
export function simulateStrategy(history: StrategyHistory | null, config: StrategyRuleConfig): StrategyBacktestResult {
  const chart: StrategyBacktestResult['chart'] = []
  const trades: StrategyTradeRecord[] = []
  const empty = (message: string): StrategyBacktestResult => ({ config, chart: [], trades: [], stats: computeStrategyStats([], [], [], []), monthlyReturns: [], alphaDecay: [], message })
  if (!history || history.dates.length < 2) return empty('Recorded price and factor history is not available yet.')
  const { dates, prices, benchmark, factors } = history
  if (benchmark.length !== dates.length || benchmark.some(p => !(p > 0))) return empty('NIFTY benchmark coverage is incomplete.')
  let cash = 100, peak = 100, benchPeak = 100
  const positions = new Map<string, { shares: number; entry: number; entryDate: string; entryIdx: number; peak: number; atr: number }>()
  const factorDates = Object.keys(factors).sort()
  const fee = 0.002
  let anyMatches = false
  const exit = (ticker: string, idx: number, reason: StrategyTradeRecord['exitReason']) => {
    const p = positions.get(ticker)!
    const price = prices[dates[idx]]?.[ticker]
    if (!(price > 0)) throw new Error(`Missing executable close for ${ticker} on ${dates[idx]}`)
    cash += p.shares * price * (1 - fee)
    trades.push({ ticker, entryDate: p.entryDate, exitDate: dates[idx], entryPrice: p.entry, exitPrice: price,
      returnPct: (price * (1-fee) / (p.entry * (1+fee)) - 1) * 100, holdingDays: idx-p.entryIdx, exitReason: reason })
    positions.delete(ticker)
  }
  const nav = (idx: number) => cash + [...positions].reduce((sum, [t,p]) => sum + p.shares * prices[dates[idx]][t], 0)
  chart.push({ date: dates[0], portfolio: 100, benchmark: 100, drawdown: 0, benchmarkDrawdown: 0 })
  try {
    for (let i = 1; i < dates.length; i++) {
      cash *= Math.pow(1.065, 1/252)
      for (const [ticker,p] of positions) {
        const price = prices[dates[i]]?.[ticker]
        if (!(price > 0)) return empty(`Missing executable close for ${ticker} on ${dates[i]}.`)
        if (config.stopLossAtr > 0 && price <= p.peak - config.stopLossAtr * p.atr) exit(ticker, i, 'Stop-Loss')
        else if (config.takeProfitPct > 0 && price >= p.entry * (1+config.takeProfitPct/100)) exit(ticker, i, 'Take-Profit')
        else p.peak = Math.max(p.peak, price)
      }
      if ((i-1) % Math.max(1, config.rebalanceDays) === 0 && i < dates.length-1) {
        // Liquidate at the observed close; charge both exit and fresh entry legs.
        for (const ticker of [...positions.keys()]) exit(ticker, i, 'Rebalance')
        const lastFactorDate = factorDates.filter(d => d < dates[i]).at(-1) || ''
        const fresh = lastFactorDate && (Date.parse(dates[i])-Date.parse(lastFactorDate))/86400000 <= 7
        const matched = filterUniverse(fresh ? factors[lastFactorDate] : [], config)
          .filter(({ stock }) => prices[dates[i]][stock.Ticker] > 0 && (config.stopLossAtr <= 0 || (stock.ATR_Value ?? 0) > 0))
          .slice(0, Math.max(1, config.topN))
        anyMatches ||= matched.length > 0
        const raw = matched.map(m => config.weightingScheme === 'score_weighted' ? Math.max(0, m.score)
          : config.weightingScheme === 'volatility_parity' ? 1 / Math.max(m.stock.Vol_60D ?? Infinity, 0.01) : 1)
        const total = raw.reduce((a,b) => a+b,0)
        const budget = cash / (1+fee)
        if (total > 0) matched.forEach(({ stock }, j) => {
          const dollars = budget * raw[j]/total
          if (dollars <= 0) return
          const price = prices[dates[i]][stock.Ticker]
          cash -= dollars * (1+fee)
          positions.set(stock.Ticker, { shares: dollars/price, entry: price, entryDate: dates[i], entryIdx: i, peak: price, atr: stock.ATR_Value || 0 })
        })
      }
      if (i === dates.length-1) for (const ticker of [...positions.keys()]) exit(ticker,i,'End of Test')
      const portfolio = nav(i), bench = benchmark[i]/benchmark[0]*100
      peak = Math.max(peak, portfolio); benchPeak = Math.max(benchPeak, bench)
      chart.push({ date:dates[i], portfolio, benchmark:bench, drawdown:(portfolio/peak-1)*100, benchmarkDrawdown:(bench/benchPeak-1)*100 })
    }
  } catch (error) { return empty(error instanceof Error ? error.message : 'Incomplete historical coverage') }
  const daily = chart.slice(1).map((c,i) => c.portfolio/chart[i].portfolio-1)
  const benchDaily = chart.slice(1).map((c,i) => c.benchmark/chart[i].benchmark-1)
  return { config, chart, trades: trades.slice().reverse(), stats: computeStrategyStats(chart,daily,benchDaily,trades),
    monthlyReturns:computeMonthlyGrid(chart), alphaDecay:computeAlphaDecay(chart),
    message:anyMatches ? `Recorded history: ${dates[0]} to ${dates.at(-1)}. Prior-day factors, close execution, 20bps per leg; ATR stops execute at the close.` : 'No historical stocks meet these rules. Portfolio held cash.' }
}

/**
 * Compute key risk and return metrics.
 */
function computeStrategyStats(
  chart: { date: string; portfolio: number; benchmark: number; drawdown: number }[],
  dailyPortReturns: number[],
  dailyBenchReturns: number[],
  trades: StrategyTradeRecord[]
): StrategyBacktestStats {
  if (chart.length < 2) {
    return {
      totalReturn: 0, cagr: 0, annualVol: 0, sharpeRatio: 0, sortinoRatio: 0,
      calmarRatio: 0, maxDrawdown: 0, winRate: 0, profitFactor: 1, totalTrades: 0,
      avgTradeReturn: 0, benchmarkReturn: 0, benchmarkCagr: 0, alpha: 0, beta: 1,
    }
  }

  const dStart = new Date(chart[0].date).getTime()
  const dEnd = new Date(chart[chart.length - 1].date).getTime()
  const years = Math.max((dEnd - dStart) / (1000 * 60 * 60 * 24 * 365.25), 1/365.25)

  const portFirst = chart[0].portfolio
  const portLast = chart[chart.length - 1].portfolio
  const totalReturn = +(((portLast / portFirst) - 1) * 100).toFixed(2)
  const cagr = +((Math.pow(portLast / portFirst, 1 / years) - 1) * 100).toFixed(2)

  const benchFirst = chart[0].benchmark
  const benchLast = chart[chart.length - 1].benchmark
  const benchmarkReturn = +(((benchLast / benchFirst) - 1) * 100).toFixed(2)
  const benchmarkCagr = +((Math.pow(benchLast / benchFirst, 1 / years) - 1) * 100).toFixed(2)

  // Volatility
  const meanRet = dailyPortReturns.reduce((a, b) => a + b, 0) / (dailyPortReturns.length || 1)
  const variance = dailyPortReturns.reduce((a, b) => a + Math.pow(b - meanRet, 2), 0) / (dailyPortReturns.length || 1)
  const dailyVol = Math.sqrt(variance)
  const annualVol = +(dailyVol * Math.sqrt(252) * 100).toFixed(2)

  // Downside deviation for Sortino
  const downsideVariance = dailyPortReturns
    .filter(r => r < 0)
    .reduce((a, b) => a + Math.pow(b, 2), 0) / (dailyPortReturns.length || 1)
  const downsideVol = Math.sqrt(downsideVariance) * Math.sqrt(252)

  const riskFree = 0.065 // 6.5% INR risk-free rate
  const sharpeRatio = annualVol > 0 ? +((meanRet * 252 - riskFree) / (annualVol / 100)).toFixed(2) : 0
  const sortinoRatio = downsideVol > 0 ? +((meanRet * 252 - riskFree) / downsideVol).toFixed(2) : 0

  // Max Drawdown & Calmar
  const maxDrawdown = Math.abs(Math.min(...chart.map(c => c.drawdown), 0))
  const calmarRatio = maxDrawdown > 0 ? +(cagr / maxDrawdown).toFixed(2) : 0

  // Beta & Alpha
  const meanBenchRet = dailyBenchReturns.reduce((a, b) => a + b, 0) / (dailyBenchReturns.length || 1)
  const covariance = dailyPortReturns.reduce((a, b, idx) => a + ((b - meanRet) * ((dailyBenchReturns[idx] || 0) - meanBenchRet)), 0) / (dailyPortReturns.length || 1)
  const benchVariance = dailyBenchReturns.reduce((a, b) => a + Math.pow(b - meanBenchRet, 2), 0) / (dailyBenchReturns.length || 1)
  const beta = benchVariance > 0 ? +(covariance / benchVariance).toFixed(2) : 1.0
  const alpha = +(cagr - (riskFree * 100 + beta * (benchmarkCagr - riskFree * 100))).toFixed(2)

  // Trade analytics
  const winTrades = trades.filter(t => t.returnPct > 0)
  const lossTrades = trades.filter(t => t.returnPct < 0)
  const winRate = trades.length > 0 ? +((winTrades.length / trades.length) * 100).toFixed(1) : 0
  const grossProfit = winTrades.reduce((a, t) => a + t.returnPct, 0)
  const grossLoss = Math.abs(lossTrades.reduce((a, t) => a + t.returnPct, 0))
  const profitFactor = grossLoss > 0 ? +(grossProfit / grossLoss).toFixed(2) : 0
  const avgTradeReturn = trades.length > 0 ? +(trades.reduce((a, t) => a + t.returnPct, 0) / trades.length).toFixed(2) : 0

  return {
    totalReturn,
    cagr,
    annualVol,
    sharpeRatio,
    sortinoRatio,
    calmarRatio,
    maxDrawdown: +maxDrawdown.toFixed(2),
    winRate,
    profitFactor,
    totalTrades: trades.length,
    avgTradeReturn,
    benchmarkReturn,
    benchmarkCagr,
    alpha,
    beta,
  }
}

/**
 * Generate monthly returns calendar matrix.
 */
function computeMonthlyGrid(chart: { date: string; portfolio: number }[]): StrategyBacktestResult['monthlyReturns'] {
  const monthMap: Record<number, Record<number, { first: number; last: number }>> = {}

  for (let i=0; i<chart.length; i++) {
    const pt = chart[i]
    const d = new Date(pt.date)
    const y = d.getFullYear()
    const m = d.getMonth() // 0-11

    if (!monthMap[y]) monthMap[y] = {}
    if (!monthMap[y][m]) {
      monthMap[y][m] = { first: chart[Math.max(0,i-1)].portfolio, last: pt.portfolio }
    } else {
      monthMap[y][m].last = pt.portfolio
    }
  }

  const results: StrategyBacktestResult['monthlyReturns'] = []
  const years = Object.keys(monthMap).map(Number).sort((a, b) => a - b)

  for (const yr of years) {
    const months: (number | null)[] = []
    let yrFirst = 0
    let yrLast = 0

    for (let m = 0; m < 12; m++) {
      if (monthMap[yr][m]) {
        const { first, last } = monthMap[yr][m]
        const mRet = +(((last - first) / first) * 100).toFixed(1)
        months.push(mRet)
        if (yrFirst === 0) yrFirst = first
        yrLast = last
      } else {
        months.push(null)
      }
    }

    const yrTotal = yrFirst > 0 ? +(((yrLast - yrFirst) / yrFirst) * 100).toFixed(1) : 0
    results.push({ year: yr, months, total: yrTotal })
  }

  return results
}

/**
 * Compute forward excess returns across holding horizons (Alpha Decay curve).
 */
function computeAlphaDecay(chart: { portfolio: number; benchmark: number }[]): StrategyBacktestResult['alphaDecay'] {
  const horizons = [
    { days: 5, label: '1-Week (5d)' },
    { days: 21, label: '1-Month (21d)' },
    { days: 63, label: '3-Month (63d)' },
    { days: 126, label: '6-Month (126d)' },
  ]

  return horizons.filter(h => chart.length > h.days).map(h => {
    let excessSum = 0
    let wins = 0
    let count = 0

    for (let i = 0; i + h.days < chart.length; i += h.days) {
      const portRet = (chart[i + h.days].portfolio - chart[i].portfolio) / chart[i].portfolio
      const benchRet = (chart[i + h.days].benchmark - chart[i].benchmark) / chart[i].benchmark
      const excess = portRet - benchRet
      excessSum += excess
      if (excess > 0) wins++
      count++
    }

    const avgExcess = count > 0 ? +((excessSum / count) * 100).toFixed(2) : 0
    const winRate = count > 0 ? +((wins / count) * 100).toFixed(1) : 0

    return {
      horizonDays: h.days,
      label: h.label,
      excessReturnPct: avgExcess,
      winRatePct: winRate,
    }
  })
}
