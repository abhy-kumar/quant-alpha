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
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-6 w-1 bg-brand rounded-full"></div>
        <h2 className="font-display font-bold text-xl tracking-wide text-primary">Sector Heatmap</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Object.keys(sectorMap).map(sector => (
          <div key={sector} className="border border-border bg-card p-6 shadow-sm hover:border-brand/50 transition-colors">
            <h3 className="font-mono text-sm text-primary uppercase tracking-widest mb-4 border-b border-border pb-2 font-semibold">
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
                    className="flex flex-col items-center justify-center px-2 py-2.5 border transition-all duration-200 cursor-pointer hover:scale-105 hover:shadow-md rounded-sm"
                    style={colors}
                    title={`${stock.Ticker.replace('.NS', '')} — Score: ${s.toFixed(2)} | Sector: ${sector}`}
                  >
                    <span className="font-mono text-[10px] uppercase tracking-wider font-medium leading-tight">
                      {stock.Ticker.replace('.NS', '')}
                    </span>
                    <span className="font-mono text-[9px] mt-0.5 opacity-70">
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
