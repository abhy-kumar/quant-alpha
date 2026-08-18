/**
 * StrategyBuilderDrawer.tsx
 * Interactive Strategy Rule Builder control panel.
 * Allows users to customize multi-factor rules, risk parameters, and presets.
 */

import React from 'react'
import type { StrategyRuleConfig } from '../../types'
import { STRATEGY_PRESETS } from '../../utils/strategyEngine'
import { GlassCard, GlassCardHeader, GlassCardContent } from '../common/shared'
import { Sliders, Lightning, ShieldCheck, ChartLineUp, ArrowClockwise } from '@phosphor-icons/react'

interface Props {
  config: StrategyRuleConfig
  onChange: (newConfig: StrategyRuleConfig) => void
  activePreset: string | null
  onSelectPreset: (presetKey: string) => void
  matchingCount: number
  totalUniverseCount: number
}

export const StrategyBuilderDrawer: React.FC<Props> = ({
  config,
  onChange,
  activePreset,
  onSelectPreset,
  matchingCount,
  totalUniverseCount,
}) => {
  const handleReset = () => {
    onSelectPreset('momentum')
  }

  return (
    <div className="space-y-4">
      {/* Presets Selector Header */}
      <GlassCard>
        <GlassCardHeader
          icon={Lightning}
          iconColor="var(--brand)"
          title="Strategy Presets"
          badge={
            <button
              onClick={handleReset}
              className="btn btn-secondary text-[11px] px-2 py-0.5 flex items-center gap-1"
              title="Reset to default preset"
            >
              <ArrowClockwise size={12} />
              <span>Reset</span>
            </button>
          }
        />
        <GlassCardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
            {Object.entries(STRATEGY_PRESETS).map(([key, preset]) => {
              const isSelected = activePreset === key
              return (
                <button
                  key={key}
                  onClick={() => onSelectPreset(key)}
                  className={`p-3 rounded-lg text-left transition-all border ${
                    isSelected
                      ? 'border-[var(--brand)] bg-[var(--brand-soft)] shadow-sm'
                      : 'border-[var(--border)] hover:border-[var(--border-strong)] bg-[var(--surface-2)]'
                  }`}
                >
                  <p className="text-xs font-semibold" style={{ color: isSelected ? 'var(--brand)' : 'var(--text)' }}>
                    {preset.name}
                  </p>
                  <p className="text-[10px] mt-1 line-clamp-2" style={{ color: 'var(--text-3)' }}>
                    {preset.description}
                  </p>
                </button>
              )
            })}
          </div>

          {/* Universe Candidate Meter */}
          <div className="flex items-center justify-between pt-2 border-t border-[var(--border)] text-xs">
            <span style={{ color: 'var(--text-2)' }}>Filtered Universe Candidates:</span>
            <span className="font-mono font-bold" style={{ color: matchingCount >= 10 ? 'var(--green)' : 'var(--amber)' }}>
              {matchingCount} / {totalUniverseCount} Stocks Pass Rules
            </span>
          </div>
        </GlassCardContent>
      </GlassCard>

      {/* Rules Builder Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 1. Fundamental Quality Rules */}
        <GlassCard>
          <GlassCardHeader
            icon={ShieldCheck}
            iconColor="var(--green)"
            title="Fundamental Quality"
          />
          <GlassCardContent className="p-4 space-y-4">
            {/* Piotroski */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span style={{ color: 'var(--text-2)' }}>Min Piotroski F-Score</span>
                <span className="font-mono font-bold" style={{ color: 'var(--brand-light)' }}>
                  &gt;= {config.minPiotroski} / 9
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="9"
                step="1"
                value={config.minPiotroski}
                onChange={e => onChange({ ...config, minPiotroski: Number(e.target.value) })}
                className="w-full accent-[var(--brand)] cursor-pointer"
              />
            </div>

            {/* Minimum ROE */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span style={{ color: 'var(--text-2)' }}>Min Return on Equity (ROE)</span>
                <span className="font-mono font-bold" style={{ color: 'var(--green)' }}>
                  &gt;= {config.minRoe}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="30"
                step="2"
                value={config.minRoe}
                onChange={e => onChange({ ...config, minRoe: Number(e.target.value) })}
                className="w-full accent-[var(--brand)] cursor-pointer"
              />
            </div>

            {/* Max Debt/Equity */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span style={{ color: 'var(--text-2)' }}>Max Debt / Equity Ratio</span>
                <span className="font-mono font-bold" style={{ color: 'var(--text)' }}>
                  &lt;= {config.maxDebtEquity.toFixed(1)}x
                </span>
              </div>
              <input
                type="range"
                min="0.2"
                max="3.0"
                step="0.1"
                value={config.maxDebtEquity}
                onChange={e => onChange({ ...config, maxDebtEquity: Number(e.target.value) })}
                className="w-full accent-[var(--brand)] cursor-pointer"
              />
            </div>

            {/* Max P/E Ratio */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span style={{ color: 'var(--text-2)' }}>Max Trailing P/E</span>
                <span className="font-mono font-bold" style={{ color: 'var(--text)' }}>
                  &lt;= {config.maxPe}x
                </span>
              </div>
              <input
                type="range"
                min="10"
                max="100"
                step="5"
                value={config.maxPe}
                onChange={e => onChange({ ...config, maxPe: Number(e.target.value) })}
                className="w-full accent-[var(--brand)] cursor-pointer"
              />
            </div>
          </GlassCardContent>
        </GlassCard>

        {/* 2. Technical & Momentum Filters */}
        <GlassCard>
          <GlassCardHeader
            icon={ChartLineUp}
            iconColor="var(--brand)"
            title="Technical & Momentum"
          />
          <GlassCardContent className="p-4 space-y-4">
            {/* Momentum Rank */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span style={{ color: 'var(--text-2)' }}>Min Momentum Percentile</span>
                <span className="font-mono font-bold" style={{ color: 'var(--brand)' }}>
                  Top {100 - config.minMomentumRank}% (Rank &gt;= {config.minMomentumRank})
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="90"
                step="5"
                value={config.minMomentumRank}
                onChange={e => onChange({ ...config, minMomentumRank: Number(e.target.value) })}
                className="w-full accent-[var(--brand)] cursor-pointer"
              />
            </div>

            {/* RSI Range */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span style={{ color: 'var(--text-2)' }}>RSI(14) Allowed Range</span>
                <span className="font-mono font-bold" style={{ color: 'var(--blue)' }}>
                  {config.minRsi} - {config.maxRsi}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  min="0"
                  max="50"
                  value={config.minRsi}
                  onChange={e => onChange({ ...config, minRsi: Math.max(0, Number(e.target.value)) })}
                  className="input px-2 py-1 text-xs font-mono"
                  placeholder="Min RSI"
                />
                <input
                  type="number"
                  min="50"
                  max="100"
                  value={config.maxRsi}
                  onChange={e => onChange({ ...config, maxRsi: Math.min(100, Number(e.target.value)) })}
                  className="input px-2 py-1 text-xs font-mono"
                  placeholder="Max RSI"
                />
              </div>
            </div>

            {/* Toggles */}
            <div className="pt-2 border-t border-[var(--border)] space-y-2.5">
              <label className="flex items-center justify-between cursor-pointer text-xs">
                <span style={{ color: 'var(--text-2)' }}>Require Price &gt; 50-Day SMA</span>
                <input
                  type="checkbox"
                  checked={config.requireTrend50Sma}
                  onChange={e => onChange({ ...config, requireTrend50Sma: e.target.checked })}
                  className="rounded border-[var(--border)] text-[var(--brand)] focus:ring-[var(--brand)]"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer text-xs">
                <span style={{ color: 'var(--text-2)' }}>Require VPT Volume Surge</span>
                <input
                  type="checkbox"
                  checked={config.requireVptSurge}
                  onChange={e => onChange({ ...config, requireVptSurge: e.target.checked })}
                  className="rounded border-[var(--border)] text-[var(--brand)] focus:ring-[var(--brand)]"
                />
              </label>
            </div>
          </GlassCardContent>
        </GlassCard>

        {/* 3. Portfolio Sizing & Risk Management */}
        <GlassCard>
          <GlassCardHeader
            icon={Sliders}
            iconColor="var(--amber)"
            title="Portfolio & Execution"
          />
          <GlassCardContent className="p-4 space-y-4">
            {/* Holdings count */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span style={{ color: 'var(--text-2)' }}>Portfolio Holdings Size</span>
                <span className="font-mono font-bold" style={{ color: 'var(--brand)' }}>
                  Top {config.topN} Stocks
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {[5, 10, 15, 20].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => onChange({ ...config, topN: n })}
                    className={`py-1 text-xs font-mono rounded border ${
                      config.topN === n
                        ? 'bg-[var(--brand-soft)] text-[var(--brand-light)] border-[var(--brand)] font-bold'
                        : 'border-[var(--border)] text-[var(--text-3)] hover:text-[var(--text)]'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* Rebalance cadence */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span style={{ color: 'var(--text-2)' }}>Rebalancing Frequency</span>
                <span className="font-mono font-bold" style={{ color: 'var(--text)' }}>
                  {config.rebalanceDays === 10 ? 'Bi-Weekly (10d)' : config.rebalanceDays === 20 ? 'Monthly (20d)' : 'Quarterly (60d)'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { d: 10, label: '10d' },
                  { d: 20, label: '20d' },
                  { d: 60, label: '60d' },
                ].map(r => (
                  <button
                    key={r.d}
                    type="button"
                    onClick={() => onChange({ ...config, rebalanceDays: r.d })}
                    className={`py-1 text-xs font-mono rounded border ${
                      config.rebalanceDays === r.d
                        ? 'bg-[var(--brand-soft)] text-[var(--brand-light)] border-[var(--brand)] font-bold'
                        : 'border-[var(--border)] text-[var(--text-3)] hover:text-[var(--text)]'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Weighting scheme */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span style={{ color: 'var(--text-2)' }}>Weighting Scheme</span>
                <span className="font-mono font-bold" style={{ color: 'var(--brand-light)' }}>
                  {config.weightingScheme === 'equal' ? 'Equal Weight' : config.weightingScheme === 'volatility_parity' ? 'Vol Parity' : 'Score Weighted'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: 'equal', label: 'Equal' },
                  { id: 'volatility_parity', label: 'Vol Parity' },
                  { id: 'score_weighted', label: 'Score Wt' },
                ].map(w => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => onChange({ ...config, weightingScheme: w.id as any })}
                    className={`py-1 text-xs rounded border ${
                      config.weightingScheme === w.id
                        ? 'bg-[var(--brand-soft)] text-[var(--brand-light)] border-[var(--brand)] font-bold'
                        : 'border-[var(--border)] text-[var(--text-3)] hover:text-[var(--text)]'
                    }`}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Trailing ATR Stop */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span style={{ color: 'var(--text-2)' }}>Trailing ATR Stop-Loss</span>
                <span className="font-mono font-bold" style={{ color: config.stopLossAtr > 0 ? 'var(--red)' : 'var(--text-3)' }}>
                  {config.stopLossAtr > 0 ? `${config.stopLossAtr.toFixed(1)}x ATR` : 'Disabled'}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="4.0"
                step="0.5"
                value={config.stopLossAtr}
                onChange={e => onChange({ ...config, stopLossAtr: Number(e.target.value) })}
                className="w-full accent-[var(--brand)] cursor-pointer"
              />
            </div>
          </GlassCardContent>
        </GlassCard>
      </div>
    </div>
  )
}
