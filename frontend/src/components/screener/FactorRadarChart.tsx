import React from 'react'
import type { DashboardData } from '../../types'

interface FactorRadarChartProps {
  assets: DashboardData[]
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6']

const DIMENSIONS: { label: string; key: keyof DashboardData; max: number; scale?: (v: number) => number }[] = [
  { label: 'Technical', key: 'Tech_Score', max: 10, scale: v => (v || 0) * 10 },
  { label: 'Piotroski', key: 'Piotroski_F', max: 9, scale: v => ((v || 0) / 9) * 10 },
  { label: 'Fundamental', key: 'Fund_Score', max: 10, scale: v => v || 0 },
  { label: 'Gross Profit', key: 'Gross_Profit_Score', max: 10, scale: v => v || 5 },
  { label: 'Earnings Quality', key: 'Earnings_Quality', max: 10, scale: v => v || 5 },
  { label: 'Composite Rank', key: 'Composite_Score', max: 10, scale: v => v || 0 },
]

export const FactorRadarChart: React.FC<FactorRadarChartProps> = ({ assets }) => {
  if (!assets || assets.length === 0) return null

  const size = 280
  const center = size / 2
  const radius = 95
  const numDimensions = DIMENSIONS.length

  const getCoordinates = (index: number, valueRatio: number) => {
    const angle = (Math.PI * 2 * index) / numDimensions - Math.PI / 2
    const r = radius * Math.max(0.05, Math.min(1, valueRatio))
    const x = center + r * Math.cos(angle)
    const y = center + r * Math.sin(angle)
    return { x, y }
  }

  // Generate background web concentric polygon rings (20%, 40%, 60%, 80%, 100%)
  const rings = [0.2, 0.4, 0.6, 0.8, 1.0].map(ratio => {
    return DIMENSIONS.map((_, i) => {
      const { x, y } = getCoordinates(i, ratio)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    }).join(' ')
  })

  // Axis endpoint lines and text labels
  const axisLines = DIMENSIONS.map((dim, i) => {
    const outer = getCoordinates(i, 1.0)
    const labelPos = getCoordinates(i, 1.18)
    return { dim, outer, labelPos }
  })

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
        {/* Background concentric web polygons */}
        {rings.map((points, idx) => (
          <polygon
            key={idx}
            points={points}
            fill="none"
            stroke="var(--border)"
            strokeWidth={idx === rings.length - 1 ? "1.5" : "1"}
            strokeDasharray={idx === rings.length - 1 ? "none" : "2 2"}
          />
        ))}

        {/* Spoke axis lines */}
        {axisLines.map((axis, i) => (
          <line
            key={i}
            x1={center}
            y1={center}
            x2={axis.outer.x}
            y2={axis.outer.y}
            stroke="var(--border)"
            strokeWidth="1"
          />
        ))}

        {/* Axis Labels */}
        {axisLines.map((axis, i) => (
          <text
            key={i}
            x={axis.labelPos.x}
            y={axis.labelPos.y}
            textAnchor="middle"
            dominantBaseline="middle"
            className="text-[10px] font-medium"
            fill="var(--text-2)"
          >
            {axis.dim.label}
          </text>
        ))}

        {/* Polygon paths for each asset */}
        {assets.map((asset, assetIdx) => {
          const color = COLORS[assetIdx % COLORS.length]
          const points = DIMENSIONS.map((dim, i) => {
            const rawVal = (asset as any)[dim.key]
            const val = dim.scale ? dim.scale(Number(rawVal)) : Number(rawVal) || 0
            const ratio = val / 10.0
            const { x, y } = getCoordinates(i, ratio)
            return { x, y }
          })

          const pointsString = points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')

          return (
            <g key={asset.Ticker}>
              {/* Polygon fill & stroke */}
              <polygon
                points={pointsString}
                fill={color}
                fillOpacity="0.2"
                stroke={color}
                strokeWidth="2"
              />
              {/* Vertex dots */}
              {points.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r="3.5"
                  fill={color}
                  stroke="#ffffff"
                  strokeWidth="1"
                />
              ))}
            </g>
          )
        })}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-center gap-4 mt-3">
        {assets.map((asset, idx) => (
          <div key={asset.Ticker} className="flex items-center gap-1.5 text-xs font-medium">
            <span
              className="w-3 h-3 rounded-full inline-block"
              style={{ background: COLORS[idx % COLORS.length] }}
            />
            <span style={{ color: 'var(--text)' }}>{asset.Ticker.replace('.NS', '')}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
