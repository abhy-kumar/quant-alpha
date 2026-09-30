import React, { useMemo } from 'react'
import { ModalShell } from './ModalShell'
import type { DashboardData } from '../../types'
import { FactorRadarChart, extractFactorDimensions } from './FactorRadarChart'
import { X, ChartLine, TrendUp, WarningOctagon, Info } from '@phosphor-icons/react'
import { getBadgeClass } from '../../utils/formatters'

interface Props {
  asset: DashboardData | null
  isOpen: boolean
  onClose: () => void
  peerGroup?: DashboardData[]
}

export const FactorRadarModal: React.FC<Props> = (props) => {
  if (!props.isOpen || !props.asset) return null
  return <FactorRadarModalContent {...props} asset={props.asset} key={props.asset.Ticker} />
}

const FactorRadarModalContent: React.FC<Omit<Props, 'asset'> & { asset: DashboardData }> = ({ asset, onClose, peerGroup = [] }) => {

  const ticker = asset.Ticker.replace('.NS', '')
  const factors = useMemo(() => extractFactorDimensions(asset), [asset])

  const sortedFactors = useMemo(() => {
    return [...factors].sort((a, b) => b.score - a.score)
  }, [factors])

  const strengths = sortedFactors.slice(0, 3)
  const weaknesses = sortedFactors.slice(-2).reverse()

  return (
    <ModalShell title="Factor profile" onClose={onClose} className="max-w-2xl p-5 sm:p-6" overlayClassName="">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 mb-4" style={{ borderBottom: '1px solid var(--glass-border)' }}>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl text-[var(--brand)]" style={{ background: 'var(--brand-soft)' }}>
              <ChartLine size={22} weight="regular" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>{ticker} factor profile</h3>
                <span className={`badge rounded-full px-2.5 py-0.5 text-xs ${getBadgeClass(asset.Conviction)}`}>
                  {asset.Conviction || 'Hold'}
                </span>
              </div>
              <p className="text-[12px]" style={{ color: 'var(--text-3)' }}>
                {factors.length} {asset.Ranking_Version ? 'ranking' : 'research'} factors for {asset.Sector || 'equities'}
              </p>
            </div>
          </div>
          <button type="button" aria-label="Close dialog" onClick={onClose} className="icon-button">
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
              <TrendUp size={15} weight="regular" />
              <span>Highest scores</span>
            </div>
            <div className="space-y-2 text-xs">
              {strengths.map(s => (
                <div key={s.key} className="flex items-center justify-between py-1 border-b border-[var(--glass-border)] last:border-0">
                  <div>
                    <span className="font-medium block" style={{ color: 'var(--text)' }}>{s.label}</span>
                    <span className="text-[12px]" style={{ color: 'var(--text-3)' }}>{s.academicRef}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-semibold text-[var(--green)]">{s.score.toFixed(1)}/10</span>
                    <span className="text-[12px] block" style={{ color: 'var(--text-2)' }}>{s.rawDesc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Vulnerabilities */}
          <div className="p-3.5 rounded-xl" style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
            <div className="flex items-center gap-1.5 mb-2 font-semibold text-xs text-[var(--red)]">
              <WarningOctagon size={15} weight="regular" />
              <span>Lowest scores</span>
            </div>
            <div className="space-y-2 text-xs">
              {weaknesses.map(w => (
                <div key={w.key} className="flex items-center justify-between py-1 border-b border-[var(--glass-border)] last:border-0">
                  <div>
                    <span className="font-medium block" style={{ color: 'var(--text)' }}>{w.label}</span>
                    <span className="text-[12px]" style={{ color: 'var(--text-3)' }}>{w.academicRef}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-semibold text-[var(--red)]">{w.score.toFixed(1)}/10</span>
                    <span className="text-[12px] block" style={{ color: 'var(--text-2)' }}>{w.rawDesc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Note */}
        <div className="flex items-center gap-2 p-2.5 rounded-xl text-[12px]" style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}>
          <Info size={14} className="shrink-0 text-[var(--brand)]" />
          <span>Scores range from 0 to 10. Accounting factors use sector or accounting peers; price factors use the screened equity universe. Missing inputs receive a neutral score and reduce data coverage.</span>
        </div>
    </ModalShell>
  )
}
