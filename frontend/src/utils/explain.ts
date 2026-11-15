import type { DashboardData } from '../types'

const PILLARS: Record<string, string> = {
  quality: 'quality', value: 'value', momentum: 'momentum', trend: 'trend', stability: 'stability',
}
const describe = (score: number) => score >= 8 ? 'very strong' : score >= 6.5 ? 'strong' : score >= 4.5 ? 'average' : score >= 3 ? 'weak' : 'very weak'

export interface RatingExplanation { headline: string; points: string[] }

/** Plain-language reasons for the balanced-horizon rating, from the published inputs only. */
export function explainRating(stock: DashboardData): RatingExplanation | null {
  const factors = stock.Ranking_Factors
  if (!factors || stock.Sector === 'ETF') return null
  const rating = stock.Conviction ?? 'Insufficient data'
  const percentile = stock.Ranking_Percentiles?.balanced
  const coverage = stock.Ranking_Coverage?.balanced
  const flags = stock.Red_Flags ?? []
  const points: string[] = []

  if (rating === 'Insufficient data' || stock.Ranking_Eligible?.balanced === false) {
    const reason = coverage != null && coverage < 0.7
      ? `only ${Math.round(coverage * 100)}% of the inputs are available (70% is needed)`
      : 'its price is stale or it has under a year of trading history'
    return { headline: `Not rated: ${reason}.`, points }
  }

  const ranked = Object.entries(factors)
    .filter(([name, value]) => name in PILLARS && typeof value === 'number' && Number.isFinite(value))
    .sort((a, b) => b[1] - a[1])
  const strong = ranked.filter(([, value]) => value >= 6.5).slice(0, 2)
  const weak = ranked.filter(([, value]) => value < 4.5).slice(-2).reverse()
  const top = percentile != null ? Math.max(1, Math.round(100 - percentile)) : null
  const headline = top == null ? `Rated ${rating}.`
    : top <= 50 ? `Rated ${rating}: it ranks in the top ${top}% of rated stocks.`
    : `Rated ${rating}: it ranks in the bottom ${Math.max(1, 100 - top)}% of rated stocks.`

  if (strong.length) points.push(`Helped by ${strong.map(([name, value]) => `${describe(value)} ${PILLARS[name]} (${value.toFixed(1)})`).join(' and ')}.`)
  if (weak.length) points.push(`Held back by ${weak.map(([name, value]) => `${describe(value)} ${PILLARS[name]} (${value.toFixed(1)})`).join(' and ')}.`)
  if (!strong.length && !weak.length) points.push('No input stands out; every group scores close to average.')
  if (flags.length) points.push(`Capped by a red flag: ${flags.join('; ').toLowerCase()}.`)

  if (!flags.length && top != null) {
    const score = typeof stock.Composite_Score === 'number' ? stock.Composite_Score : null
    if (rating === 'Buy') points.push(`Strong Buy needs the top 10% and a score of 6.5${score != null ? ` (now ${score.toFixed(1)})` : ''}.`)
    else if (rating === 'Hold') points.push(`Buy needs the top 30% and a score of 5.5${score != null ? ` (now ${score.toFixed(1)})` : ''}.`)
    else if (rating === 'Caution' || rating === 'Avoid') points.push('It would move to Hold by rising out of the bottom 40% of rated stocks.')
  }
  if (coverage != null && coverage < 1) points.push(`${Math.round(coverage * 100)}% of the inputs were available; the rest are left out, not assumed.`)
  return { headline, points }
}
