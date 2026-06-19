import type { DashboardData } from '../types'
import { num } from './shared'

interface Props {
  topPicks: DashboardData[]
  horizon: 'short' | 'long'
  setHorizon: (h: 'short' | 'long') => void
  onSelect: (ticker: string) => void
  isDark: boolean
  sparklineData: Record<string, { time: string; close: number }[]>
}

function ScoreRing({ score, size = 56 }: { score: number; size?: number }) {
  const radius = (size - 6) / 2
  const circumference = 2 * Math.PI * radius
  const progress = (score / 10) * circumference
  const color = score >= 7 ? 'var(--green)' : score >= 4 ? 'var(--blue)' : 'var(--red)'

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="var(--border-color)" strokeWidth={3} />
        <circle
          cx={size/2} cy={size/2} r={radius} fill="none"
          stroke={color}
          strokeWidth={3}
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          strokeLinecap="round"
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold font-data leading-none" style={{ color }}>{score.toFixed(1)}</span>
        <span className="text-[9px] mt-0.5" style={{ color: 'var(--text-sub)' }}>/10</span>
      </div>
    </div>
  )
}

function MetricBar({ label, value, max, display, color }: { label: string; value: number; max: number; display: string; color?: string }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  return (
    <div className="flex items-center gap-3">
      <span className="text-[11px] w-16 shrink-0" style={{ color: 'var(--text-sub)' }}>{label}</span>
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border-color)' }}>
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color || 'var(--brand)' }} />
      </div>
      <span className="text-[12px] font-data font-medium w-16 text-right shrink-0" style={{ color: 'var(--text-main)' }}>{display}</span>
    </div>
  )
}

function FeaturedCard({ stock, onSelect, rank }: { stock: DashboardData; onSelect: (t: string) => void; rank: number }) {
  const composite = Number(stock.Composite_Score) || 0
  const change = Number(stock['1d_Chg_%']) || 0
  const price = Number(stock.Price) || 0

  return (
    <div
      onClick={() => onSelect(stock.Ticker)}
      className="rounded-2xl p-6 cursor-pointer transition-all duration-300"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow)' }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = 'var(--shadow-md)'
        e.currentTarget.style.transform = 'translateY(-1px)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = 'var(--shadow)'
        e.currentTarget.style.transform = 'translateY(0)'
      }}
    >
      {/* Top row: rank + conviction */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-medium" style={{ color: 'var(--text-sub)' }}>#{rank} &middot; {stock.Sector || 'Equities'}</span>
        <span
          className="px-2.5 py-1 text-[11px] font-medium rounded-full"
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

      {/* Ticker + price row */}
      <div className="flex items-end justify-between mb-6">
        <div>
          <h2 className="text-4xl font-bold tracking-tight" style={{ color: 'var(--text-main)' }}>
            {stock.Ticker.replace('.NS', '')}
          </h2>
          <div className="flex items-baseline gap-3 mt-2">
            <span className="text-lg font-data font-medium" style={{ color: 'var(--text-main)' }}>
              ₹{price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="flex items-center gap-1 text-sm font-data font-medium" style={{ color: change >= 0 ? 'var(--green)' : 'var(--red)' }}>
              {change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(2)}%
            </span>
          </div>
        </div>
        <ScoreRing score={composite} size={64} />
      </div>

      {/* Metric bars */}
      <div className="space-y-2.5">
        <MetricBar label="Piotroski" value={Number(stock.Piotroski_F) || 0} max={9} display={`${stock.Piotroski_F ?? '-'}/9`}
          color={Number(stock.Piotroski_F) >= 7 ? 'var(--green)' : Number(stock.Piotroski_F) <= 3 ? 'var(--red)' : 'var(--brand)'} />
        <MetricBar label="12M Mom" value={Math.abs(Number(stock.Momentum_12M) || 0) * 100} max={200}
          display={stock.Momentum_12M != null ? `${(stock.Momentum_12M * 100).toFixed(1)}%` : 'N/A'}
          color={Number(stock.Momentum_12M) > 0 ? 'var(--green)' : 'var(--red)'} />
        <MetricBar label="ROE" value={Number(stock['ROE_%']) || 0} max={50}
          display={`${num(stock['ROE_%'])}%`} />
        <MetricBar label="Mkt Cap" value={Math.log10(Number(stock.Market_Cap_B) || 1)} max={6}
          display={`${num(stock.Market_Cap_B)}B`} />
        <MetricBar label="Vol 60D" value={Number(stock.Vol_60D) || 0} max={80}
          display={`${num(stock.Vol_60D)}%`}
          color={Number(stock.Vol_60D) < 25 ? 'var(--green)' : Number(stock.Vol_60D) > 40 ? 'var(--red)' : 'var(--brand)'} />
        <MetricBar label="P/E" value={Math.min(Number(stock['P/E']) || 0, 300)} max={300}
          display={num(stock['P/E'])} />
      </div>
    </div>
  )
}

