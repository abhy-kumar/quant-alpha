import { memo, useMemo, useState } from 'react'
import type { DashboardData } from '../../types'
import { SegmentedControl, GlassCard, GlassCardHeader, GlassCardContent } from '../common/shared'
import { GridFour } from '@phosphor-icons/react'

interface Props {
  sectorMap: Record<string, DashboardData[]>
  onSelect: (ticker: string) => void
  isDark: boolean
}

function score(stock: DashboardData): number | null {
  const value = stock.Composite_Score
  if (value === null || value === undefined) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function tileColor(value: number | null) {
  const token = value === null ? '--text-3' : value >= 7 ? '--green' : value >= 4 ? '--blue' : '--red'
  return { backgroundColor: value === null ? 'var(--surface-2)' : `color-mix(in srgb, var(${token}) 10%, var(--surface))`,
    border: '1px solid var(--border)', color: 'var(--text)' }
}

function HeatmapTab({ sectorMap, onSelect }: Props) {
  const [sortMode, setSortMode] = useState('score')
  const sectorScores = useMemo(() => Object.fromEntries(Object.entries(sectorMap).map(([sector, stocks]) => {
    const scores = stocks.map(score).filter((value): value is number => value !== null)
    return [sector, scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null]
  })), [sectorMap])
  const sectors = Object.keys(sectorMap).sort((a, b) => sortMode === 'score'
    ? (sectorScores[b] ?? -1) - (sectorScores[a] ?? -1) || a.localeCompare(b) : a.localeCompare(b))
  const hasScores = Object.values(sectorScores).some(value => value !== null)
  return <div className="space-y-5">
    <div className="flex flex-wrap justify-between items-center gap-3 text-xs text-[var(--text-3)]">
      <div className="flex flex-wrap items-center gap-4" aria-label="Score legend">
        {hasScores ? <><span>Composite score</span>{[[3, 'Low: below 4'], [5, 'Mid: 4 to 7'], [8, 'High: 7 and above']].map(([value, label]) =>
          <span key={label} className="flex items-center gap-1.5"><span aria-hidden="true" className="w-3 h-3 rounded-sm" style={tileColor(Number(value))} />{label}</span>)}</>
          : <span>Sign in to view research scores. Unavailable scores are marked N/A.</span>}
      </div>
      <SegmentedControl label="Sort sectors" options={[{ key: 'score', label: 'By score' }, { key: 'alpha', label: 'A to Z' }]} value={sortMode} onChange={setSortMode} />
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
      {sectors.map(sector => {
        const stocks = sectorMap[sector]
        const average = sectorScores[sector]
        return <GlassCard key={sector}>
          <GlassCardHeader icon={GridFour} title={sector} badge={<span className="typo-num-sm text-[var(--text-2)]">{average === null ? 'N/A' : `${average.toFixed(1)} / 10`}</span>} />
          <GlassCardContent className="p-4">
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(4, Math.max(2, Math.ceil(Math.sqrt(stocks.length))))}, minmax(0, 1fr))` }}>
              {stocks.map(stock => {
                const value = score(stock)
                const ticker = stock.Ticker.replace('.NS', '')
                return <button type="button" key={stock.Ticker} onClick={() => onSelect(stock.Ticker)}
                  aria-label={`${ticker}, ${value === null ? 'score unavailable' : `score ${value.toFixed(1)}`}. View chart`}
                  className="heatmap-tile flex flex-col items-center justify-center px-1 py-3 rounded-lg min-w-0" style={tileColor(value)}>
                  <span className="w-full truncate text-xs font-semibold">{ticker}</span>
                  <span className="typo-num-sm mt-1">{value === null ? 'N/A' : value.toFixed(1)}</span>
                </button>
              })}
            </div>
          </GlassCardContent>
        </GlassCard>
      })}
    </div>
  </div>
}
export default memo(HeatmapTab)
