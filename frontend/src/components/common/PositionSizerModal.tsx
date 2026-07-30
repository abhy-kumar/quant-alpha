import React, { useState } from 'react'
import type { DashboardData } from '../../types'
import { formatNum as num } from '../../utils/formatters'
import { X, Calculator } from '@phosphor-icons/react'

interface PositionSizerModalProps {
  asset: DashboardData | null
  isOpen: boolean
  onClose: () => void
}

export const PositionSizerModal: React.FC<PositionSizerModalProps> = ({ asset, isOpen, onClose }) => {
  if (!isOpen || !asset) return null

  const ticker = asset.Ticker.replace('.NS', '')
  const price = Number(asset.Price) || 100

  const [accountCapital, setAccountCapital] = useState<number>(1000000) // ₹10,000,000 default
  const [maxRiskPct, setMaxRiskPct] = useState<number>(1.5) // 1.5% max risk per trade
  const [stopLossPct, setStopLossPct] = useState<number>(5.0) // 5.0% stop loss
  const [rewardRatio, setRewardRatio] = useState<number>(2.5) // 1:2.5 R:R target

  const maxRiskAmount = (accountCapital * maxRiskPct) / 100
  const stopLossPrice = price * (1 - stopLossPct / 100)
  const targetPrice = price * (1 + (stopLossPct * rewardRatio) / 100)
  const riskPerShare = price - stopLossPrice
  const recommendedShares = riskPerShare > 0 ? Math.floor(maxRiskAmount / riskPerShare) : 0
  const totalPositionValue = recommendedShares * price
  const positionPctOfAccount = accountCapital > 0 ? (totalPositionValue / accountCapital) * 100 : 0
  const expectedProfit = recommendedShares * (targetPrice - price)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto glass-strong p-6 shadow-2xl rounded-2xl">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 mb-4" style={{ borderBottom: '1px solid var(--glass-border)' }}>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl" style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}>
              <Calculator size={22} weight="duotone" />
            </div>
            <div>
              <h3 className="text-xl font-bold" style={{ color: 'var(--text)' }}>
                Position Sizer & Risk Management
              </h3>
              <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                {ticker} · Current Price: <strong className="font-mono text-[var(--text)]">₹{num(price)}</strong>
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
              Trailing Stop-Loss Threshold (%)
            </label>
            <input
              type="number"
              step="0.5"
              min="1"
              max="25"
              value={stopLossPct}
              onChange={e => setStopLossPct(Number(e.target.value))}
              className="glass-input w-full font-mono text-xs"
            />
          </div>

          <div>
            <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--text-2)' }}>
              Target Risk / Reward Ratio (1 : X)
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
          <div className="text-xs font-bold uppercase tracking-wider text-[var(--brand)] mb-2">
            Recommended Execution Plan
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 card">
              <span className="text-[10px] text-[var(--text-3)] uppercase font-semibold">Recommended Share Qty</span>
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

          <div className="grid grid-cols-3 gap-2 text-xs pt-2" style={{ borderTop: '1px solid var(--border)' }}>
            <div>
              <span className="text-[10px] text-[var(--text-3)]">Stop-Loss Price:</span>
              <div className="font-mono font-bold text-[var(--red)] text-sm">₹{num(stopLossPrice)}</div>
            </div>
            <div>
              <span className="text-[10px] text-[var(--text-3)]">Target Exit Price:</span>
              <div className="font-mono font-bold text-[var(--green)] text-sm">₹{num(targetPrice)}</div>
            </div>
            <div>
              <span className="text-[10px] text-[var(--text-3)]">Est. Profit at Target:</span>
              <div className="font-mono font-bold text-[var(--green)] text-sm">+₹{num(expectedProfit)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
