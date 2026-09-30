import { useMemo, useState } from 'react'
import type { DashboardData } from '../../types'

export interface FactorDimension {
  key: string
  label: string
  score: number
  rawDesc: string
  academicRef: string
}

export function extractFactorDimensions(asset: DashboardData): FactorDimension[] {
  if (asset.Ranking_Factors) {
    const descriptions: Record<string, string> = {
      quality: 'Profitability and financial strength, compared with accounting peers',
      value: 'Earnings, book value and cash flow relative to current price',
      momentum: 'Six and twelve month returns, excluding the latest month',
      trend: 'Price relative to the 50 and 200 session averages',
      stability: 'Recent volatility and downside variation',
    }
    return Object.entries(asset.Ranking_Factors).map(([key, score]) => ({
      key, label: key.charAt(0).toUpperCase() + key.slice(1), score,
      rawDesc: `${score.toFixed(1)}/10`, academicRef: descriptions[key] || '',
    }))
  }
  const piotroskiScore = asset.Piotroski_F != null ? (asset.Piotroski_F / 9) * 10 : 5.0
  const momentumScore = asset.RS_Percentile != null 
    ? asset.RS_Percentile / 10 
    : asset.Momentum_12M != null 
      ? Math.max(0, Math.min(10, (asset.Momentum_12M + 0.25) * 10)) 
      : 5.0
  const valueScore = asset.Value_Score != null ? Number(asset.Value_Score) : 5.0
  const grossProfitScore = asset.Gross_Profit_Score != null ? Number(asset.Gross_Profit_Score) : 5.0
  const earningsQuality = asset.Earnings_Quality != null ? Number(asset.Earnings_Quality) : 5.0
  const investmentScore = asset.Investment_Score != null ? Number(asset.Investment_Score) : 5.0
  const sueScore = asset.SUE_Score != null ? Number(asset.SUE_Score) : 5.0
  
  // Low Volatility: lower 60D vol = higher score
  const lowVolScore = asset.Vol_60D != null 
    ? Math.max(0.5, Math.min(9.5, 10 - (asset.Vol_60D - 12) * 0.25)) 
    : 5.0

  // Betting Against Beta (BAB): beta < 1.0 gets higher defensive rank
  const betaScore = asset.Beta != null 
    ? Math.max(0.5, Math.min(9.5, (2.0 - asset.Beta) * 5)) 
    : 5.0

  // Mean Reversion / Z-Score
  const reversionScore = asset.Z_Score_60 != null 
    ? Math.max(0.5, Math.min(9.5, 5 + asset.Z_Score_60 * 1.5)) 
    : asset.Reversion_Signal != null 
      ? (asset.Reversion_Signal > 0 ? 7.5 : 3.5) 
      : 5.0

  return [
    { key: 'piotroski', label: 'Piotroski', score: piotroskiScore, rawDesc: `${asset.Piotroski_F ?? '-'}/9 F-Score`, academicRef: 'Piotroski (2000)' },
    { key: 'momentum', label: 'Momentum', score: momentumScore, rawDesc: asset.Momentum_12M != null ? `${(asset.Momentum_12M * 100).toFixed(1)}% (12M)` : 'Neutral', academicRef: 'Jegadeesh & Titman (1993)' },
    { key: 'value', label: 'Value', score: valueScore, rawDesc: `${valueScore.toFixed(1)}/10 Composite`, academicRef: 'Fama & French (1992)' },
    { key: 'profitability', label: 'Profitability', score: grossProfitScore, rawDesc: `${grossProfitScore.toFixed(1)}/10 GP/A`, academicRef: 'Novy-Marx (2013)' },
    { key: 'quality', label: 'Earnings Qual', score: earningsQuality, rawDesc: `${earningsQuality.toFixed(1)}/10 Accruals`, academicRef: 'Sloan (1996)' },
    { key: 'investment', label: 'Investment', score: investmentScore, rawDesc: `${investmentScore.toFixed(1)}/10 CapEx`, academicRef: 'Titman et al. (2004)' },
    { key: 'sue', label: 'SUE / Surpr', score: sueScore, rawDesc: `${sueScore.toFixed(1)}/10 Earnings Shock`, academicRef: 'Bernard & Thomas (1989)' },
    { key: 'lowvol', label: 'Low Vol', score: lowVolScore, rawDesc: asset.Vol_60D != null ? `${asset.Vol_60D.toFixed(1)}% Vol` : '-', academicRef: 'Baker et al. (2011)' },
    { key: 'bab', label: 'BAB (Beta)', score: betaScore, rawDesc: asset.Beta != null ? `${asset.Beta.toFixed(2)} β` : '-', academicRef: 'Frazzini & Pedersen (2014)' },
    { key: 'reversion', label: 'Reversion', score: reversionScore, rawDesc: asset.Z_Score_60 != null ? `Z: ${asset.Z_Score_60.toFixed(2)}` : '-', academicRef: 'De Bondt & Thaler (1985)' },
  ]
}

