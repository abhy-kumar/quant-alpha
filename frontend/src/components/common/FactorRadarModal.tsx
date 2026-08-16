import React, { useMemo } from 'react'
import type { DashboardData } from '../../types'
import { FactorRadarChart, extractFactorDimensions } from './FactorRadarChart'
import { X, Sparkle, TrendUp, WarningOctagon, Info } from '@phosphor-icons/react'
import { getBadgeClass } from '../../utils/formatters'

interface Props {
  asset: DashboardData | null
  isOpen: boolean
  onClose: () => void
  peerGroup?: DashboardData[]
}

export const FactorRadarModal: React.FC<Props> = ({ asset, isOpen, onClose, peerGroup = [] }) => {
  if (!isOpen || !asset) return null

  const ticker = asset.Ticker.replace('.NS', '')
  const factors = useMemo(() => extractFactorDimensions(asset), [asset])

  const sortedFactors = useMemo(() => {
    return [...factors].sort((a, b) => b.score - a.score)
  }, [factors])

  const strengths = sortedFactors.slice(0, 3)
  const weaknesses = sortedFactors.slice(-2).reverse()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in" onClick={onClose}>
      <div className="relative w-full max-w-2xl max-h-[92vh] overflow-y-auto card p-6 shadow-2xl rounded-2xl animate-scale-up" style={{ background: 'var(--surface-3)', border: '1px solid var(--border-2)' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between pb-3 mb-4" style={{ borderBottom: '0.5px solid var(--glass-border)' }}>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl text-[var(--brand)]" style={{ background: 'var(--brand-soft)' }}>
              <Sparkle size={22} weight="duotone" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold" style={{ color: 'var(--text)' }}>{ticker} Factor DNA Radar</h3>
                <span className={`badge rounded-full px-2.5 py-0.5 text-xs ${getBadgeClass(asset.Conviction)}`}>
                  {asset.Conviction || 'Hold'}
                </span>
              </div>
              <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                10-Dimension Academic Factor Decomposition • {asset.Sector || 'Equities'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 text-[var(--text-3)] transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Radar Visualizer */}
        <div className="p-4 rounded-2xl mb-4 flex justify-center" style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
          <FactorRadarChart asset={asset} peerGroup={peerGroup} size={340} />
        </div>

        {/* Factor Insights Grid: Strengths & Weaknesses */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          {/* Strengths */}
          <div className="p-3.5 rounded-xl" style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
            <div className="flex items-center gap-1.5 mb-2 font-semibold text-xs text-[var(--green)]">
              <TrendUp size={15} weight="bold" />
              <span>Primary Factor Strengths</span>
            </div>
            <div className="space-y-2 text-xs">
              {strengths.map(s => (
                <div key={s.key} className="flex items-center justify-between py-1 border-b border-[var(--glass-border)] last:border-0">
                  <div>
                    <span className="font-medium block" style={{ color: 'var(--text)' }}>{s.label}</span>
                    <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>{s.academicRef}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-bold text-[var(--green)]">{s.score.toFixed(1)}/10</span>
                    <span className="text-[10px] block" style={{ color: 'var(--text-2)' }}>{s.rawDesc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Vulnerabilities */}
          <div className="p-3.5 rounded-xl" style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
            <div className="flex items-center gap-1.5 mb-2 font-semibold text-xs text-[var(--red)]">
              <WarningOctagon size={15} weight="bold" />
              <span>Factor Vulnerabilities</span>
            </div>
            <div className="space-y-2 text-xs">
              {weaknesses.map(w => (
                <div key={w.key} className="flex items-center justify-between py-1 border-b border-[var(--glass-border)] last:border-0">
                  <div>
                    <span className="font-medium block" style={{ color: 'var(--text)' }}>{w.label}</span>
                    <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>{w.academicRef}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-bold text-[var(--red)]">{w.score.toFixed(1)}/10</span>
                    <span className="text-[10px] block" style={{ color: 'var(--text-2)' }}>{w.rawDesc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Note */}
        <div className="flex items-center gap-2 p-2.5 rounded-xl text-[10.5px]" style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}>
          <Info size={14} className="shrink-0 text-[var(--brand)]" />
          <span>Factor scores are cross-sectionally ranked (0 to 10) against 150 top NSE liquid equities using point-in-time financial and market data.</span>
        </div>
      </div>
    </div>
  )
}
