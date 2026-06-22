import { useMemo } from 'react'
import type { OutcomeAccuracy } from '../types'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell, ReferenceLine } from 'recharts'
import { FlaskConical, Clock, TrendingUp, CheckCircle } from 'lucide-react'

interface Props {
  outcomeAccuracy: Record<string, OutcomeAccuracy>
  firstScanDate: string
  isDark: boolean
}

const COLORS = {
  'Strong Buy': 'var(--green)',
  'Buy':        'var(--blue)',
  'Hold':       'var(--amber)',
  'Caution':    '#E07C00',
  'Avoid':      'var(--red)',
}

const CONVICTION_ORDER = ['Strong Buy', 'Buy', 'Hold', 'Caution', 'Avoid']

function tradingDaysBetween(from: Date, to: Date): number {
  let count = 0
  const cur = new Date(from)
  cur.setDate(cur.getDate() + 1)
  while (cur <= to) {
    const dow = cur.getDay()
    if (dow !== 0 && dow !== 6) count++
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

function addTradingDays(from: Date, n: number): Date {
  const result = new Date(from)
  let added = 0
  while (added < n) {
    result.setDate(result.getDate() + 1)
    const dow = result.getDay()
    if (dow !== 0 && dow !== 6) added++
  }
  return result
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

const tooltipStyle = (isDark: boolean) => ({
  backgroundColor: isDark ? '#111318' : '#ffffff',
  borderColor: isDark ? '#1E2230' : '#E4E7EC',
  borderRadius: 'var(--radius)',
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: '12px',
  color: isDark ? '#E8ECF2' : '#1A1D26',
  boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.4)' : '0 8px 32px rgba(0,0,0,0.08)',
  padding: '10px 14px',
})

export default function FactorLabTab({ outcomeAccuracy, firstScanDate, isDark }: Props) {
  const entries = Object.entries(outcomeAccuracy).filter(([, v]) => v.n > 0)

  const countdown = useMemo(() => {
    if (!firstScanDate) return null
    const start = new Date(firstScanDate)
    const now = new Date()
    const elapsed = tradingDaysBetween(start, now)
    const target21 = addTradingDays(start, 21)
    const target63 = addTradingDays(start, 63)
    const remaining21 = Math.max(0, 21 - elapsed)
    const remaining63 = Math.max(0, 63 - elapsed)
    return { start, elapsed, target21, target63, remaining21, remaining63 }
  }, [firstScanDate])

  if (entries.length > 0) {
    const sorted = [...entries].sort((a, b) => CONVICTION_ORDER.indexOf(a[0]) - CONVICTION_ORDER.indexOf(b[0]))
    const chartData = sorted.map(([conviction, data]) => ({
      conviction,
      '21D Return': data.avg_return_21d ?? 0,
      '63D Return': data.avg_return_63d ?? 0,
      n: data.n,
    }))

    return (
      <div className="space-y-5">
        {/* Progress bar */}
        {countdown && (
          <div className="flex flex-wrap items-center gap-4 px-5 py-3 text-xs card" style={{ borderRadius: 'var(--radius-xl)' }}>
            <span className="font-semibold" style={{ color: 'var(--brand)' }}>Active</span>
            <span style={{ color: 'var(--text-2)' }}>{countdown.elapsed} trading days of data</span>
            {countdown.remaining63 > 0 && (
              <span style={{ color: 'var(--text-3)' }}>{countdown.remaining63} days to 63D coverage</span>
            )}
            <span className="sm:ml-auto" style={{ color: 'var(--text-3)' }}>First scan: {formatDate(countdown.start)}</span>
          </div>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
          {sorted.map(([conviction, data]) => {
            const winRate = data.win_rate_21d ?? 0
            return (
              <div key={conviction} className="p-4 card" style={{ borderRadius: 'var(--radius-xl)' }}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[conviction as keyof typeof COLORS] || 'var(--text-3)' }} />
                  <span className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>{conviction}</span>
                </div>
                <p className="text-xs mb-3" style={{ color: 'var(--text-3)' }}>{data.n} samples</p>
                <div className="space-y-2">
                  <div>
                    <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>Win Rate 21D</p>
                    <p style={{
                      fontFamily: "'DM Serif Display', serif",
                      fontSize: 20, fontWeight: 700,
                      color: winRate >= 60 ? 'var(--green)' : winRate >= 45 ? 'var(--amber)' : 'var(--red)'
                    }}>
                      {data.win_rate_21d != null ? `${data.win_rate_21d}%` : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>Avg Return 21D</p>
                    <p className="text-sm font-medium font-mono" style={{ color: (data.avg_return_21d ?? 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {data.avg_return_21d != null ? `${data.avg_return_21d > 0 ? '+' : ''}${data.avg_return_21d}%` : '-'}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Bar chart */}
        <div className="card p-5" style={{ borderRadius: 'var(--radius-xl)' }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text)' }}>Average Forward Returns by Conviction</h3>
          <div style={{ width: '75%', margin: '0 auto', height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="conviction" stroke="var(--border)" tick={{ fill: 'var(--text-3)', fontSize: 10, fontFamily: 'Inter, system-ui, sans-serif' }} />
                <YAxis stroke="var(--border)" tick={{ fill: 'var(--text-3)', fontSize: 10, fontFamily: 'Inter, system-ui, sans-serif' }} />
                <Tooltip contentStyle={tooltipStyle(isDark)} />
                <ReferenceLine y={0} stroke="var(--text-3)" strokeDasharray="3 3"
                  label={{ value: 'Break-even', position: 'insideTopRight', fontSize: 9, fill: 'var(--text-3)' }}/>
                <Legend wrapperStyle={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '10px' }} />
                <Bar dataKey="21D Return" maxBarSize={44} radius={[4, 4, 0, 0]}>
                  {chartData.map((entry) => (
                    <Cell key={entry.conviction} fill={COLORS[entry.conviction as keyof typeof COLORS] || 'var(--text-3)'} fillOpacity={0.85} />
                  ))}
                </Bar>
                <Bar dataKey="63D Return" maxBarSize={44} radius={[4, 4, 0, 0]}>
                  {chartData.map((entry) => (
                    <Cell key={entry.conviction} fill={COLORS[entry.conviction as keyof typeof COLORS] || 'var(--text-3)'} fillOpacity={0.35} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    )
  }

  /* Empty state: countdown */
  const pct21 = countdown ? Math.min(100, Math.round((countdown.elapsed / 21) * 100)) : 0
  const pct63 = countdown ? Math.min(100, Math.round((countdown.elapsed / 63) * 100)) : 0

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="p-6 sm:p-8 card" style={{ borderRadius: 'var(--radius-xl)' }}>
        <div className="flex items-start gap-4 mb-6">
          <div className="p-3" style={{ background: 'var(--brand-soft)', borderRadius: 'var(--radius)' }}>
            <FlaskConical size={20} style={{ color: 'var(--brand)' }} />
          </div>
          <div>
            <h2 className="text-base font-semibold mb-1" style={{ color: 'var(--text)' }}>Factor Lab</h2>
            <p className="text-sm leading-relaxed max-w-xl" style={{ color: 'var(--text-2)' }}>
              Tracks whether the model's conviction ratings actually predict returns. Each scan records
              which stocks were rated Strong Buy / Buy / Hold / Caution / Avoid. Once enough time has
              passed, the system backfills actual forward returns and shows win rates and average returns
              per conviction level.
            </p>
          </div>
        </div>

        {/* Milestones */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="p-5 glass" style={{ borderRadius: 'var(--radius-lg)' }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <TrendingUp size={14} style={{ color: 'var(--brand)' }} />
                <span className="text-xs font-semibold" style={{ color: 'var(--brand)' }}>21-Day Window</span>
              </div>
              {countdown && countdown.remaining21 === 0 ? (
                <span className="flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--green)' }}>
                  <CheckCircle size={12} /> Ready
                </span>
              ) : (
                <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                  {countdown ? `${countdown.remaining21} days left` : '-'}
                </span>
              )}
            </div>
            <div className="h-1.5 rounded-full overflow-hidden mb-3" style={{ background: 'var(--border)' }}>
              <div className="h-full rounded-full" style={{ width: `${pct21}%`, background: pct21 >= 100 ? 'var(--green)' : 'var(--brand)', transition: 'width 500ms var(--ease-out)' }} />
            </div>
            <div className="flex justify-between text-[11px]" style={{ color: 'var(--text-3)' }}>
              <span>{countdown ? `${countdown.elapsed} / 21 trading days` : '-'}</span>
              <span>{countdown ? `Unlocks ${formatDate(countdown.target21)}` : '-'}</span>
            </div>
          </div>

          <div className="p-5 glass" style={{ borderRadius: 'var(--radius-lg)' }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Clock size={14} style={{ color: 'var(--brand)' }} />
                <span className="text-xs font-semibold" style={{ color: 'var(--brand)' }}>63-Day Window</span>
              </div>
              {countdown && countdown.remaining63 === 0 ? (
                <span className="flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--green)' }}>
                  <CheckCircle size={12} /> Ready
                </span>
              ) : (
                <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                  {countdown ? `${countdown.remaining63} days left` : '-'}
                </span>
              )}
            </div>
            <div className="h-1.5 rounded-full overflow-hidden mb-3" style={{ background: 'var(--border)' }}>
              <div className="h-full rounded-full" style={{ width: `${pct63}%`, background: pct63 >= 100 ? 'var(--green)' : 'var(--brand)', transition: 'width 500ms var(--ease-out)' }} />
            </div>
            <div className="flex justify-between text-[11px]" style={{ color: 'var(--text-3)' }}>
              <span>{countdown ? `${countdown.elapsed} / 63 trading days` : '-'}</span>
              <span>{countdown ? `Unlocks ${formatDate(countdown.target63)}` : '-'}</span>
            </div>
          </div>
        </div>

        {/* Warmer countdown copy */}
        {countdown && countdown.remaining21 > 0 && (
          <div className="mt-4 p-4 glass-subtle" style={{ borderRadius: 'var(--radius-lg)' }}>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-2)' }}>
              Alpha is building its track record. Forward returns unlock on <strong>{formatDate(countdown.target21)}</strong> - the Factor Lab will then show whether each conviction level actually predicts outperformance.
            </p>
          </div>
        )}
      </div>

      {/* Pipeline status */}
      {countdown && (
        <div className="flex items-center gap-2 px-5 py-3 text-xs card" style={{ borderRadius: 'var(--radius-xl)' }}>
          <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--green)' }} />
          <span style={{ color: 'var(--text-2)' }}>Outcome tracking active since <span className="font-medium" style={{ color: 'var(--text)' }}>{formatDate(countdown.start)}</span></span>
          <span className="sm:ml-auto" style={{ color: 'var(--text-3)' }}>{countdown.elapsed} trading days recorded</span>
        </div>
      )}
    </div>
  )
}
