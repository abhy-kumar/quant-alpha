import React from 'react'
import { Target } from '@phosphor-icons/react'
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip } from 'recharts'
import { GlassCard, GlassCardHeader, GlassCardContent, GlassCardFooter } from '../common/shared'
import { getRechartsTooltipStyle } from '../../utils/chartThemes'

interface EfficientFrontierPoint {
  volatility: number
  return: number
  sharpe: number
}

interface EfficientFrontierCardProps {
  points: EfficientFrontierPoint[]
  isDark: boolean
}

export const EfficientFrontierCard: React.FC<EfficientFrontierCardProps> = ({ points, isDark }) => {
  const tooltipStyle = getRechartsTooltipStyle(isDark)

  return (
    <GlassCard>
      <GlassCardHeader
        icon={Target}
        title="Efficient Frontier"
        badge={
          <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded" style={{ background: 'var(--brand-soft)', color: 'var(--brand-light)' }}>
            Mean-Variance Optimization
          </span>
        }
      />
      <GlassCardContent className="p-5" style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" />
            <XAxis type="number" dataKey="volatility" name="Ann. Volatility (%)" unit="%" stroke="var(--border)" tick={{ fill: 'var(--text-3)', fontSize: 10 }} />
            <YAxis type="number" dataKey="return" name="Expected Return (%)" unit="%" stroke="var(--border)" tick={{ fill: 'var(--text-3)', fontSize: 10 }} />
            <ZAxis type="number" dataKey="sharpe" range={[40, 120]} name="Sharpe Ratio" />
            <Tooltip
              cursor={{ strokeDasharray: '3 3' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const d = payload[0].payload as EfficientFrontierPoint
                return (
                  <div style={{ ...tooltipStyle, minWidth: 150 }}>
                    <p className="font-semibold text-xs mb-1" style={{ color: 'var(--brand)' }}>Simulated Portfolio</p>
                    <p className="text-[11px]" style={{ color: 'var(--text)' }}>Volatility: <strong>{d.volatility}%</strong></p>
                    <p className="text-[11px]" style={{ color: 'var(--green)' }}>Expected Return: <strong>+{d.return}%</strong></p>
                    <p className="text-[11px]" style={{ color: 'var(--blue)' }}>Sharpe Ratio: <strong>{d.sharpe}</strong></p>
                  </div>
                )
              }}
            />
            <Scatter name="Frontier Portfolios" data={points} fill="var(--brand)" />
          </ScatterChart>
        </ResponsiveContainer>
      </GlassCardContent>
      <GlassCardFooter className="px-5 pb-4 text-[11px] text-center text-[var(--text-3)] border-none">
        Optimal Tangency Portfolio maxes Sharpe ratio at ~18.0% volatility.
      </GlassCardFooter>
    </GlassCard>
  )
}
