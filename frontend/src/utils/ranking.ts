import type { DashboardData, ScoreHistoryItem } from '../types'

export type Horizon = 'short' | 'long'
export const scoreField = (horizon: Horizon) => horizon === 'long' ? 'Composite_Score_Long' : 'Composite_Score_Tech'
export const convictionField = (horizon: Horizon) => horizon === 'long' ? 'Conviction_Long' : 'Tactical_Conviction'
export function horizonScore(row: DashboardData, horizon: Horizon): number {
  const value = row[scoreField(horizon)]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}
export function horizonConviction(row: DashboardData, horizon: Horizon): string {
  return row[convictionField(horizon)] ?? 'Insufficient data'
}
export function topRanked(rows: DashboardData[], horizon: Horizon, count = 3): DashboardData[] {
  return rows.filter(row => row.Sector !== 'ETF' && row.Ranking_Eligible?.[horizon] === true &&
      ['Buy', 'Strong Buy'].includes(horizonConviction(row, horizon)))
    .sort((a, b) => horizonScore(b, horizon) - horizonScore(a, horizon) || a.Ticker.localeCompare(b.Ticker))
    .slice(0, count)
}

export function horizonHistory(history: ScoreHistoryItem[], version: string | undefined, horizon: Horizon): ScoreHistoryItem[] {
  return history.filter(row => (row.model_version ?? undefined) === version)
    .map(row => ({ ...row, composite: (horizon === 'long' ? row.composite_fund : row.composite_tech) ?? NaN }))
    .filter(row => Number.isFinite(row.composite))
}
