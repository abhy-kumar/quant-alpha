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
    borderColor: `rgba(${r}, ${g}, ${b}, 0.35)`,
    color: isDark ? `rgb(${Math.min(255, r + 60)}, ${Math.min(255, g + 60)}, ${Math.min(255, b + 60)})` : `rgb(${Math.max(0, r - 40)}, ${Math.max(0, g - 40)}, ${Math.max(0, b - 40)})`,
  }
}

export default function HeatmapTab({ sectorMap, onSelect, isDark }: Props) {
  const sortedSectors = Object.keys(sectorMap).sort()
  return (
    <div className="space-y-4">
      {/* Color Legend */}
      <div className="flex flex-wrap justify-end items-center gap-2 sm:gap-3 font-mono text-[9px] uppercase tracking-wider text-muted">
        <span>Score:</span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm inline-block" style={{backgroundColor: isDark ? 'rgba(220,50,50,0.3)' : 'rgba(220,50,50,0.2)'}}></span>
          Low (&lt;4)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm inline-block" style={{backgroundColor: isDark ? 'rgba(200,130,50,0.3)' : 'rgba(200,130,50,0.2)'}}></span>
          Mid (4–7)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm inline-block" style={{backgroundColor: isDark ? 'rgba(50,180,90,0.3)' : 'rgba(50,180,90,0.2)'}}></span>
          High (&gt;7)
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {sortedSectors.map(sector => (
          <div key={sector} className="card-base p-4 sm:p-6 rounded-card hover:border-brand/30 transition-colors">
            <h3 className="font-mono text-xs sm:text-sm text-primary uppercase tracking-widest mb-3 sm:mb-4 border-b border-border pb-2 font-semibold">
              {sector}
            </h3>
            <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
              {sectorMap[sector].map(stock => {
                const s = Number(stock.Composite_Score || 0)
                const colors = getHeatmapColor(s, isDark)
                return (
                  <div
                    key={stock.Ticker}
                    onClick={() => onSelect(stock.Ticker)}
                    className="flex flex-col items-center justify-center px-1.5 sm:px-2 py-2 sm:py-2.5 border transition-all duration-200 cursor-pointer hover:scale-105 hover:shadow-md rounded-lg active:scale-95"
                    style={colors}
                    title={`${stock.Ticker.replace('.NS', '')} — Score: ${s.toFixed(2)} | Sector: ${sector}`}
                  >
                    <span className="font-mono text-[9px] sm:text-[10px] uppercase tracking-wider font-medium leading-tight">
                      {stock.Ticker.replace('.NS', '')}
                    </span>
                    <span className="font-mono text-[8px] sm:text-[9px] mt-0.5 opacity-70">
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
