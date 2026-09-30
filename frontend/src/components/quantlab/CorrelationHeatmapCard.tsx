import React from 'react'
import { GridFour } from '@phosphor-icons/react'
import { GlassCard, GlassCardHeader, GlassCardContent } from '../common/shared'

interface CorrelationHeatmapCardProps {
  correlationMatrix: {
    labels: string[]
    matrix: number[][]
  }
  isDark: boolean
  onSelectTicker: (ticker: string) => void
}

export const CorrelationHeatmapCard: React.FC<CorrelationHeatmapCardProps> = ({
  correlationMatrix,
  onSelectTicker,
}) => {
  if (!correlationMatrix?.matrix?.length) return null

  return (
    <GlassCard>
      <GlassCardHeader
        icon={GridFour}
        iconColor="var(--amber)"
        title="Pairwise Correlation Matrix"
        tooltipId="quant.correlation"
      />
      <GlassCardContent className="p-4 overflow-x-auto scrollbar-none">
        <table className="w-full text-center" style={{ borderCollapse: 'separate', borderSpacing: 2 }}>
          <thead>
            <tr>
              <th className="p-1 text-[12px]" style={{ color: 'var(--text-3)' }}></th>
              {correlationMatrix.labels.map((lbl, idx) => (
                <th
                  key={idx}
                  className="p-1 text-[12px] font-mono cursor-pointer hover:underline"
                  style={{ color: 'var(--text-2)' }}
                  title={`View ${lbl.replace('.NS', '')} chart`}
                >
                  <button onClick={() => onSelectTicker(lbl)} aria-label={`View ${lbl.replace('.NS', '')} chart`}>{lbl.replace('.NS', '')}</button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {correlationMatrix.matrix.map((row, i) => (
              <tr key={i}>
                <td className="p-1 text-[12px] font-mono text-left" style={{ color: 'var(--text-2)' }}>
                  <button
                    onClick={() => onSelectTicker(correlationMatrix.labels[i])}
                    className="ticker-link"
                    style={{ fontSize: '12px' }}
                    title={`View ${correlationMatrix.labels[i].replace('.NS', '')} chart`}
                  >
                    {correlationMatrix.labels[i].replace('.NS', '').substring(0, 4)}
                  </button>
                </td>
                {row.map((val, j) => {
                  const token = val >= 0 ? '--green' : '--red'
                  const bg = i === j ? 'var(--surface-2)' : `color-mix(in srgb, var(${token}) ${Math.round(Math.abs(val) * 18)}%, var(--surface))`
                  const color = i === j ? 'var(--text-3)' : 'var(--text)'
                  return (
                    <td
                      key={j}
                      className="p-1 text-[12px] text-center rounded-sm transition-colors"
                      style={{ backgroundColor: bg, color }}
                    >
                      {val.toFixed(2)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </GlassCardContent>
    </GlassCard>
  )
}
