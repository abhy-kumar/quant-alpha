import React from 'react'
import { ArrowsDownUp } from '@phosphor-icons/react'
import type { RatingChanges, RatingChange } from '../../types'
import { GlassCard, GlassCardHeader, GlassCardContent } from '../common/shared'
import { getBadgeClass } from '../../utils/formatters'

function List({ title, items, total, onSelect }: { title: string; items: RatingChange[]; total: number; onSelect: (ticker: string) => void }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <h4 className="typo-h3">{title}</h4>
        <span className="typo-caption">{total}</span>
      </div>
      {items.length === 0 ? <p className="typo-caption">None.</p> : (
        <ul className="space-y-1.5">
          {items.slice(0, 10).map(item => (
            <li key={item.ticker} className="flex items-center justify-between gap-2 text-[13px]">
              <button type="button" className="ticker-link font-semibold" onClick={() => onSelect(item.ticker)}>{item.ticker.replace('.NS', '')}</button>
              <span className="flex items-center gap-1.5 whitespace-nowrap">
                <span style={{ color: 'var(--text-3)' }}>{item.from}</span>
                <span aria-hidden="true" style={{ color: 'var(--text-3)' }}>→</span>
                <span className={`badge ${getBadgeClass(item.to)}`}>{item.to}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {total > 10 && <p className="typo-caption mt-2">and {total - 10} more</p>}
    </div>
  )
}

export const RatingChangesCard: React.FC<{ changes?: RatingChanges | null; onSelect: (ticker: string) => void }> = ({ changes, onSelect }) => {
  if (!changes) return null
  return (
    <GlassCard>
      <GlassCardHeader icon={ArrowsDownUp} title="Rating Changes" tooltipId="quant.changes"
        subtitle={`${changes.date} compared with ${changes.compared_with}`} />
      <GlassCardContent className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
        <List title="Upgrades" items={changes.upgrades} total={changes.upgrade_count} onSelect={onSelect} />
        <List title="Downgrades" items={changes.downgrades} total={changes.downgrade_count} onSelect={onSelect} />
      </GlassCardContent>
    </GlassCard>
  )
}
