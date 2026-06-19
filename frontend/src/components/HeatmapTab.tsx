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

export default function HeatmapTab({ sectorMap, onSelect, isDark }: Props) {
  const sortedSectors = Object.keys(sectorMap).sort()
  return (
    <div className="space-y-4">
      {/* Legend */}
      <div className="flex flex-wrap justify-end items-center gap-4 text-xs" style={{ color: 'var(--text-3)' }}>
        <span className="font-medium">Score:</span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3" style={{ backgroundColor: isDark ? 'rgba(220,50,50,0.3)' : 'rgba(220,50,50,0.2)' }} />
          Low (&lt;4)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3" style={{ backgroundColor: isDark ? 'rgba(200,130,50,0.3)' : 'rgba(200,130,50,0.2)' }} />
          Mid (4-7)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3" style={{ backgroundColor: isDark ? 'rgba(50,180,90,0.3)' : 'rgba(50,180,90,0.2)' }} />
          High (&gt;7)
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {sortedSectors.map(sector => (
          <div key={sector} className="p-5 transition-colors" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'none' }}>
            <h3 className="text-sm font-semibold mb-4 pb-3" style={{ borderBottom: '1px solid var(--border)', color: 'var(--text)' }}>
              {sector}
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {sectorMap[sector].map(stock => {
                const s = Number(stock.Composite_Score || 0)
                const colors = getHeatmapColor(s, isDark)
                return (
                  <div
                    key={stock.Ticker}
                    onClick={() => onSelect(stock.Ticker)}
                    className="flex flex-col items-center justify-center px-2 py-3 border transition-colors duration-200 cursor-pointer"
                    style={colors}
                    title={`${stock.Ticker.replace('.NS', '')} — Score: ${s.toFixed(2)}`}
                  >
                    <span className="text-[11px] font-medium leading-tight">
                      {stock.Ticker.replace('.NS', '')}
                    </span>
                    <span className="text-[10px] mt-0.5 opacity-70 font-data">
                      {s.toFixed(1)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
