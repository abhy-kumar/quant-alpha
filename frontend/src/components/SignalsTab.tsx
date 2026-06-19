import type { DashboardData } from '../types'
import { num } from './shared'
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
        <PolarGrid stroke={isDark ? '#1E293B' : '#E5E7EB'} />
        <PolarAngleAxis
          dataKey="axis"
          tick={{ fill: isDark ? '#64748B' : '#9CA3AF', fontSize: 10, fontFamily: 'Inter, system-ui, sans-serif' }}
        />
        <Radar
          name="Score"
          dataKey="value"
          stroke="var(--brand)"
          fill="var(--brand)"
          fillOpacity={0.12}
          strokeWidth={1.5}
        />
      </RadarChart>
    </ResponsiveContainer>
  )
}

export default function SignalsTab({ topPicks, horizon, setHorizon, onSelect, isDark }: Props) {
  return (
    <div className="space-y-6">
      {/* Section header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text-main)' }}>High Conviction Signals</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-sub)' }}>
            Top picks ranked by composite score across technical, fundamental, and research dimensions.
          </p>
        </div>
        <div className="inline-flex rounded-lg p-0.5" style={{ background: 'var(--border-color)' }}>
          {(['short', 'long'] as const).map(h => (
            <button
              key={h}
              onClick={() => setHorizon(h)}
              className="px-4 py-1.5 text-[13px] font-medium rounded-md transition-all"
              style={{
                background: horizon === h ? 'var(--bg-card)' : 'transparent',
                color: horizon === h ? 'var(--text-main)' : 'var(--text-sub)',
                boxShadow: horizon === h ? 'var(--shadow-sm)' : 'none',
              }}
            >
              {h === 'short' ? 'Short Term' : 'Long Term'}
            </button>
          ))}
        </div>
      </div>

      {/* Picks */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {topPicks.map((stock, i) => {
          const composite = Number(stock.Composite_Score) || 0

          return (
            <div
              key={stock.Ticker}
              onClick={() => onSelect(stock.Ticker)}
              className="rounded-2xl p-5 cursor-pointer transition-all duration-300 group"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                boxShadow: 'var(--shadow)',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.boxShadow = 'var(--shadow-md)'
                e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--brand) 25%, var(--border-color))'
                e.currentTarget.style.transform = 'translateY(-1px)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.boxShadow = 'var(--shadow)'
                e.currentTarget.style.borderColor = 'var(--border-color)'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              {/* Rank + conviction */}
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs" style={{ color: 'var(--text-sub)' }}>#{i + 1} &middot; {horizon === 'short' ? 'Momentum' : 'Value'}</span>
                <span
                  className="px-2 py-0.5 text-[11px] font-medium rounded-full"
                  style={
                    stock.Conviction === 'Strong Buy'
                      ? { background: 'var(--green-bg)', color: 'var(--green)' }
                      : stock.Conviction === 'Buy'
                      ? { background: 'var(--blue-bg)', color: 'var(--blue)' }
                      : { background: 'var(--brand-soft)', color: 'var(--text-muted)' }
                  }
                >
                  {stock.Conviction || 'N/A'}
                </span>
              </div>

              {/* Ticker + sector */}
              <div className="mb-5">
                <h2 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-main)' }}>
                  {stock.Ticker.replace('.NS', '')}
                </h2>
                <p className="text-sm mt-0.5" style={{ color: 'var(--brand)' }}>{stock.Sector || 'Equities'}</p>
              </div>

              {/* Score + Radar */}
              <div className="flex items-center gap-4 mb-5 py-4" style={{ borderTop: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)' }}>
                <div className="flex flex-col items-center shrink-0 w-20">
                  <span className="text-[11px]" style={{ color: 'var(--text-sub)' }}>Composite</span>
                  <span
                    className="text-4xl font-bold mt-1 leading-none font-data"
                    style={{
                      color: composite >= 7 ? 'var(--green)' : composite >= 4 ? 'var(--text-main)' : 'var(--red)',
                    }}
                  >
                    {composite.toFixed(1)}
                  </span>
                  <span className="text-[11px] mt-0.5" style={{ color: 'var(--text-sub)' }}>/10</span>
                </div>
                <div className="flex-1 h-[140px] w-full">
                  <ScoreRadar stock={stock} isDark={isDark} />
                </div>
              </div>

              {/* Metrics */}
              <div className="grid grid-cols-3 gap-x-3 gap-y-2.5 text-[12px]">
                {[
                  { label: 'Piotroski', value: `${stock.Piotroski_F ?? '-'}/9`, color: Number(stock.Piotroski_F) >= 7 ? 'var(--green)' : Number(stock.Piotroski_F) <= 3 ? 'var(--red)' : undefined },
                  { label: '12M Mom', value: stock.Momentum_12M != null ? `${(stock.Momentum_12M * 100).toFixed(1)}%` : 'N/A', color: Number(stock.Momentum_12M) > 0 ? 'var(--green)' : Number(stock.Momentum_12M) < 0 ? 'var(--red)' : undefined },
                  { label: 'P/E', value: num(stock['P/E']) },
                  { label: 'ROE', value: `${num(stock['ROE_%'])}%` },
                  { label: 'Mkt Cap', value: `${num(stock.Market_Cap_B)}B` },
                  { label: 'Vol 60D', value: `${num(stock.Vol_60D)}%`, color: Number(stock.Vol_60D) < 25 ? 'var(--green)' : Number(stock.Vol_60D) > 40 ? 'var(--red)' : undefined },
                ].map(m => (
                  <div key={m.label}>
                    <span className="text-[11px]" style={{ color: 'var(--text-sub)' }}>{m.label}</span>
                    <p className="text-[13px] font-medium font-data mt-0.5" style={{ color: m.color || 'var(--text-main)' }}>{m.value}</p>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