interface Props {
  asset?: DashboardData
  assets?: DashboardData[]
  peerGroup?: DashboardData[]
  size?: number
  showLegend?: boolean
  className?: string
}

const COMPARISON_COLORS = ['var(--chart-blue)', 'var(--green)', 'var(--chart-orange)', 'var(--chart-pink)', 'var(--chart-purple)', 'var(--chart-teal)']

export function FactorRadarChart({ asset, assets, peerGroup = [], size = 320, showLegend = true, className = '' }: Props) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  const activeAsset = asset || (assets && assets.length > 0 ? assets[0] : null)
  const isMultiAsset = Boolean(assets && assets.length > 0)

  const factors = useMemo(() => {
    if (activeAsset) return extractFactorDimensions(activeAsset)
    return []
  }, [activeAsset])

  const multiAssetFactors = useMemo(() => {
    if (!assets || assets.length === 0) return []
    return assets.map((a, idx) => ({
      asset: a,
      color: COMPARISON_COLORS[idx % COMPARISON_COLORS.length],
      dims: extractFactorDimensions(a),
    }))
  }, [assets])

  // Sector peer benchmark factors
  const peerFactors = useMemo(() => {
    if (!peerGroup || peerGroup.length === 0 || !factors.length) return null
    const allDims = peerGroup.filter(p => p.Ranking_Version === activeAsset?.Ranking_Version).map(p => extractFactorDimensions(p))
    if (!allDims.length) return null
    return factors.map((f, i) => {
      const avg = allDims.reduce((acc, dims) => acc + dims[i].score, 0) / allDims.length
      return { ...f, score: avg }
    })
  }, [peerGroup, factors, activeAsset?.Ranking_Version])

  if (!activeAsset && (!assets || assets.length === 0)) return null

  const center = size / 2
  const maxRadius = Math.max(32, (size - (size < 280 ? 104 : 148)) / 2)
  const numFactors = factors.length || 10
  const levels = [2, 4, 6, 8, 10]

  const getCoordinates = (index: number, score: number) => {
    const angle = (index * 2 * Math.PI) / numFactors - Math.PI / 2
    const r = (Math.max(0, Math.min(score, 10)) / 10) * maxRadius
    return {
      x: center + r * Math.cos(angle),
      y: center + r * Math.sin(angle),
    }
  }

  // Stock Polygon Path (for single asset)
  const stockPoints = factors.map((f, i) => {
    const { x, y } = getCoordinates(i, f.score)
    return `${x},${y}`
  }).join(' ')

  // Sector Benchmark Polygon Path
  const peerPoints = peerFactors ? peerFactors.map((f, i) => {
    const { x, y } = getCoordinates(i, f.score)
    return `${x},${y}`
  }).join(' ') : ''

  const gradientId = `radar-grad-${(activeAsset?.Ticker || 'radar').replace(/[^a-zA-Z0-9]/g, '')}`

  return (
    <div className={`flex flex-col items-center select-none w-full min-w-0 ${className}`}>
      <div className="relative" style={{ width: '100%', maxWidth: size, aspectRatio: '1' }}>
        <svg width="100%" height="100%" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Factor scores and sector benchmark">
          <defs>
            <radialGradient id={gradientId} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.45} />
              <stop offset="70%" stopColor="var(--brand)" stopOpacity={0.20} />
              <stop offset="100%" stopColor="var(--brand)" stopOpacity={0.05} />
            </radialGradient>
            <filter id="radar-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Concentric Polygon Grid Rings */}
          {levels.map((level) => {
            const levelRadius = (level / 10) * maxRadius
            const ringPoints = Array.from({ length: numFactors }).map((_, i) => {
              const angle = (i * 2 * Math.PI) / numFactors - Math.PI / 2
              return `${center + levelRadius * Math.cos(angle)},${center + levelRadius * Math.sin(angle)}`
            }).join(' ')

            return (
              <g key={level}>
                <polygon
                  points={ringPoints}
                  fill="none"
                  stroke="var(--glass-border-strong)"
                  strokeWidth="0.8"
                  strokeDasharray={level === 10 ? 'none' : '2,3'}
                  opacity={level === 10 ? 0.9 : 0.45}
                />
                <text
                  x={center + 3}
                  y={center - levelRadius + 9}
                  fontSize="12"
                  fill="var(--text-3)"
                  opacity={0.6}
                  fontFamily="var(--font-ui)"
                >
                  {level}
                </text>
              </g>
            )
          })}

          {/* Dimension Axis Spokes */}
          {factors.map((_, i) => {
            const angle = (i * 2 * Math.PI) / numFactors - Math.PI / 2
            const x2 = center + maxRadius * Math.cos(angle)
            const y2 = center + maxRadius * Math.sin(angle)
            return (
              <line
                key={i}
                x1={center}
                y1={center}
                x2={x2}
                y2={y2}
                stroke="var(--glass-border)"
                strokeWidth="0.8"
                opacity={0.6}
              />
            )
          })}

          {/* Sector Benchmark Polygon (Dashed Amber) - Single Asset Mode */}
          {!isMultiAsset && peerPoints && (
            <polygon
              points={peerPoints}
              fill="var(--amber)" fillOpacity={0.08}
              stroke="var(--amber)"
              strokeWidth="1.5"
              strokeDasharray="4,3"
              opacity={0.8}
            />
          )}

          {/* Single Stock Polygon */}
          {!isMultiAsset && (
            <polygon
              points={stockPoints}
              fill={`url(#${gradientId})`}
              stroke="var(--brand)"
              strokeWidth="2.2"

              style={{ transition: 'all 400ms var(--ease-out)' }}
            />
          )}

          {/* Multi-Asset Polygons */}
          {isMultiAsset && multiAssetFactors.map(({ asset: a, color, dims }) => {
            const pts = dims.map((d, i) => {
              const { x, y } = getCoordinates(i, d.score)
              return `${x},${y}`
            }).join(' ')
            return (
              <polygon
                key={a.Ticker}
                points={pts}
                fill={color}
                fillOpacity={0.15}
                stroke={color}
                strokeWidth="2"
                style={{ transition: 'all 400ms var(--ease-out)' }}
              />
            )
          })}

          {/* Factor Node Vertices & Interaction Dots */}
          {factors.map((f, i) => {
            const { x, y } = getCoordinates(i, f.score)
            const angle = (i * 2 * Math.PI) / numFactors - Math.PI / 2
            const labelRadius = maxRadius + 24
            const lx = center + labelRadius * Math.cos(angle)
            const ly = center + labelRadius * Math.sin(angle)
            const isHovered = hoveredIdx === i

            return (
              <g
                key={f.key}
                tabIndex={0}
                role="img"
                aria-label={`${f.label}: ${f.score.toFixed(1)} out of 10. ${f.rawDesc}`}
                onFocus={() => setHoveredIdx(i)}
                onBlur={() => setHoveredIdx(null)}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                {/* Vertex Point */}
                <circle
                  cx={x}
                  cy={y}
                  r={isHovered ? 5.5 : 3.5}
                  fill="var(--brand)"
                  stroke="var(--surface)"
                  strokeWidth="1.5"
                  className="transition-all duration-200"
                />

                {/* Outer Axis Label */}
                <text
                  x={lx}
                  y={ly + 3}
                  textAnchor="middle"
                  fontSize={size < 280 ? 12 : 15}
                  fontWeight={isHovered ? '700' : '500'}
                  fill={isHovered ? 'var(--brand)' : 'var(--text-2)'}
                  className="transition-colors duration-150"
                >
                  {size < 280 ? ({ piotroski: 'F-score', momentum: 'Mom', value: 'Value', profitability: 'Profit', quality: 'Quality', investment: 'Invest', sue: 'SUE', lowvol: 'Low vol', bab: 'Beta', reversion: 'Revert' } as Record<string, string>)[f.key] : f.label}
                </text>
              </g>
            )
          })}
        </svg>

        {/* Hovered Factor Tooltip Overlay */}
        {hoveredIdx !== null && (
          <div
            className="absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-xl glass-strong shadow-lg text-center pointer-events-none animate-fade-in text-xs z-10 whitespace-normal max-w-full w-[280px]"
            style={{ border: '1px solid var(--border-2)', background: 'var(--surface-3)' }}
          >
            <div className="font-semibold flex flex-wrap items-center justify-center gap-1.5" style={{ color: 'var(--text)' }}>
              <span>{factors[hoveredIdx].label}</span>
              <span className="font-mono" style={{ color: 'var(--brand)' }}>{factors[hoveredIdx].score.toFixed(1)}/10</span>
            </div>
            <div className="text-[12px] mt-0.5" style={{ color: 'var(--text-3)' }}>
              <span className="block">{factors[hoveredIdx].rawDesc}</span>
              <span className="block">{factors[hoveredIdx].academicRef}</span>
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      {showLegend && (
        <div className="flex flex-wrap items-center justify-center gap-4 mt-2 text-[12px]" style={{ color: 'var(--text-3)' }}>
          {!isMultiAsset && activeAsset && (
            <>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full" style={{ background: 'var(--brand)' }} />
                <span className="font-medium" style={{ color: 'var(--text)' }}>{activeAsset.Ticker.replace('.NS', '')} factor profile</span>
              </div>
              {peerGroup && peerGroup.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 border-b-2 border-dashed border-[var(--amber)]" />
                  <span>{activeAsset.Sector || 'Sector'} average</span>
                </div>
              )}
            </>
          )}
          {isMultiAsset && multiAssetFactors.map(({ asset: a, color }) => (
            <div key={a.Ticker} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
              <span className="font-medium" style={{ color: 'var(--text)' }}>{a.Ticker.replace('.NS', '')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
