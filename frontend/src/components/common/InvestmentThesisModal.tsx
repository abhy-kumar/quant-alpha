import React from 'react'
import { createPortal } from 'react-dom'
import type { DashboardData } from '../../types'
import { formatNum as num, scoreColor, getBadgeClass } from '../../utils/formatters'
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
    isMomentumLeader && `Strong 12M price momentum (+${((asset.Momentum_12M || 0) * 100).toFixed(1)}%) with high relative strength.`,
    isHighQuality && `Solid financial health with Piotroski F-Score of ${asset.Piotroski_F}/9 and earnings quality of ${asset.Earnings_Quality}/10.`,
    isValuationAttractive && `Attractive valuation metrics with Value Score of ${num(asset.Value_Score)}/10 relative to sector peers.`,
    asset.Sig_Supertrend === 1 && `Technical Supertrend signal is in a bullish trend.`,
    asset["ROCE_%"] != null && Number(asset["ROCE_%"]) > 15 && `High return on capital employed (ROCE: ${Number(asset["ROCE_%"]).toFixed(1)}%).`,
  ].filter(Boolean)

  const risks = [
    asset.Beta != null && asset.Beta > 1.2 && `High beta volatility (${asset.Beta.toFixed(2)}x Nifty 50).`,
    asset.Debt_to_Equity != null && asset.Debt_to_Equity > 1.5 && `High Debt/Equity ratio (${asset.Debt_to_Equity.toFixed(2)}x).`,
    asset['P/E'] != null && Number(asset['P/E']) > 45 && `High P/E valuation multiple (${num(asset['P/E'])}x).`,
    asset['Promoter_Pledging_%'] != null && Number(asset['Promoter_Pledging_%']) > 15 && `Promoter share pledging alert (${asset['Promoter_Pledging_%']}%).`,
    asset.Sig_RSI === -1 && `RSI > 70 indicates an overbought condition.`,
  ].filter(Boolean)

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-start justify-center p-3 sm:p-6 sm:pt-10 overflow-y-auto bg-black/80 backdrop-blur-md" onClick={onClose}>
      <div className="relative w-full max-w-3xl card p-5 sm:p-6 shadow-2xl rounded-2xl my-auto sm:my-0" style={{ background: 'var(--surface-3)', border: '1px solid var(--border-2)' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between pb-4 mb-4" style={{ borderBottom: '0.5px solid var(--glass-border)' }}>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl" style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}>
              <Lightning size={22} weight="duotone" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-xl font-bold" style={{ color: 'var(--text)' }}>{ticker}</h3>
                <span className={`badge rounded-full px-3 py-0.5 ${getBadgeClass(asset.Conviction)}`}>
                  Balanced: {asset.Conviction || 'Hold'}
                </span>
                {asset.Tactical_Conviction && (
                  <span className={`badge rounded-full px-2.5 py-0.5 text-[11px] ${getBadgeClass(asset.Tactical_Conviction)}`}>
                    ⚡ Tactical (1W-1M): {asset.Tactical_Conviction}
                  </span>
                )}
                {asset.Conviction_Long && (
                  <span className={`badge rounded-full px-2.5 py-0.5 text-[11px] ${getBadgeClass(asset.Conviction_Long)}`}>
                    🏛 Strategic (6M-2Y): {asset.Conviction_Long}
                  </span>
                )}
              </div>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                {asset.Long_Name || ticker} — {asset.Sector || 'Equities'} | CMP: <strong className="font-mono text-[var(--text)]">₹{num(asset.Price)}</strong>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full transition-colors hover:bg-white/10"
            style={{ color: 'var(--text-3)' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Forensic Red Flags or Clean Audit Status */}
        {asset.Red_Flags && asset.Red_Flags.length > 0 ? (
          <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5 text-xs text-amber-300">
            <Warning size={18} className="shrink-0 mt-0.5 text-amber-400" />
            <div>
              <div className="font-bold text-amber-300">Forensic Disqualifiers Flagged ({asset.Red_Flags.length})</div>
              <div className="mt-1 text-[11px] text-amber-200/90 flex flex-wrap gap-2">
                {asset.Red_Flags.map((flag, idx) => (
                  <span key={idx} className="px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-500/40">
                    {flag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="mb-4 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between text-xs text-emerald-300">
            <div className="flex items-center gap-2">
              <ShieldCheck size={18} weight="fill" className="text-emerald-400" />
              <span className="font-semibold text-emerald-200">Forensic & Governance Safety: Clean</span>
            </div>
            <span className="text-[10px] text-emerald-400/80">0 Pledging & Debt Disqualifiers</span>
          </div>
        )}

        {/* Hero Score Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
          <div className="p-3 card text-center">
            <span className="text-[10px] uppercase font-semibold tracking-wider text-[var(--text-3)]">Composite</span>
            <div className={`text-lg font-bold font-mono mt-1 ${scoreColor(asset.Composite_Score)}`}>
              {num(asset.Composite_Score)}
            </div>
          </div>
          <div className="p-3 card text-center">
            <span className="text-[10px] uppercase font-semibold tracking-wider text-[var(--text-3)]">Tactical (Tech)</span>
            <div className={`text-lg font-bold font-mono mt-1 ${scoreColor(asset.Tactical_Score || asset.Composite_Score_Tech)}`}>
              {num(asset.Tactical_Score || asset.Composite_Score_Tech)}
            </div>
          </div>
          <div className="p-3 card text-center">
            <span className="text-[10px] uppercase font-semibold tracking-wider text-[var(--text-3)]">Strategic (Fund)</span>
            <div className={`text-lg font-bold font-mono mt-1 ${scoreColor(asset.Composite_Score_Long || asset.Fund_Score)}`}>
              {num(asset.Composite_Score_Long || asset.Fund_Score)}
            </div>
          </div>
          <div className="p-3 card text-center">
            <span className="text-[10px] uppercase font-semibold tracking-wider text-[var(--text-3)]">F-Score</span>
            <div className="text-lg font-bold font-mono mt-1 text-[var(--text)]">
              {asset.Piotroski_F ?? '-'}/9
            </div>
          </div>
          <div className="p-3 card text-center">
            <span className="text-[10px] uppercase font-semibold tracking-wider text-[var(--brand)]">ML Alpha Prob</span>
            <div className="text-lg font-bold font-mono mt-1 text-[var(--brand)]">
              {asset.ML_Alpha_Prob != null ? `${asset.ML_Alpha_Prob}%` : 'N/A'}
            </div>
          </div>
        </div>

        {/* ATR Volatility Trade Setup */}
        {asset.ATR_Stop && (
          <div className="card p-3.5 mb-5 bg-[var(--surface-2)]">
            <div className="text-xs font-bold uppercase tracking-wider text-[var(--brand)] mb-2 flex items-center justify-between">
              <span>⚡ Volatility Execution Parameters (ATR-14)</span>
              <span className="text-[10px] text-[var(--text-3)] font-mono">ATR: ₹{num(asset.ATR_Value)}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div>
                <span className="text-[10px] text-[var(--text-3)]">Stop-Loss (2×ATR):</span>
                <div className="font-mono font-bold text-[var(--red)] text-sm">₹{num(asset.ATR_Stop)}</div>
              </div>
              <div>
                <span className="text-[10px] text-[var(--text-3)]">Target 1 (1:1.25):</span>
                <div className="font-mono font-bold text-[var(--green)] text-sm">₹{num(asset.ATR_Target1)}</div>
              </div>
              <div>
                <span className="text-[10px] text-[var(--text-3)]">Target 2 (Runner):</span>
                <div className="font-mono font-bold text-[var(--green)] text-sm">₹{num(asset.ATR_Target2)}</div>
              </div>
              <div>
                <span className="text-[10px] text-[var(--text-3)]">Chandelier Trail:</span>
                <div className="font-mono font-bold text-amber-400 text-sm">₹{num(asset.ATR_Chandelier)}</div>
              </div>
            </div>
          </div>
        )}

        {/* Catalysts & Risks */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
          {/* Bullish Catalysts */}
          <div className="card p-4">
            <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--green)] mb-3">
              <ShieldCheck size={16} weight="duotone" /> Bullish Catalysts
            </h4>
            {catalysts.length === 0 ? (
              <p className="text-xs text-[var(--text-3)]">No major bullish catalysts identified.</p>
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
          <div className="card p-4">
            <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--red)] mb-3">
              <Warning size={16} weight="duotone" /> Key Risks
            </h4>
            {risks.length === 0 ? (
              <p className="text-xs text-[var(--text-3)]">No elevated risk factors detected.</p>
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
          <div className="card p-4">
            <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--brand)] mb-3">
              <Scales size={16} weight="duotone" /> Sector Peers
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
    </div>,
    document.body
  )
}
