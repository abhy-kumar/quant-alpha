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
  isDark,
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
              <th className="p-1 text-[9px]" style={{ color: 'var(--text-3)' }}></th>
              {correlationMatrix.labels.map((lbl, idx) => (
                <th
                  key={idx}
                  className="p-1 text-[9px] font-mono cursor-pointer hover:underline"
                  style={{ color: 'var(--text-2)' }}
                  onClick={() => onSelectTicker(lbl)}
                  title={`View ${lbl.replace('.NS', '')} chart`}
                >
                  {lbl.replace('.NS', '').substring(0, 4)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {correlationMatrix.matrix.map((row, i) => (
              <tr key={i}>
                <td className="p-1 text-[9px] font-mono text-left" style={{ color: 'var(--text-2)' }}>
                  <button
                    onClick={() => onSelectTicker(correlationMatrix.labels[i])}
                    className="ticker-link"
                    style={{ fontSize: '10px' }}
                    title={`View ${correlationMatrix.labels[i].replace('.NS', '')} chart`}
                  >
                    {correlationMatrix.labels[i].replace('.NS', '').substring(0, 4)}
                  </button>
                </td>
                {row.map((val, j) => {
                  let bg = 'transparent'
                  let color = 'var(--text)'
                  if (val === 1) {
                    bg = isDark ? '#1F2937' : '#F3F4F6'
                    color = 'var(--text-3)'
                  } else if (val > 0.5) {
                    bg = `rgba(16, 185, 129, ${val * 0.8})`
                    color = '#fff'
                  } else if (val > 0) {
                    bg = `rgba(16, 185, 129, ${val * 0.4})`
                    color = isDark ? '#fff' : '#000'
                  } else if (val < -0.5) {
                    bg = `rgba(239, 68, 68, ${Math.abs(val) * 0.8})`
                    color = '#fff'
                  } else if (val < 0) {
                    bg = `rgba(239, 68, 68, ${Math.abs(val) * 0.4})`
                    color = isDark ? '#fff' : '#000'
                  }
                  return (
                    <td
                      key={j}
                      className="p-1 text-[9px] text-center rounded-sm transition-colors"
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
