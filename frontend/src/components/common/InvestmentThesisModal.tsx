import React from 'react'
import type { DashboardData } from '../../types'
import { formatNum as num, colorCode, scoreColor, getBadgeClass } from '../../utils/formatters'
import { X, Lightning, ShieldCheck, Warning, Scales } from '@phosphor-icons/react'

interface InvestmentThesisModalProps {
  asset: DashboardData | null
  isOpen: boolean
  onClose: () => void
  peerGroup?: DashboardData[]
}

export const InvestmentThesisModal: React.FC<InvestmentThesisModalProps> = ({
  asset,
  isOpen,
  onClose,
  peerGroup = [],
}) => {
  if (!isOpen || !asset) return null

  const ticker = asset.Ticker.replace('.NS', '')
  const isHighQuality = (asset.Piotroski_F || 0) >= 6 && (asset.Earnings_Quality || 0) >= 5
  const isMomentumLeader = (asset.Momentum_12M || 0) > 0.15
  const isValuationAttractive = (asset.Value_Score || 0) >= 5.5

  const catalysts = [
    isMomentumLeader && `Strong 12M price momentum (+${((asset.Momentum_12M || 0) * 100).toFixed(1)}%) supported by institutional volume inflows.`,
    isHighQuality && `Robust financial health with Piotroski F-Score of ${asset.Piotroski_F}/9 and high earnings quality (${asset.Earnings_Quality}/10).`,
    isValuationAttractive && `Attractive valuation metrics with Value Score of ${num(asset.Value_Score)}/10 vs sector peers.`,
    asset.Sig_Supertrend === 1 && `Technical Supertrend signal remains in a confirmed bullish posture.`,
    asset["ROCE_%"] != null && Number(asset["ROCE_%"]) > 15 && `High return on capital employed (ROCE: ${Number(asset["ROCE_%"]).toFixed(1)}%).`,
  ].filter(Boolean)

  const risks = [
    asset.Beta != null && asset.Beta > 1.2 && `High beta volatility (${asset.Beta.toFixed(2)}x Nifty 50).`,
    asset.Debt_to_Equity != null && asset.Debt_to_Equity > 1.5 && `Elevated financial leverage (Debt/Equity: ${asset.Debt_to_Equity.toFixed(2)}x).`,
    asset['P/E'] != null && Number(asset['P/E']) > 45 && `High P/E valuation multiple (${num(asset['P/E'])}x).`,
    asset['Promoter_Pledging_%'] != null && Number(asset['Promoter_Pledging_%']) > 15 && `Promoter share pledging alert (${asset['Promoter_Pledging_%']}%).`,
    asset.Sig_RSI === -1 && `Overbought RSI technical reading cautioning potential near-term consolidation.`,
  ].filter(Boolean)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in">
      <div
        className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto card p-6 shadow-2xl"
        style={{ background: 'var(--surface-3)', borderRadius: 'var(--radius-xl)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 mb-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl" style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}>
              <Lightning size={22} weight="duotone" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-bold" style={{ color: 'var(--text)' }}>{ticker}</h3>
                <span className={`badge ${getBadgeClass(asset.Conviction)}`}>{asset.Conviction || 'Hold'}</span>
              </div>
              <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                {asset.Long_Name || ticker} · {asset.Sector || 'Equities'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl transition-colors hover:bg-white/10"
            style={{ color: 'var(--text-3)' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Hero Score Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <div className="p-3 card text-center" style={{ background: 'var(--surface)', borderRadius: 'var(--radius)' }}>
            <span className="text-[10px] uppercase font-semibold tracking-wider text-[var(--text-3)]">Composite Rank</span>
            <div className={`text-lg font-bold font-mono mt-1 ${scoreColor(asset.Composite_Score)}`}>
              {num(asset.Composite_Score)}
            </div>
          </div>
          <div className="p-3 card text-center" style={{ background: 'var(--surface)', borderRadius: 'var(--radius)' }}>
            <span className="text-[10px] uppercase font-semibold tracking-wider text-[var(--text-3)]">Technical</span>
            <div className={`text-lg font-bold font-mono mt-1 ${colorCode(asset.Tech_Score)}`}>
              {num(asset.Tech_Score)}
            </div>
          </div>
          <div className="p-3 card text-center" style={{ background: 'var(--surface)', borderRadius: 'var(--radius)' }}>
            <span className="text-[10px] uppercase font-semibold tracking-wider text-[var(--text-3)]">Fundamental</span>
            <div className="text-lg font-bold font-mono mt-1 text-[var(--text)]">
              {num(asset.Fund_Score)}
            </div>
          </div>
          <div className="p-3 card text-center" style={{ background: 'var(--surface)', borderRadius: 'var(--radius)' }}>
            <span className="text-[10px] uppercase font-semibold tracking-wider text-[var(--text-3)]">F-Score</span>
            <div className="text-lg font-bold font-mono mt-1 text-[var(--text)]">
              {asset.Piotroski_F ?? '-'}/9
            </div>
          </div>
        </div>

        {/* Catalysts & Risks */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
          {/* Bullish Catalysts */}
          <div className="card p-4" style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)' }}>
            <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--green)] mb-3">
              <ShieldCheck size={16} weight="duotone" /> Key Bullish Catalysts
            </h4>
            {catalysts.length === 0 ? (
              <p className="text-xs text-[var(--text-3)]">Standard baseline factor profile without major outlier catalysts.</p>
            ) : (
              <ul className="space-y-2 text-xs text-[var(--text-2)]">
                {catalysts.map((cat, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-[var(--green)] font-bold">✓</span>
                    <span>{cat}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Key Risks */}
          <div className="card p-4" style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)' }}>
            <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--red)] mb-3">
              <Warning size={16} weight="duotone" /> Operational & Market Risks
            </h4>
            {risks.length === 0 ? (
              <p className="text-xs text-[var(--text-3)]">Low risk profile with conservative leverage and stable factor scores.</p>
            ) : (
              <ul className="space-y-2 text-xs text-[var(--text-2)]">
                {risks.map((r, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-[var(--red)] font-bold">⚠</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Peer Relative Valuation */}
        {peerGroup.length > 0 && (
          <div className="card p-4" style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)' }}>
            <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--brand)] mb-3">
              <Scales size={16} weight="duotone" /> Sector Peer Benchmark Matrix
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th className="py-2 px-2 text-[var(--text-3)]">Ticker</th>
                    <th className="py-2 px-2 text-right text-[var(--text-3)]">Score</th>
                    <th className="py-2 px-2 text-right text-[var(--text-3)]">P/E</th>
                    <th className="py-2 px-2 text-right text-[var(--text-3)]">ROE</th>
                    <th className="py-2 px-2 text-right text-[var(--text-3)]">Mkt Cap</th>
                  </tr>
                </thead>
                <tbody>
                  {peerGroup.map(peer => (
                    <tr
                      key={peer.Ticker}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        background: peer.Ticker === asset.Ticker ? 'var(--brand-soft)' : 'transparent',
                        fontWeight: peer.Ticker === asset.Ticker ? 600 : 400,
                      }}
                    >
                      <td className="py-2 px-2 text-[var(--text)]">{peer.Ticker.replace('.NS', '')}</td>
                      <td className={`py-2 px-2 text-right font-mono ${scoreColor(peer.Composite_Score)}`}>{num(peer.Composite_Score)}</td>
                      <td className="py-2 px-2 text-right font-mono text-[var(--text-2)]">{num(peer['P/E'])}</td>
                      <td className="py-2 px-2 text-right font-mono text-[var(--text-2)]">{peer['ROE_%'] != null ? `${peer['ROE_%'].toFixed(1)}%` : '-'}</td>
                      <td className="py-2 px-2 text-right font-mono text-[var(--text-2)]">{peer.Market_Cap_B != null ? `₹${peer.Market_Cap_B}B` : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
