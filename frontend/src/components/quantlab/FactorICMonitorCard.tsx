import React from 'react'
import { BookOpen } from '@phosphor-icons/react'
import type { FactorICMetric } from '../../types'
import { GlassCard, GlassCardHeader, GlassCardContent, GlassCardFooter } from '../common/shared'

interface FactorICMonitorCardProps {
  factorIcs: FactorICMetric[]
}

export const FactorICMonitorCard: React.FC<FactorICMonitorCardProps> = ({ factorIcs }) => {
  if (!factorIcs || factorIcs.length === 0) return null

  return (
    <GlassCard>
      <GlassCardHeader
        icon={BookOpen}
        iconColor="var(--brand)"
        title="Factor IC Efficacy Monitor"
        badge={
          <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded" style={{ background: 'var(--brand-soft)', color: 'var(--brand-light)' }}>
            Rolling 3M
          </span>
        }
      />
      <GlassCardContent className="p-5 space-y-3">
        {factorIcs.map((f) => (
          <div key={f.factor} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium" style={{ color: 'var(--text)' }}>{f.factor}</span>
              <span className="font-mono text-[11px]" style={{ color: f.ic_current >= 0.10 ? 'var(--green)' : 'var(--text-2)' }}>
                IC: +{f.ic_current.toFixed(3)} (t={f.t_stat.toFixed(1)})
              </span>
            </div>
            <div className="h-1.5 rounded-full w-full overflow-hidden" style={{ background: 'var(--border)' }}>
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, Math.max(10, f.ic_current * 400))}%`,
                  background: f.ic_current >= 0.10 ? 'var(--green)' : 'var(--brand)',
                }}
              />
            </div>
          </div>
        ))}
      </GlassCardContent>
      <GlassCardFooter className="typo-caption text-center px-4 pb-4 text-[var(--text-3)] border-none">
        Spearman rank Information Coefficient: corr(Factor_t, Return_t+21d). IC &gt; 0.05 indicates statistical predictive power.
      </GlassCardFooter>
    </GlassCard>
  )
}