function CompactCard({ stock, onSelect, rank }: { stock: DashboardData; onSelect: (t: string) => void; rank: number }) {
  const composite = Number(stock.Composite_Score) || 0
  const change = Number(stock['1d_Chg_%']) || 0
  const price = Number(stock.Price) || 0

  return (
    <div
      onClick={() => onSelect(stock.Ticker)}
      className="rounded-2xl p-5 cursor-pointer transition-all duration-300"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow)' }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = 'var(--shadow-md)'
        e.currentTarget.style.transform = 'translateY(-1px)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = 'var(--shadow)'
        e.currentTarget.style.transform = 'translateY(0)'
      }}
    >
      {/* Header: rank + conviction */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-medium" style={{ color: 'var(--text-sub)' }}>#{rank}</span>
        <span
          className="px-2 py-0.5 text-[10px] font-medium rounded-full"
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

      {/* Ticker + score */}
      <div className="flex items-start justify-between mb-1">
        <h3 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-main)' }}>
          {stock.Ticker.replace('.NS', '')}
        </h3>
        <ScoreRing score={composite} size={44} />
      </div>

      {/* Price + change */}
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-sm font-data font-medium" style={{ color: 'var(--text-main)' }}>
          ₹{price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
        <span className="text-xs font-data font-medium" style={{ color: change >= 0 ? 'var(--green)' : 'var(--red)' }}>
          {change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(2)}%
        </span>
      </div>

      {/* Sector */}
      <p className="text-xs mb-4" style={{ color: 'var(--brand)' }}>{stock.Sector || 'Equities'}</p>

      {/* Metrics */}
      <div className="space-y-2">
        <MetricBar label="Piotroski" value={Number(stock.Piotroski_F) || 0} max={9} display={`${stock.Piotroski_F ?? '-'}/9`}
          color={Number(stock.Piotroski_F) >= 7 ? 'var(--green)' : 'var(--red)'} />
        <MetricBar label="12M Mom" value={Math.abs(Number(stock.Momentum_12M) || 0) * 100} max={200}
          display={stock.Momentum_12M != null ? `${(stock.Momentum_12M * 100).toFixed(1)}%` : 'N/A'}
          color={Number(stock.Momentum_12M) > 0 ? 'var(--green)' : 'var(--red)'} />
        <MetricBar label="Vol 60D" value={Number(stock.Vol_60D) || 0} max={80}
          display={`${num(stock.Vol_60D)}%`}
          color={Number(stock.Vol_60D) < 25 ? 'var(--green)' : Number(stock.Vol_60D) > 40 ? 'var(--red)' : 'var(--brand)'} />
      </div>
    </div>
  )
}

export default function SignalsTab({ topPicks, horizon, setHorizon, onSelect }: Props) {
  const [first, second, third] = topPicks

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold" style={{ color: 'var(--text-main)' }}>Signals</h1>
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

      {/* #1 Featured */}
      {first && <FeaturedCard stock={first} onSelect={onSelect} rank={1} />}

      {/* #2 and #3 side by side */}
      {(second || third) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {second && <CompactCard stock={second} onSelect={onSelect} rank={2} />}
          {third && <CompactCard stock={third} onSelect={onSelect} rank={3} />}
        </div>
      )}
    </div>
  )
}
