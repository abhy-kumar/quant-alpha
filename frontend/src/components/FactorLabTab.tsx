import { useMemo } from 'react'
import type { OutcomeAccuracy } from '../types'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts'
import { FlaskConical, Clock, TrendingUp, CheckCircle } from 'lucide-react'

interface Props {
  outcomeAccuracy: Record<string, OutcomeAccuracy>
  firstScanDate: string
  isDark: boolean
}

const COLORS = {
  'Strong Buy': '#22c55e',
  'Buy':        '#3b82f6',
  'Hold':       '#f59e0b',
  'Caution':    '#f97316',
  'Avoid':      '#ef4444',
}

const CONVICTION_ORDER = ['Strong Buy', 'Buy', 'Hold', 'Caution', 'Avoid']

/** Count trading days (Mon–Fri) between two dates, exclusive of start */
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

/** Add N trading days (Mon–Fri) to a date */
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

export default function FactorLabTab({ outcomeAccuracy, firstScanDate, isDark }: Props) {
  const entries = Object.entries(outcomeAccuracy).filter(([, v]) => v.n > 0)

  const countdown = useMemo(() => {
    if (!firstScanDate) return null
    const start = new Date(firstScanDate)
    const now = new Date()
    const elapsed = tradingDaysBetween(start, now)
    const target21  = addTradingDays(start, 21)
    const target63  = addTradingDays(start, 63)
    const remaining21 = Math.max(0, 21 - elapsed)
    const remaining63 = Math.max(0, 63 - elapsed)
    return { start, elapsed, target21, target63, remaining21, remaining63 }
  }, [firstScanDate])

  /* ─── Active state: data exists ─────────────────────────────────────────── */
  if (entries.length > 0) {
    const sorted = [...entries].sort(
      (a, b) => CONVICTION_ORDER.indexOf(a[0]) - CONVICTION_ORDER.indexOf(b[0])
    )
    const chartData = sorted.map(([conviction, data]) => ({
      conviction,
      '21D Return': data.avg_return_21d ?? 0,
      '63D Return': data.avg_return_63d ?? 0,
      'Win Rate 21D': data.win_rate_21d ?? 0,
      n: data.n,
    }))

    return (
      <div className="space-y-6">
        {/* Progress strip */}
        {countdown && (
          <div className="border border-border bg-card px-5 py-3 flex items-center gap-6 text-[10px] font-mono uppercase tracking-widest text-muted">
            <span className="text-brand font-semibold">Factor Lab Active</span>
            <span>{countdown.elapsed} trading days of data</span>
            {countdown.remaining63 > 0 && (
              <span>{countdown.remaining63} trading days to full 63D coverage</span>
            )}
            <span className="ml-auto">First scan: {formatDate(countdown.start)}</span>
          </div>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {sorted.map(([conviction, data]) => (
            <div key={conviction} className="border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[conviction as keyof typeof COLORS] || '#71717a' }} />
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted">{conviction}</span>
              </div>
              <div className="font-mono text-[10px] text-sub mb-2">{data.n} samples</div>
              <div className="space-y-2">
                <div>
                  <div className="font-mono text-[9px] text-sub uppercase">Win Rate 21D</div>
                  <div className={`font-mono text-lg font-semibold ${(data.win_rate_21d ?? 0) >= 50 ? 'text-green-600 dark:text-green-500' : 'text-red-600 dark:text-red-500'}`}>
                    {data.win_rate_21d != null ? `${data.win_rate_21d}%` : 'N/A'}
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[9px] text-sub uppercase">Avg Ret 21D</div>
                  <div className={`font-mono text-sm font-semibold ${(data.avg_return_21d ?? 0) >= 0 ? 'text-green-600 dark:text-green-500' : 'text-red-600 dark:text-red-500'}`}>
                    {data.avg_return_21d != null ? `${data.avg_return_21d > 0 ? '+' : ''}${data.avg_return_21d}%` : 'N/A'}
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[9px] text-sub uppercase">Avg Ret 63D</div>
                  <div className={`font-mono text-sm ${(data.avg_return_63d ?? 0) >= 0 ? 'text-green-600 dark:text-green-500' : 'text-red-600 dark:text-red-500'}`}>
                    {data.avg_return_63d != null ? `${data.avg_return_63d > 0 ? '+' : ''}${data.avg_return_63d}%` : 'N/A'}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Bar Chart */}
        <div className="border border-border bg-card p-6 shadow-sm">
          <h3 className="font-mono text-xs uppercase tracking-widest text-brand mb-4 border-b border-border pb-2 font-semibold">
            Average Forward Returns by Conviction
          </h3>
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1A1A1A' : '#e2e8f0'} vertical={false} />
                <XAxis dataKey="conviction" stroke={isDark ? '#52525B' : '#94a3b8'} tick={{ fill: isDark ? '#71717A' : '#64748b', fontSize: 10, fontFamily: 'Space Mono' }} />
                <YAxis stroke={isDark ? '#52525B' : '#94a3b8'} tick={{ fill: isDark ? '#71717A' : '#64748b', fontSize: 10, fontFamily: 'Space Mono' }} />
                <Tooltip contentStyle={{ backgroundColor: isDark ? '#0A0A0A' : '#ffffff', borderColor: isDark ? '#27272A' : '#e2e8f0', fontFamily: 'Space Mono', fontSize: '12px' }} />
                <Legend wrapperStyle={{ fontFamily: 'Space Mono', fontSize: '10px' }} />
                <Bar dataKey="21D Return" radius={[2, 2, 0, 0]}>
                  {chartData.map((entry) => (
                    <Cell key={entry.conviction} fill={COLORS[entry.conviction as keyof typeof COLORS] || '#71717a'} fillOpacity={0.85} />
                  ))}
                </Bar>
                <Bar dataKey="63D Return" radius={[2, 2, 0, 0]}>
                  {chartData.map((entry) => (
                    <Cell key={entry.conviction} fill={COLORS[entry.conviction as keyof typeof COLORS] || '#71717a'} fillOpacity={0.4} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    )
  }

  /* ─── Empty state: countdown ─────────────────────────────────────────────── */
  const pct21 = countdown ? Math.min(100, Math.round((countdown.elapsed / 21) * 100)) : 0
  const pct63 = countdown ? Math.min(100, Math.round((countdown.elapsed / 63) * 100)) : 0

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="border border-border bg-card p-8">
        <div className="flex items-start gap-4 mb-6">
          <div className="p-3 rounded border border-border bg-brand/5">
            <FlaskConical size={20} className="text-brand" />
          </div>
          <div>
            <h2 className="font-mono text-sm font-semibold text-primary uppercase tracking-widest mb-1">Factor Lab</h2>
            <p className="font-mono text-[11px] text-muted leading-relaxed max-w-xl">
              Tracks whether the model's conviction ratings actually predict returns. Each scan records
              which stocks were rated Strong Buy / Buy / Hold / Caution / Avoid. Once enough time has
              passed, the system backfills actual forward returns and shows win rates and average returns
              per conviction level — a real-time model validation dashboard.
            </p>
          </div>
        </div>

        {/* Milestones */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* 21D milestone */}
          <div className="border border-border p-5 bg-surface">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <TrendingUp size={12} className="text-brand" />
                <span className="font-mono text-[10px] uppercase tracking-widest text-brand font-semibold">
                  21-Day Window
                </span>
              </div>
              {countdown && countdown.remaining21 === 0 ? (
                <div className="flex items-center gap-1 text-green-600 dark:text-green-500">
                  <CheckCircle size={12} />
                  <span className="font-mono text-[9px] uppercase tracking-wider">Ready</span>
                </div>
              ) : (
                <span className="font-mono text-[9px] text-muted uppercase tracking-wider">
                  {countdown ? `${countdown.remaining21} days left` : '—'}
                </span>
              )}
            </div>
            <div className="h-1.5 bg-border rounded-full overflow-hidden mb-3">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct21}%`, backgroundColor: pct21 >= 100 ? '#22c55e' : 'var(--color-brand)' }}
              />
            </div>
            <div className="flex justify-between font-mono text-[9px] text-sub">
              <span>{countdown ? `${countdown.elapsed} / 21 trading days` : '—'}</span>
              <span>{countdown ? `Unlocks ${formatDate(countdown.target21)}` : '—'}</span>
            </div>
            <p className="font-mono text-[9px] text-muted mt-2 leading-relaxed">
              Win Rate and Avg 21D Return per conviction level — the primary model validation metric.
            </p>
          </div>

          {/* 63D milestone */}
          <div className="border border-border p-5 bg-surface">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Clock size={12} className="text-brand" />
                <span className="font-mono text-[10px] uppercase tracking-widest text-brand font-semibold">
                  63-Day Window
                </span>
              </div>
              {countdown && countdown.remaining63 === 0 ? (
                <div className="flex items-center gap-1 text-green-600 dark:text-green-500">
                  <CheckCircle size={12} />
                  <span className="font-mono text-[9px] uppercase tracking-wider">Ready</span>
                </div>
              ) : (
                <span className="font-mono text-[9px] text-muted uppercase tracking-wider">
                  {countdown ? `${countdown.remaining63} days left` : '—'}
                </span>
              )}
            </div>
            <div className="h-1.5 bg-border rounded-full overflow-hidden mb-3">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct63}%`, backgroundColor: pct63 >= 100 ? '#22c55e' : 'var(--color-brand)' }}
              />
            </div>
            <div className="flex justify-between font-mono text-[9px] text-sub">
              <span>{countdown ? `${countdown.elapsed} / 63 trading days` : '—'}</span>
              <span>{countdown ? `Unlocks ${formatDate(countdown.target63)}` : '—'}</span>
            </div>
            <p className="font-mono text-[9px] text-muted mt-2 leading-relaxed">
              Quarterly return analysis — the more statistically meaningful horizon for factor investing.
            </p>
          </div>
        </div>

        {/* What will be shown */}
        <div className="border border-border p-4 bg-surface">
          <div className="font-mono text-[9px] uppercase tracking-widest text-muted mb-3">What this tab will show</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {CONVICTION_ORDER.map(c => (
              <div key={c} className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[c as keyof typeof COLORS] }} />
                <span className="font-mono text-[9px] text-muted">{c}</span>
              </div>
            ))}
          </div>
          <p className="font-mono text-[9px] text-sub mt-3 leading-relaxed">
            Per-conviction win rates, average forward returns at 21D and 63D, and a bar chart
            showing return monotonicity across the conviction spectrum. A correctly calibrated model
            should show Strong Buy &gt; Buy &gt; Hold &gt; Caution &gt; Avoid.
          </p>
        </div>
      </div>

      {/* Pipeline status */}
      {countdown && (
        <div className="border border-border bg-card px-5 py-3 flex items-center gap-2 text-[10px] font-mono text-muted">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
          <span>Outcome tracking pipeline active — data accumulating since <span className="text-primary">{formatDate(countdown.start)}</span></span>
          <span className="ml-auto text-sub">{countdown.elapsed} trading days recorded</span>
        </div>
      )}
    </div>
  )
}
