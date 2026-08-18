/**
 * StrategyTearSheet.tsx
 * Comprehensive institutional quantitative performance report.
 * Displays equity curve, drawdown, monthly return heatmap, alpha decay, and trade logs.
 */

import React, { useState } from 'react'
import type { StrategyBacktestResult } from '../../types'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine, BarChart, Bar, AreaChart, Area } from 'recharts'
import { TrendUp, DownloadSimple, ClockCounterClockwise, Lightning, Crosshair } from '@phosphor-icons/react'
import { GlassCard, GlassCardHeader, GlassCardContent } from '../common/shared'
import { getRechartsTooltipStyle } from '../../utils/chartThemes'
import { exportToCSV } from '../../utils/exportUtils'

interface Props {
  result: StrategyBacktestResult
  isDark: boolean
  onSelectTicker: (ticker: string) => void
}

export const StrategyTearSheet: React.FC<Props> = ({ result, isDark, onSelectTicker }) => {
  const { stats, chart, monthlyReturns, alphaDecay, trades, config } = result
  const [chartMode, setChartMode] = useState<'equity' | 'drawdown'>('equity')

  const handleExportTrades = () => {
    exportToCSV(`strategy_trades_${config.name.toLowerCase().replace(/\s+/g, '_')}.csv`, trades)
  }

  const tooltipStyle = getRechartsTooltipStyle(isDark)

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  return (
    <div className="space-y-5">
      {/* KPI Stats Ribbon */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {[
          { label: 'CAGR', val: `${stats.cagr > 0 ? '+' : ''}${stats.cagr}%`, color: stats.cagr >= 15 ? 'var(--green)' : stats.cagr >= 0 ? 'var(--brand)' : 'var(--red)', sub: `Bench: +${stats.benchmarkCagr}%` },
          { label: 'Sharpe Ratio', val: stats.sharpeRatio.toFixed(2), color: stats.sharpeRatio >= 1.0 ? 'var(--green)' : stats.sharpeRatio >= 0.5 ? 'var(--brand)' : 'var(--red)', sub: `Rf = 6.5%` },
          { label: 'Sortino Ratio', val: stats.sortinoRatio.toFixed(2), color: stats.sortinoRatio >= 1.2 ? 'var(--green)' : 'var(--brand)', sub: 'Downside risk' },
          { label: 'Max Drawdown', val: `-${stats.maxDrawdown}%`, color: stats.maxDrawdown <= 15 ? 'var(--green)' : stats.maxDrawdown <= 25 ? 'var(--amber)' : 'var(--red)', sub: 'Peak-to-trough' },
          { label: 'Win Rate', val: `${stats.winRate}%`, color: stats.winRate >= 60 ? 'var(--green)' : 'var(--text)', sub: `${stats.totalTrades} Trades` },
          { label: 'Profit Factor', val: `${stats.profitFactor.toFixed(2)}x`, color: stats.profitFactor >= 1.5 ? 'var(--green)' : 'var(--text)', sub: 'Gross W/L' },
          { label: 'Jensen Alpha', val: `${stats.alpha > 0 ? '+' : ''}${stats.alpha}%`, color: stats.alpha > 0 ? 'var(--green)' : 'var(--red)', sub: `Beta: ${stats.beta}` },
          { label: 'Ann. Volatility', val: `${stats.annualVol}%`, color: 'var(--text-2)', sub: 'Daily std dev' },
        ].map(item => (
          <div key={item.label} className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] space-y-1">
            <p className="typo-caption text-[var(--text-3)]">{item.label}</p>
            <p className="typo-stat text-base font-bold font-mono" style={{ color: item.color }}>
              {item.val}
            </p>
            <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>
              {item.sub}
            </p>
          </div>
        ))}
      </div>

      {/* Main Chart: Cumulative Performance / Underwater Drawdown */}
      <GlassCard>
        <GlassCardHeader
          icon={TrendUp}
          iconColor="var(--green)"
          title="Simulated Strategy Growth & Benchmark Comparison"
          badge={
            <div className="flex items-center gap-1">
              <button
                onClick={() => setChartMode('equity')}
                className={`px-2 py-0.5 text-xs rounded font-medium transition-colors ${
                  chartMode === 'equity'
                    ? 'bg-[var(--brand-soft)] text-[var(--brand-light)] font-bold'
                    : 'text-[var(--text-3)] hover:text-[var(--text)]'
                }`}
              >
                Equity Curve
              </button>
              <button
                onClick={() => setChartMode('drawdown')}
                className={`px-2 py-0.5 text-xs rounded font-medium transition-colors ${
                  chartMode === 'drawdown'
                    ? 'bg-[var(--brand-soft)] text-[var(--brand-light)] font-bold'
                    : 'text-[var(--text-3)] hover:text-[var(--text)]'
                }`}
              >
                Drawdown %
              </button>
            </div>
          }
        />
        <GlassCardContent className="p-5" style={{ height: 320 }}>
          <ResponsiveContainer width="100%" height="100%">
            {chartMode === 'equity' ? (
              <LineChart data={chart} margin={{ top: 10, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" stroke="var(--border)" tick={{ fill: 'var(--text-3)', fontSize: 10, fontFamily: 'Inter, system-ui, sans-serif' }} tickMargin={8} minTickGap={30} />
                <YAxis stroke="var(--border)" tick={{ fill: 'var(--text-3)', fontSize: 10, fontFamily: 'Inter, system-ui, sans-serif' }} domain={['auto', 'auto']} tickFormatter={v => typeof v === 'number' ? v.toFixed(0) : v} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend verticalAlign="top" height={28} align="right" wrapperStyle={{ fontSize: '11px', color: 'var(--text-3)' }} />
                <ReferenceLine y={100} stroke="var(--border)" strokeDasharray="4 4" />
                <Line type="monotone" dataKey="portfolio" name={`${config.name} (Rebased)`} stroke="var(--green)" strokeWidth={2.2} dot={false} activeDot={{ r: 4 }} />
                <Line type="monotone" dataKey="benchmark" name="NIFTY 50 Benchmark" stroke="var(--text-3)" strokeWidth={1.5} dot={false} strokeDasharray="4 4" />
              </LineChart>
            ) : (
              <AreaChart data={chart} margin={{ top: 10, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" stroke="var(--border)" tick={{ fill: 'var(--text-3)', fontSize: 10, fontFamily: 'Inter, system-ui, sans-serif' }} tickMargin={8} minTickGap={30} />
                <YAxis stroke="var(--border)" tick={{ fill: 'var(--text-3)', fontSize: 10, fontFamily: 'Inter, system-ui, sans-serif' }} domain={['auto', 0]} tickFormatter={v => `${v}%`} />
                <Tooltip contentStyle={tooltipStyle} formatter={(val: any) => `${Number(val).toFixed(2)}%`} />
                <Legend verticalAlign="top" height={28} align="right" wrapperStyle={{ fontSize: '11px', color: 'var(--text-3)' }} />
                <Area type="monotone" dataKey="drawdown" name="Strategy Drawdown" stroke="var(--red)" fill="rgba(239, 68, 68, 0.2)" strokeWidth={1.5} />
                <Area type="monotone" dataKey="benchmarkDrawdown" name="NIFTY 50 Drawdown" stroke="var(--text-3)" fill="rgba(156, 163, 175, 0.1)" strokeWidth={1} strokeDasharray="3 3" />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </GlassCardContent>
      </GlassCard>

      {/* Grid: Monthly Returns Calendar Heatmap + Forward Alpha Decay Profile */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Monthly Returns Heatmap Matrix */}
        <GlassCard className="lg:col-span-2">
          <GlassCardHeader
            icon={ClockCounterClockwise}
            iconColor="var(--brand)"
            title="Monthly Returns Matrix"
            badge={<span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--brand-soft)] text-[var(--brand-light)]">Walk-Forward</span>}
          />
          <GlassCardContent className="p-4 overflow-x-auto scrollbar-none">
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="py-2 px-2 text-left font-medium" style={{ color: 'var(--text-3)' }}>Year</th>
                  {MONTHS.map(m => (
                    <th key={m} className="py-2 px-1 text-center font-medium" style={{ color: 'var(--text-3)', width: 38 }}>
                      {m}
                    </th>
                  ))}
                  <th className="py-2 px-2 text-right font-bold" style={{ color: 'var(--text)' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {monthlyReturns.map(row => (
                  <tr key={row.year} className="border-b border-[var(--border)]">
                    <td className="py-2 px-2 font-mono font-medium" style={{ color: 'var(--text)' }}>
                      {row.year}
                    </td>
                    {row.months.map((val, idx) => {
                      if (val === null) {
                        return <td key={idx} className="py-2 px-1 text-center text-[var(--text-3)]">-</td>
                      }
                      const isPos = val > 0
                      const isZero = val === 0
                      const bg = isZero
                        ? 'transparent'
                        : isPos
                        ? `rgba(16, 185, 129, ${Math.min(0.85, Math.abs(val) / 12)})`
                        : `rgba(239, 68, 68, ${Math.min(0.85, Math.abs(val) / 12)})`
                      const textColor = Math.abs(val) > 4 ? '#ffffff' : isPos ? 'var(--green)' : 'var(--red)'

                      return (
                        <td
                          key={idx}
                          className="py-2 px-1 text-center font-mono font-medium rounded-sm"
                          style={{ backgroundColor: bg, color: textColor }}
                        >
                          {val > 0 ? `+${val.toFixed(1)}` : val.toFixed(1)}%
                        </td>
                      )
                    })}
                    <td
                      className="py-2 px-2 text-right font-mono font-bold"
                      style={{ color: row.total >= 0 ? 'var(--green)' : 'var(--red)' }}
                    >
                      {row.total > 0 ? `+${row.total.toFixed(1)}` : row.total.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </GlassCardContent>
        </GlassCard>

        {/* Forward Alpha Decay Profile */}
        <GlassCard>
          <GlassCardHeader
            icon={Lightning}
            iconColor="var(--amber)"
            title="Alpha Decay by Horizon"
            badge={<span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--brand-soft)] text-[var(--brand-light)]">Excess Return</span>}
          />
          <GlassCardContent className="p-4 space-y-4">
            <div style={{ height: 160 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={alphaDecay} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label" stroke="var(--border)" tick={{ fill: 'var(--text-3)', fontSize: 9 }} />
                  <YAxis stroke="var(--border)" tick={{ fill: 'var(--text-3)', fontSize: 9 }} tickFormatter={v => `+${v}%`} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(val: any) => `+${Number(val).toFixed(2)}% vs Nifty`} />
                  <Bar dataKey="excessReturnPct" name="Alpha vs Nifty" fill="var(--green)" radius={[4, 4, 0, 0]} barSize={24} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2 pt-2 border-t border-[var(--border)]">
              {alphaDecay.map(item => (
                <div key={item.label} className="flex justify-between items-center text-xs">
                  <span style={{ color: 'var(--text-2)' }}>{item.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-[var(--green)]">+{item.excessReturnPct}%</span>
                    <span className="text-[10px] text-[var(--text-3)] font-mono">({item.winRatePct}% Win)</span>
                  </div>
                </div>
              ))}
            </div>
          </GlassCardContent>
        </GlassCard>
      </div>

      {/* Simulated Trade Execution Log */}
      <GlassCard>
        <GlassCardHeader
          icon={Crosshair}
          iconColor="var(--brand)"
          title="Simulated Rebalancing Trade Log"
          badge={
            <button
              onClick={handleExportTrades}
              className="btn btn-secondary text-xs px-2.5 py-1 flex items-center gap-1"
            >
              <DownloadSimple size={14} />
              <span>Export CSV</span>
            </button>
          }
        />
        <GlassCardContent className="p-4 overflow-x-auto scrollbar-none max-h-80">
          <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="py-2 pr-4 text-left font-medium" style={{ color: 'var(--text-3)' }}>Asset</th>
                <th className="py-2 pr-4 text-left font-medium" style={{ color: 'var(--text-3)' }}>Entry Date</th>
                <th className="py-2 pr-4 text-left font-medium" style={{ color: 'var(--text-3)' }}>Exit Date</th>
                <th className="py-2 pr-4 text-right font-medium" style={{ color: 'var(--text-3)' }}>Entry Price</th>
                <th className="py-2 pr-4 text-right font-medium" style={{ color: 'var(--text-3)' }}>Exit Price</th>
                <th className="py-2 pr-4 text-right font-medium" style={{ color: 'var(--text-3)' }}>Return</th>
                <th className="py-2 pr-4 text-right font-medium" style={{ color: 'var(--text-3)' }}>Hold (Days)</th>
                <th className="py-2 text-right font-medium" style={{ color: 'var(--text-3)' }}>Exit Trigger</th>
              </tr>
            </thead>
            <tbody>
              {trades.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-xs text-[var(--text-3)]">
                    No simulated trades generated for the selected parameters.
                  </td>
                </tr>
              ) : (
                trades.map((t, idx) => (
                  <tr key={idx} className="border-b border-[var(--border)] hover:bg-[var(--surface-2)] transition-colors">
                    <td className="py-2.5 pr-4 font-bold">
                      <button
                        onClick={() => onSelectTicker(t.ticker)}
                        className="ticker-link"
                        title={`View ${t.ticker.replace('.NS', '')}`}
                      >
                        {t.ticker.replace('.NS', '')}
                      </button>
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-[11px]" style={{ color: 'var(--text-3)' }}>{t.entryDate}</td>
                    <td className="py-2.5 pr-4 font-mono text-[11px]" style={{ color: 'var(--text-3)' }}>{t.exitDate}</td>
                    <td className="py-2.5 pr-4 text-right font-mono" style={{ color: 'var(--text-2)' }}>₹{t.entryPrice.toFixed(2)}</td>
                    <td className="py-2.5 pr-4 text-right font-mono" style={{ color: 'var(--text)' }}>₹{t.exitPrice.toFixed(2)}</td>
                    <td className="py-2.5 pr-4 text-right font-mono font-bold" style={{ color: t.returnPct >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {t.returnPct >= 0 ? `+${t.returnPct.toFixed(2)}` : t.returnPct.toFixed(2)}%
                    </td>
                    <td className="py-2.5 pr-4 text-right font-mono text-[11px]" style={{ color: 'var(--text-3)' }}>{t.holdingDays}d</td>
                    <td className="py-2.5 text-right font-medium text-[11px]">
                      <span
                        className="px-2 py-0.5 rounded font-medium"
                        style={{
                          background:
                            t.exitReason === 'Take-Profit'
                              ? 'var(--green-bg)'
                              : t.exitReason === 'Stop-Loss'
                              ? 'var(--red-bg)'
                              : 'var(--brand-soft)',
                          color:
                            t.exitReason === 'Take-Profit'
                              ? 'var(--green)'
                              : t.exitReason === 'Stop-Loss'
                              ? 'var(--red)'
                              : 'var(--brand-light)',
                        }}
                      >
                        {t.exitReason}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </GlassCardContent>
      </GlassCard>
    </div>
  )
}
