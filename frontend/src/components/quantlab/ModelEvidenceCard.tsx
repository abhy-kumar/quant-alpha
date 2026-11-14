import React, { useMemo, useState } from 'react'
import { Scales } from '@phosphor-icons/react'
import type { FactorResearch, FactorEvidence } from '../../types'
import { GlassCard, GlassCardHeader, GlassCardContent, GlassCardFooter } from '../common/shared'

const percent = (value?: number | null, digits = 1) =>
  value == null ? 'N/A' : `${value >= 0 ? '+' : '−'}${Math.abs(value * 100).toFixed(digits)}%`

const VERDICT_STYLE: Record<string, { background: string; color: string }> = {
  Supported: { background: 'var(--green-bg)', color: 'var(--green)' },
  Promising: { background: 'var(--blue-bg)', color: 'var(--blue)' },
  Unstable: { background: 'var(--amber-bg)', color: 'var(--amber)' },
}

function Row({ factor, scale }: { factor: FactorEvidence; scale: number }) {
  const stats = factor.h21
  const ic = stats?.ic ?? 0
  const width = Math.min(50, (Math.abs(ic) / scale) * 50)
  const style = VERDICT_STYLE[factor.verdict.replace(' (reversed)', '')] ?? { background: 'var(--surface-2)', color: 'var(--text-2)' }
  return (
    <tr>
      <td className="py-2 pr-3">
        <div className="font-medium" style={{ color: 'var(--text)' }}>{factor.label}</div>
        <div className="typo-caption">{factor.meaning}</div>
      </td>
      <td className="py-2 px-2 hidden sm:table-cell" style={{ width: 150 }}>
        <div className="relative h-1.5 rounded-full" style={{ background: 'var(--border)' }} aria-hidden="true">
          <div className="absolute top-0 bottom-0 rounded-full" style={{
            left: ic >= 0 ? '50%' : `${50 - width}%`, width: `${width}%`,
            background: ic >= 0 ? 'var(--green)' : 'var(--red)' }} />
          <div className="absolute top-[-2px] bottom-[-2px] left-1/2 w-px" style={{ background: 'var(--border-2)' }} />
        </div>
      </td>
      <td className="py-2 px-2 text-right font-mono whitespace-nowrap">{stats ? `${ic >= 0 ? '+' : '−'}${Math.abs(ic).toFixed(3)}` : 'N/A'}</td>
      <td className="py-2 px-2 text-right font-mono hidden md:table-cell">{stats?.t != null ? stats.t.toFixed(1) : 'N/A'}</td>
      <td className="py-2 pl-2 text-right">
        <span className="badge" style={style}>{factor.verdict}</span>
      </td>
    </tr>
  )
}

export const ModelEvidenceCard: React.FC<{ research?: FactorResearch | null }> = ({ research }) => {
  const [showCandidates, setShowCandidates] = useState(false)
  const { inModel, candidates, scale } = useMemo(() => {
    const factors = research?.factors ?? []
    const strength = (factor: FactorEvidence) => Math.abs(factor.h21?.t ?? 0)
    return {
      inModel: factors.filter(factor => factor.in_model),
      candidates: factors.filter(factor => !factor.in_model).sort((a, b) => strength(b) - strength(a)),
      scale: Math.max(0.1, ...factors.map(factor => Math.abs(factor.h21?.ic ?? 0))),
    }
  }, [research])
  if (!research?.factors?.length) return null

  const model = research.model?.short
  const basket = model?.top20
  const passing = candidates.filter(factor => factor.adds_to_model?.passes)
  const guard = Object.values(research.regime ?? {}).find(entry => (entry.t ?? 0) >= 2)

  return (
    <GlassCard>
      <GlassCardHeader
        icon={Scales}
        title="Model Evidence"
        tooltipId="quant.evidence"
        subtitle={`${research.span.years} years of prices to ${research.span.end} · about ${research.universe.median_eligible} stocks a day · ${research.source}`}
      />
      <GlassCardContent className="p-5 space-y-5">
        {basket && <p className="typo-caption">The model's short-term price score, replayed on past prices: buy the 20 highest-ranked stocks each month, after costs.</p>}
        {basket && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              ['Top 20, per month', percent(basket.mean_net_return), `NIFTY ${percent(basket.mean_nifty)}`],
              ['Months that beat NIFTY', `${Math.round(basket.beat_nifty_share * 100)}%`, `${basket.periods} separate months`],
              ['Months with a gain', `${Math.round(basket.positive_share * 100)}%`, `Worst month ${percent(basket.worst_period)}`],
              ['Rank correlation', model?.ic != null ? `+${model.ic.toFixed(3)}`.replace('+-', '−') : 'N/A', `t = ${model?.t?.toFixed(1) ?? 'N/A'}`],
            ].map(([label, value, note]) => (
              <div key={label} className="rounded-[var(--radius)] p-3" style={{ background: 'var(--surface-2)' }}>
                <div className="typo-caption">{label}</div>
                <div className="typo-h2 font-mono mt-0.5">{value}</div>
                <div className="typo-caption mt-0.5">{note}</div>
              </div>
            ))}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left">
                <th className="pb-2 pr-3">{showCandidates ? 'Candidate factor' : 'Factor used by the model'}</th>
                <th className="pb-2 px-2 hidden sm:table-cell" aria-label="Strength" />
                <th className="pb-2 px-2 text-right whitespace-nowrap">Rank corr.</th>
                <th className="pb-2 px-2 text-right hidden md:table-cell">t</th>
                <th className="pb-2 pl-2 text-right">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {(showCandidates ? candidates : inModel).map(factor => <Row key={factor.id} factor={factor} scale={scale} />)}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="typo-caption max-w-[62ch]">
            {passing.length
              ? `${passing.map(factor => factor.label).join(', ')} improved the model's ranking in both halves of the history and ${passing.length === 1 ? 'is a candidate' : 'are candidates'} for the next model version.`
              : `None of the ${candidates.length} candidate factors improved the model's ranking reliably, so none has been added.`}
            {' '}
            {guard
              ? `Picks did better when: ${guard.label.toLowerCase()}.`
              : 'No market-condition rule reliably improved results in this history.'}
          </p>
          <button type="button" className="btn-secondary" aria-pressed={showCandidates} onClick={() => setShowCandidates(value => !value)}>
            {showCandidates ? 'Show model factors' : `Show ${candidates.length} candidates`}
          </button>
        </div>
      </GlassCardContent>
      <GlassCardFooter>
        Rank correlation with the next 21 sessions' return over NIFTY, entering at the next close. Supported needs t of 3 or more,
        the same sign in both halves and at 63 sessions. {research.caveats?.[0]} Fundamentals are not tested yet.
      </GlassCardFooter>
    </GlassCard>
  )
}
