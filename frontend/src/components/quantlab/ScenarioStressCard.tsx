import React from 'react'
import { Warning } from '@phosphor-icons/react'
import type { ScenarioStressTest } from '../../types'
import { GlassCard, GlassCardHeader, GlassCardContent, GlassCardFooter } from '../common/shared'

interface ScenarioStressCardProps {
  scenarios: ScenarioStressTest[]
}

export const ScenarioStressCard: React.FC<ScenarioStressCardProps> = ({ scenarios }) => {
  if (!scenarios || scenarios.length === 0) return null

  return (
    <GlassCard>
      <GlassCardHeader
        icon={Warning}
        iconColor="var(--amber)"
        title="Macro Scenario Stress-Testing"
        badge={
          <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded" style={{ background: 'var(--brand-soft)', color: 'var(--brand-light)' }}>
            Historical Crises
          </span>
        }
      />
      <GlassCardContent className="p-5 overflow-x-auto scrollbar-none">
        <table className="w-full text-[11px]" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th className="typo-table-head py-2 pr-4 text-left">Shock Event</th>
              <th className="typo-table-head py-2 pr-4 text-left hidden sm:table-cell">Period</th>
              <th className="typo-table-head py-2 pr-4 text-right">Benchmark</th>
              <th className="typo-table-head py-2 pr-4 text-right">Simulated Portfolio</th>
              <th className="typo-table-head py-2 text-right">Factor Resilience</th>
            </tr>
          </thead>
          <tbody>
            {scenarios.map((s, idx) => (
              <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                <td className="py-2.5 pr-4 font-medium" style={{ color: 'var(--text)' }}>{s.event_name}</td>
                <td className="py-2.5 pr-4 hidden sm:table-cell text-[10px]" style={{ color: 'var(--text-3)' }}>{s.period}</td>
                <td className="py-2.5 pr-4 text-right font-mono font-medium text-[var(--red)]">{s.benchmark_shock_pct.toFixed(1)}%</td>
                <td
                  className="py-2.5 pr-4 text-right font-mono font-bold"
                  style={{ color: s.simulated_portfolio_pct > s.benchmark_shock_pct ? 'var(--green)' : 'var(--red)' }}
                >
                  {s.simulated_portfolio_pct.toFixed(1)}%
                </td>
                <td className="py-2.5 text-right font-medium text-[10px]" style={{ color: 'var(--brand-light)' }}>{s.factor_resilience}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </GlassCardContent>
      <GlassCardFooter className="typo-caption text-center px-4 pb-4 text-[var(--text-3)] border-none">
        Illustrative assumed shocks scaled by volatility and quality heuristics. These are not historical portfolio replays.
      </GlassCardFooter>
    </GlassCard>
  )
}
