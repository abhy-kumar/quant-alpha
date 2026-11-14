import React, { useState } from 'react'
import { Target } from '@phosphor-icons/react'
import type { TrackRecord } from '../../types'
import { GlassCard, GlassCardHeader, GlassCardContent, GlassCardFooter, SegmentedControl } from '../common/shared'
import { getBadgeClass } from '../../utils/formatters'

const percent = (value: number) => `${value >= 0 ? '+' : '−'}${Math.abs(value * 100).toFixed(1)}%`
const HORIZONS = [
  { key: '5', label: '1 week' },
  { key: '21', label: '1 month' },
  { key: '63', label: '3 months' },
]

export const TrackRecordCard: React.FC<{ record?: TrackRecord | null }> = ({ record }) => {
  const [horizon, setHorizon] = useState('21')
  const [era, setEra] = useState<'current' | 'previous'>(record?.current?.horizons?.['21']?.scan_dates ? 'current' : 'previous')
  if (!record?.current && !record?.previous) return null
  const source = record[era] ?? record.current ?? record.previous
  const result = source?.horizons?.[horizon]
  const rows = result?.labels ?? []
  const eras = [
    ...(record.current ? [{ key: 'current', label: 'Current model' }] : []),
    ...(record.previous ? [{ key: 'previous', label: 'Earlier model' }] : []),
  ]

  return (
    <GlassCard>
      <GlassCardHeader
        icon={Target}
        title="Track Record"
        tooltipId="quant.track"
        subtitle={source ? `Ratings published ${source.since}${source.until ? ` to ${source.until}` : ' onward'} · prices to ${record.prices_through}` : undefined}
        action={
          <div className="flex flex-wrap gap-2">
            {eras.length > 1 && <SegmentedControl label="Model" options={eras} value={era} onChange={key => setEra(key as 'current' | 'previous')} />}
            <SegmentedControl label="Holding period" options={HORIZONS} value={horizon} onChange={setHorizon} />
          </div>
        }
      />
      <GlassCardContent className="p-5">
        {rows.length === 0 ? (
          <p className="typo-body py-6 text-center">
            No rating from this model is old enough to judge over this holding period yet. Results appear here as they mature.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr>
                  <th className="pb-2 text-left">Rating when published</th>
                  <th className="pb-2 px-2 text-right">Average return</th>
                  <th className="pb-2 px-2 text-right">NIFTY</th>
                  <th className="pb-2 px-2 text-right whitespace-nowrap">Made money</th>
                  <th className="pb-2 px-2 text-right whitespace-nowrap hidden sm:table-cell">Beat NIFTY</th>
                  <th className="pb-2 pl-2 text-right hidden md:table-cell">Scan dates</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.label} style={row.label === 'All rated stocks' ? { borderTop: '1px solid var(--border)' } : undefined}>
                    <td className="py-2">
                      {row.label === 'All rated stocks'
                        ? <span style={{ color: 'var(--text-2)' }}>{row.label}</span>
                        : <span className={`badge ${getBadgeClass(row.label)}`}>{row.label}</span>}
                    </td>
                    <td className="py-2 px-2 text-right font-mono font-medium" style={{ color: row.mean_return >= 0 ? 'var(--green)' : 'var(--red)' }}>{percent(row.mean_return)}</td>
                    <td className="py-2 px-2 text-right font-mono" style={{ color: 'var(--text-2)' }}>{percent(row.nifty)}</td>
                    <td className="py-2 px-2 text-right font-mono">{Math.round(row.positive_share * 100)}%</td>
                    <td className="py-2 px-2 text-right font-mono hidden sm:table-cell">{Math.round(row.beat_nifty_share * 100)}%</td>
                    <td className="py-2 pl-2 text-right font-mono hidden md:table-cell" style={{ color: 'var(--text-3)' }}>{row.scan_dates}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCardContent>
      <GlassCardFooter>
        {result?.scan_dates
          ? `${result.scan_dates} scan ${result.scan_dates === 1 ? 'date' : 'dates'}, about ${result.independent_periods} independent ${result.independent_periods === 1 ? 'period' : 'periods'}. `
          : ''}
        Bought at the next session's close and held for the full period, before costs. "Made money" is the share of individual stocks that rose.
      </GlassCardFooter>
    </GlassCard>
  )
}
