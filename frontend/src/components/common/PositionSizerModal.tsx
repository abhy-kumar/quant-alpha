import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { DashboardData } from '../../types'
import { formatNum as num } from '../../utils/formatters'
import { X, Calculator, Lightning, WarningOctagon } from '@phosphor-icons/react'

interface PositionSizerModalProps {
  asset: DashboardData | null
  isOpen: boolean
  onClose: () => void
}

export const PositionSizerModal: React.FC<PositionSizerModalProps> = ({ asset, isOpen, onClose }) => {
  if (!isOpen || !asset) return null

  const ticker = asset.Ticker.replace('.NS', '')
  const price = Number(asset.Price) || 100
  const atr = Number(asset.ATR_Value) || (price * 0.025)
  const atrStopPct = asset.ATR_Risk_Pct || ((2.0 * atr) / price) * 100

  const [useAtrMode, setUseAtrMode] = useState<boolean>(true)
  const [accountCapital, setAccountCapital] = useState<number>(1000000) // ₹10,00,000 default
  const [maxRiskPct, setMaxRiskPct] = useState<number>(1.5) // 1.5% max risk per trade
  const [stopLossPct, setStopLossPct] = useState<number>(Number(atrStopPct.toFixed(2)))
  const [rewardRatio, setRewardRatio] = useState<number>(2.5) // 1:2.5 R:R target

  useEffect(() => {
    if (useAtrMode) {
      setStopLossPct(Number(atrStopPct.toFixed(2)))
      setRewardRatio(2.5)
    }
  }, [useAtrMode, atrStopPct])

  const maxRiskAmount = (accountCapital * maxRiskPct) / 100
  const stopLossPrice = asset.ATR_Stop && useAtrMode ? asset.ATR_Stop : Math.max(0.01, price * (1 - stopLossPct / 100))
  const target1Price = asset.ATR_Target1 && useAtrMode ? asset.ATR_Target1 : price * (1 + (stopLossPct * 1.25) / 100)
  const target2Price = asset.ATR_Target2 && useAtrMode ? asset.ATR_Target2 : price * (1 + (stopLossPct * rewardRatio) / 100)
  const chandelierPrice = asset.ATR_Chandelier || (price - 3.0 * atr)

  const riskPerShare = Math.max(0.01, price - stopLossPrice)
  const recommendedShares = riskPerShare > 0 ? Math.floor(maxRiskAmount / riskPerShare) : 0
  const totalPositionValue = recommendedShares * price
  const positionPctOfAccount = accountCapital > 0 ? (totalPositionValue / accountCapital) * 100 : 0
  const expectedProfitT1 = recommendedShares * 0.5 * (target1Price - price)
  const expectedProfitT2 = recommendedShares * 0.5 * (target2Price - price)
  const totalExpectedProfit = expectedProfitT1 + expectedProfitT2

  const redFlags = asset.Red_Flags || []

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-start justify-center p-3 sm:p-6 sm:pt-10 overflow-y-auto bg-black/80 backdrop-blur-md" onClick={onClose}>
      <div className="relative w-full max-w-xl card p-5 sm:p-6 shadow-2xl rounded-2xl my-auto sm:my-0" style={{ background: 'var(--surface-3)', border: '1px solid var(--border-2)' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between pb-4 mb-4" style={{ borderBottom: '1px solid var(--glass-border)' }}>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl" style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}>
              <Calculator size={22} weight="duotone" />
            </div>
            <div>
              <h3 className="text-xl font-bold" style={{ color: 'var(--text)' }}>
                Position Sizer & Volatility Execution
              </h3>
              <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                {ticker} — CMP: <strong className="font-mono text-[var(--text)]">₹{num(price)}</strong> | ATR(14): <strong className="font-mono text-[var(--brand)]">₹{num(atr)}</strong>
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

        {/* Red Flags Alert if applicable */}
        {redFlags.length > 0 && (
          <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5 text-xs text-amber-300">
            <WarningOctagon size={20} className="shrink-0 mt-0.5 text-amber-400" />
            <div>
              <div className="font-bold text-amber-300">Forensic Disqualifiers Flagged ({redFlags.length})</div>
              <ul className="list-disc list-inside mt-1 text-[11px] text-amber-200/90 space-y-0.5">
                {redFlags.map((flag, idx) => (
                  <li key={idx}>{flag}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Mode Toggle */}
        <div className="flex items-center justify-between p-2.5 mb-4 rounded-xl bg-[var(--surface-2)] border border-[var(--border)]">
          <div className="flex items-center gap-2">
            <Lightning size={18} weight="fill" className={useAtrMode ? "text-[var(--brand)]" : "text-[var(--text-3)]"} />
            <span className="text-xs font-semibold text-[var(--text)]">
              {useAtrMode ? 'ATR Volatility-Adjusted Mode (Recommended)' : 'Fixed Percentage Mode'}
            </span>
          </div>
          <button
            onClick={() => setUseAtrMode(!useAtrMode)}
            className="px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-all"
            style={{
              background: useAtrMode ? 'var(--brand-soft)' : 'var(--surface-3)',
              color: useAtrMode ? 'var(--brand)' : 'var(--text-3)',
              border: '1px solid var(--border)'
            }}
          >
            {useAtrMode ? 'Switch to Manual' : 'Use Auto ATR'}
          </button>
        </div>

        {/* Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
          <div>
            <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--text-2)' }}>
              Total Portfolio Capital (₹)
            </label>
            <input
              type="number"
              value={accountCapital}
              onChange={e => setAccountCapital(Math.max(1000, Number(e.target.value)))}
              className="glass-input w-full font-mono text-xs"
            />
          </div>

          <div>
            <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--text-2)' }}>
              Max Capital Risk per Trade (%)
            </label>
            <input
              type="number"
              step="0.1"
              min="0.1"
              max="10"
              value={maxRiskPct}
              onChange={e => setMaxRiskPct(Number(e.target.value))}
              className="glass-input w-full font-mono text-xs"
            />
          </div>

          <div>
            <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--text-2)' }}>
              Stop-Loss Risk ({useAtrMode ? '2.0 × ATR' : '%'})
            </label>
            <input
              type="number"
              step="0.1"
              min="0.5"
              max="35"
              disabled={useAtrMode}
              value={stopLossPct}
              onChange={e => setStopLossPct(Number(e.target.value))}
              className={`glass-input w-full font-mono text-xs ${useAtrMode ? 'opacity-70 cursor-not-allowed' : ''}`}
            />
          </div>

          <div>
            <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--text-2)' }}>
              Target Runner Risk/Reward (1 : X)
            </label>
            <input
              type="number"
              step="0.1"
              min="1"
              max="10"
              value={rewardRatio}
              onChange={e => setRewardRatio(Number(e.target.value))}
              className="glass-input w-full font-mono text-xs"
            />
          </div>
        </div>

        {/* Output Calculation Breakdown */}
        <div className="card p-4 space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-[var(--brand)] mb-1 flex items-center justify-between">
            <span>Optimal Trade Execution</span>
            <span className="text-[10px] text-[var(--green)] font-mono">Est. Profit: +₹{num(totalExpectedProfit)} (Risk: ₹{num(maxRiskAmount)})</span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 card">
              <span className="text-[10px] text-[var(--text-3)] uppercase font-semibold">Calculated Shares</span>
              <div className="text-xl font-bold font-mono text-[var(--brand)] mt-1">
                {recommendedShares.toLocaleString('en-IN')} <span className="text-xs font-normal">shares</span>
              </div>
            </div>

            <div className="p-3 card">
              <span className="text-[10px] text-[var(--text-3)] uppercase font-semibold">Total Allocation</span>
              <div className="text-xl font-bold font-mono text-[var(--text)] mt-1">
                ₹{num(totalPositionValue)} <span className="text-xs font-normal text-[var(--text-3)]">({positionPctOfAccount.toFixed(1)}%)</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-2" style={{ borderTop: '1px solid var(--border)' }}>
            <div>
              <span className="text-[10px] text-[var(--text-3)]">Stop-Loss (2×ATR):</span>
              <div className="font-mono font-bold text-[var(--red)] text-sm">₹{num(stopLossPrice)}</div>
              <span className="text-[9px] text-[var(--text-3)]">(-{stopLossPct.toFixed(1)}%)</span>
            </div>
            <div>
              <span className="text-[10px] text-[var(--text-3)]">Target 1 (50% trim):</span>
              <div className="font-mono font-bold text-[var(--green)] text-sm">₹{num(target1Price)}</div>
              <span className="text-[9px] text-[var(--text-3)]">(+{((target1Price/price - 1)*100).toFixed(1)}%)</span>
            </div>
            <div>
              <span className="text-[10px] text-[var(--text-3)]">Target 2 (Runner):</span>
              <div className="font-mono font-bold text-[var(--green)] text-sm">₹{num(target2Price)}</div>
              <span className="text-[9px] text-[var(--text-3)]">(+{((target2Price/price - 1)*100).toFixed(1)}%)</span>
            </div>
            <div>
              <span className="text-[10px] text-[var(--text-3)]">Chandelier Trailing:</span>
              <div className="font-mono font-bold text-amber-400 text-sm">₹{num(chandelierPrice)}</div>
              <span className="text-[9px] text-[var(--text-3)]">(-3×ATR Trail)</span>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

