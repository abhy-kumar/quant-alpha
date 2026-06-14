import type { DashboardData } from '../types'
import { num, colorCode } from './shared'
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer } from 'recharts'

interface Props {
  topPicks: DashboardData[]
  horizon: 'short' | 'long'
  setHorizon: (h: 'short' | 'long') => void
  onSelect: (ticker: string) => void
  isDark: boolean
  sparklineData: Record<string, { time: string; close: number }[]>
}

function ScoreRadar({ stock, isDark }: { stock: DashboardData; isDark: boolean }) {
  // Normalize all axes to 0–10 scale for a fair polygon shape
  const radarData = [
    { axis: 'Tech', value: Math.max(0, Math.min(10, (Number(stock.Tech_Score) + 1) * 5)) },
    { axis: 'Fund', value: Math.max(0, Math.min(10, Number(stock.Fund_Score) || 0)) },
    { axis: 'Research', value: Math.max(0, Math.min(10, Number(stock.Research_Score) || 0)) },
    { axis: 'Momentum', value: Math.max(0, Math.min(10, ((Number(stock.Momentum_12M) || 0) + 0.3) * 12)) },
    { axis: 'Piotroski', value: Math.max(0, Math.min(10, (Number(stock.Piotroski_F) || 0) * (10 / 9))) },
  ]
  return (
    <ResponsiveContainer width="100%" height="100%">
      <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="65%">
        <PolarGrid stroke={isDark ? '#27272A' : '#e2e8f0'} />
        <PolarAngleAxis
          dataKey="axis"
          tick={{ fill: isDark ? '#71717A' : '#64748b', fontSize: 9, fontFamily: 'Space Mono' }}
        />
        <Radar
          name="Score"
          dataKey="value"
          stroke="#C8102E"
          fill="#C8102E"
          fillOpacity={0.18}
          strokeWidth={1.5}
        />
      </RadarChart>
    </ResponsiveContainer>
  )
}

export default function SignalsTab({ topPicks, horizon, setHorizon, onSelect, isDark }: Props) {
  return (
    <div className="space-y-8">
      <section className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="h-6 w-1 bg-brand rounded-full"></div>
          <h2 className="font-display font-bold text-xl tracking-wide text-primary">
            High Conviction Signals
          </h2>
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-brand"></span>
          </span>
        </div>

        <div className="flex bg-card border border-border p-0.5">
          <button
            onClick={() => setHorizon('short')}
            className={`px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest transition-all ${horizon === 'short' ? 'bg-brand text-white' : 'text-muted hover:text-primary'}`}
          >
            Short Term
          </button>
          <button
            onClick={() => setHorizon('long')}
            className={`px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest transition-all ${horizon === 'long' ? 'bg-brand text-white' : 'text-muted hover:text-primary'}`}
          >
            Long Term
          </button>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {topPicks.map((stock, i) => {
          const convictionColor =
            stock.Conviction === 'Strong Buy'
              ? 'border-green-500 text-green-600 dark:text-green-400 bg-green-500/10'
              : stock.Conviction === 'Buy'
              ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-500/10'
              : 'border-border text-muted'

          const composite = Number(stock.Composite_Score) || 0

          return (
            <div
              key={stock.Ticker}
              onClick={() => onSelect(stock.Ticker)}
              className="p-6 border border-border bg-card shadow-sm hover:shadow-lg hover:border-brand/50 transition-all duration-300 cursor-pointer group"
            >
              {/* Header row */}
              <div className="flex items-center justify-between mb-3">
                <span className="font-mono text-[10px] text-sub uppercase tracking-widest group-hover:text-brand transition-colors">
                  #{i + 1} · {horizon === 'short' ? 'Momentum' : 'Value'}
                </span>
                <span className={`font-mono text-[10px] px-2 py-0.5 border rounded-sm ${convictionColor}`}>
                  {stock.Conviction || 'N/A'}
                </span>
              </div>

              {/* Ticker + Sector */}
              <div className="mb-4">
                <h3 className="font-display font-semibold text-2xl text-primary leading-none">
                  {stock.Ticker.replace('.NS', '')}<span className="text-brand">.</span>
                </h3>
                <div className="font-mono text-[10px] text-brand tracking-widest mt-1 uppercase">
                  {stock.Sector || 'Equities'}
                </div>
              </div>

              {/* Composite score + Radar */}
              <div className="flex items-center gap-4 mb-4 py-3 border-y border-border">
                {/* Composite score block */}
                <div className="flex flex-col items-center justify-center w-20 shrink-0">
                  <span className="font-mono text-[9px] text-muted uppercase tracking-wider">Composite</span>
                  <span
                    className={`font-display text-3xl font-bold leading-none mt-1 ${
                      composite >= 7 ? 'text-green-600 dark:text-green-400' :
                      composite >= 4 ? 'text-primary' :
                      'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {composite.toFixed(1)}
                  </span>
                  <span className="font-mono text-[8px] text-muted">/10</span>
                </div>

                {/* Radar chart */}
                <div className="flex-1 h-[140px]">
                  <ScoreRadar stock={stock} isDark={isDark} />
                </div>
              </div>

              {/* Metrics grid */}
              <div className="grid grid-cols-3 gap-x-2 gap-y-3 font-mono text-[10px]">
                <div className="flex flex-col">
                  <span className="text-muted">Piotroski</span>
                  <span className={`font-semibold ${Number(stock.Piotroski_F) >= 7 ? 'text-green-600 dark:text-green-500' : Number(stock.Piotroski_F) <= 3 ? 'text-red-600 dark:text-red-500' : 'text-primary'}`}>
                    {stock.Piotroski_F ?? '-'}/9
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-muted">12M Mom</span>
                  <span className={`font-semibold ${colorCode(stock.Momentum_12M)}`}>
                    {stock.Momentum_12M != null ? `${(stock.Momentum_12M * 100).toFixed(1)}%` : 'N/A'}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-muted">P/E</span>
                  <span className="text-primary">{num(stock['P/E'])}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-muted">ROE</span>
                  <span className="text-primary">{num(stock['ROE_%'])}%</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-muted">Mkt Cap</span>
                  <span className="text-primary">{num(stock.Market_Cap_B)}B</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-muted">Vol 60D</span>
                  <span className={`font-semibold ${Number(stock.Vol_60D) < 25 ? 'text-green-600 dark:text-green-500' : Number(stock.Vol_60D) > 40 ? 'text-red-600 dark:text-red-500' : 'text-primary'}`}>
                    {num(stock.Vol_60D)}%
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
