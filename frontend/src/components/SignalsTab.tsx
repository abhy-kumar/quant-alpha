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
        <PolarGrid stroke={isDark ? '#1A2535' : '#D6DCE5'} />
        <PolarAngleAxis
          dataKey="axis"
          tick={{ fill: isDark ? '#4E6478' : '#7B8FA6', fontSize: 9, fontFamily: 'Space Mono' }}
        />
        <Radar
          name="Score"
          dataKey="value"
          stroke="var(--brand)"
          fill="var(--brand)"
          fillOpacity={0.15}
          strokeWidth={1.5}
        />
      </RadarChart>
    </ResponsiveContainer>
  )
}

export default function SignalsTab({ topPicks, horizon, setHorizon, onSelect, isDark }: Props) {
  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <div className="flex bg-card border border-border p-0.5 rounded-lg shadow-sm">
          <button
            onClick={() => setHorizon('short')}
            className={`px-4 py-1.5 font-mono text-[10px] uppercase tracking-widest transition-all rounded-md ${horizon === 'short' ? 'bg-brand text-background shadow-sm font-semibold' : 'text-muted hover:text-primary'}`}
          >
            Short Term
          </button>
          <button
            onClick={() => setHorizon('long')}
            className={`px-4 py-1.5 font-mono text-[10px] uppercase tracking-widest transition-all rounded-md ${horizon === 'long' ? 'bg-brand text-background shadow-sm font-semibold' : 'text-muted hover:text-primary'}`}
          >
            Long Term
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
        {topPicks.map((stock, i) => {
          const convictionColor =
            stock.Conviction === 'Strong Buy'
              ? 'border-green-500/50 text-green-600 dark:text-green-400 bg-green-500/10'
              : stock.Conviction === 'Buy'
              ? 'border-blue-500/50 text-blue-600 dark:text-blue-400 bg-blue-500/10'
              : 'border-border text-muted'

          const composite = Number(stock.Composite_Score) || 0

          return (
            <div
              key={stock.Ticker}
              onClick={() => onSelect(stock.Ticker)}
              className="card-base p-4 sm:p-6 rounded-card cursor-pointer group active:scale-[0.98] transition-all"
            >
              {/* Header row */}
              <div className="flex items-center justify-between mb-3">
                <span className="font-mono text-[9px] text-sub uppercase tracking-widest group-hover:text-brand transition-colors">
                  #{i + 1} &middot; {horizon === 'short' ? 'Momentum' : 'Value'}
                </span>
                <span className={`font-mono text-[9px] px-2 py-0.5 border rounded-md ${convictionColor}`}>
                  {stock.Conviction || 'N/A'}
                </span>
              </div>

              {/* Ticker + Sector */}
              <div className="mb-4">
                <h3 className="font-display font-bold text-2xl text-primary leading-none tracking-tight">
                  {stock.Ticker.replace('.NS', '')}<span className="text-brand">.</span>
                </h3>
                <div className="font-mono text-[10px] text-brand tracking-widest mt-1.5 uppercase opacity-80">
                  {stock.Sector || 'Equities'}
                </div>
              </div>

              {/* Composite score + Radar */}
              <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 mb-4 py-3 border-y border-border/60">
                <div className="flex flex-col items-center justify-center w-16 sm:w-20 shrink-0">
                  <span className="font-mono text-[8px] sm:text-[9px] text-sub uppercase tracking-wider">Composite</span>
                  <span
                    className={`font-display text-3xl font-bold leading-none mt-1 ${
                      composite >= 7 ? 'text-green-600 dark:text-green-400' :
                      composite >= 4 ? 'text-primary' :
                      'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {composite.toFixed(1)}
                  </span>
                  <span className="font-mono text-[8px] text-sub">/10</span>
                </div>

                <div className="flex-1 h-[140px] w-full">
                  <ScoreRadar stock={stock} isDark={isDark} />
                </div>
              </div>

              {/* Metrics grid */}
              <div className="grid grid-cols-3 gap-x-2 gap-y-2.5 sm:gap-y-3 font-mono text-[9px] sm:text-[10px]">
                <div className="flex flex-col">
                  <span className="text-sub">Piotroski</span>
                  <span className={`font-semibold ${Number(stock.Piotroski_F) >= 7 ? 'text-green-600 dark:text-green-400' : Number(stock.Piotroski_F) <= 3 ? 'text-red-600 dark:text-red-400' : 'text-primary'}`}>
                    {stock.Piotroski_F ?? '-'}/9
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-sub">12M Mom</span>
                  <span className={`font-semibold ${colorCode(stock.Momentum_12M)}`}>
                    {stock.Momentum_12M != null ? `${(stock.Momentum_12M * 100).toFixed(1)}%` : 'N/A'}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-sub">P/E</span>
                  <span className="text-primary">{num(stock['P/E'])}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-sub">ROE</span>
                  <span className="text-primary">{num(stock['ROE_%'])}%</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-sub">Mkt Cap</span>
                  <span className="text-primary">{num(stock.Market_Cap_B)}B</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-sub">Vol 60D</span>
                  <span className={`font-semibold ${Number(stock.Vol_60D) < 25 ? 'text-green-600 dark:text-green-400' : Number(stock.Vol_60D) > 40 ? 'text-red-600 dark:text-red-400' : 'text-primary'}`}>
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
