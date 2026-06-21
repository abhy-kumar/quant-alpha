import { useMemo, useState } from 'react'
import type { DashboardData } from '../types'

interface Props {
  sectorMap: Record<string, DashboardData[]>
  onSelect: (ticker: string) => void
  isDark: boolean
}

function getHeatmapColor(score: number, isDark: boolean) {
  const normalized = Math.max(0, Math.min(1, (score - 2) / 6))
  const r = Math.round(220 - normalized * 180)
  const g = Math.round(50 + normalized * 150)
  const b = Math.round(50 + normalized * 80)
  const bgAlpha = isDark ? 0.2 : 0.12
  return {
    backgroundColor: `rgba(${r}, ${g}, ${b}, ${bgAlpha})`,
    borderColor: `rgba(${r}, ${g}, ${b}, 0.3)`,
    color: isDark ? `rgb(${Math.min(255, r + 60)}, ${Math.min(255, g + 60)}, ${Math.min(255, b + 60)})` : `rgb(${Math.max(0, r - 40)}, ${Math.max(0, g - 40)}, ${Math.max(0, b - 40)})`,
  }
}

function getLegendColor(score: number, isDark: boolean) {
  return getHeatmapColor(score, isDark)
}

export default function HeatmapTab({ sectorMap, onSelect, isDark }: Props) {
  const [sortMode, setSortMode] = useState<'alpha'|'score'>('score')

  const sectorAvgScores = useMemo(() => {
    const m: Record<string, number> = {}
    Object.entries(sectorMap).forEach(([s, stocks]) => {
      m[s] = stocks.reduce((a, st) => a + (Number(st.Composite_Score) || 0), 0) / stocks.length
    })
    return m
  }, [sectorMap])

  const sortedSectors = sortMode === 'score'
    ? Object.keys(sectorMap).sort((a, b) => sectorAvgScores[b] - sectorAvgScores[a])
    : Object.keys(sectorMap).sort()

  return (
    <div className="space-y-4">
      {/* Legend + Sort toggle */}
      <div className="flex flex-wrap justify-between items-center gap-4 text-xs" style={{ color: 'var(--text-3)' }}>
        <div className="flex items-center gap-4">
          <span className="font-medium">Score:</span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm" style={getLegendColor(3, isDark)} />
            Low (&lt;4)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm" style={getLegendColor(5.5, isDark)} />
            Mid (4-7)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm" style={getLegendColor(8, isDark)} />
            High (&gt;7)
          </span>
        </div>
        <div className="inline-flex" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <button onClick={() => setSortMode('score')} style={{
            padding: '3px 10px', fontSize: 11, fontWeight: 500,
            background: sortMode === 'score' ? 'var(--brand)' : 'transparent',
            color: sortMode === 'score' ? 'white' : 'var(--text-3)',
            border: 'none', cursor: 'pointer',
            borderRight: '1px solid var(--border)',
          }}>By Score</button>
          <button onClick={() => setSortMode('alpha')} style={{
            padding: '3px 10px', fontSize: 11, fontWeight: 500,
            background: sortMode === 'alpha' ? 'var(--brand)' : 'transparent',
            color: sortMode === 'alpha' ? 'white' : 'var(--text-3)',
            border: 'none', cursor: 'pointer',
          }}>A\u2013Z</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {sortedSectors.map(sector => {
          const stocks = sectorMap[sector]
          const avgScore = sectorAvgScores[sector]
          const colCount = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(stocks.length))))
          return (
            <div key={sector} className="p-5 card">
              <div className="mb-4 pb-3" style={{ borderBottom: '1px solid var(--border)' }}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{sector}</h3>
                  <span className="font-mono text-[11px] font-medium" style={{ color: avgScore >= 7 ? 'var(--green)' : avgScore >= 4 ? 'var(--text-2)' : 'var(--red)' }}>
                    {avgScore.toFixed(1)}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, height: 2, background: 'var(--border)', borderRadius: 1 }}>
                    <div style={{ width: `${(avgScore/10)*100}%`, height: '100%',
                      background: `hsl(${Math.round(avgScore*14)}, 55%, 45%)`,
                      borderRadius: 1, transition: 'width 500ms var(--ease-out)' }}/>
                  </div>
                  <span className="font-mono text-[10px]" style={{ color: 'var(--text-2)' }}>
                    {stocks.length} stocks
                  </span>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${colCount}, 1fr)`, gap: 6 }}>
                {stocks.map(stock => {
                  const s = Number(stock.Composite_Score || 0)
                  const colors = getHeatmapColor(s, isDark)
                  return (
                    <div
                      key={stock.Ticker}
                      onClick={() => onSelect(stock.Ticker)}
                      className="flex flex-col items-center justify-center px-1 py-2.5"
                      style={{
                        ...colors,
                        borderRadius: 'var(--radius-sm)',
                        transition: 'transform 120ms ease, box-shadow 120ms ease',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)' }}
                      onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none' }}
                      title={`${stock.Ticker.replace('.NS', '')} \u2014 Score: ${s.toFixed(2)}`}
                    >
                      <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '-0.02em',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        width: '100%', textAlign: 'center', display: 'block' }}>
                        {stock.Ticker.replace('.NS', '')}
                      </span>
                      <span style={{ fontSize: 10, marginTop: 2, opacity: 0.7 }}>
                        {s.toFixed(1)}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
