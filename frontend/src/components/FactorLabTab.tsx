import type { OutcomeAccuracy } from '../types'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts'

interface Props {
  outcomeAccuracy: Record<string, OutcomeAccuracy>
  isDark: boolean
}

const COLORS = {
  'Strong Buy': '#22c55e',
  'Buy': '#3b82f6',
  'Hold': '#f59e0b',
  'Avoid': '#ef4444',
}

export default function FactorLabTab({ outcomeAccuracy, isDark }: Props) {
  const entries = Object.entries(outcomeAccuracy).filter(([_, v]) => v.n > 0)
  
  if (entries.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-6 w-1 bg-brand rounded-full"></div>
          <h2 className="font-display font-bold text-xl tracking-wide text-primary">Factor Lab</h2>
        </div>
        <div className="border border-border bg-card p-12 text-center">
          <p className="font-mono text-sm text-muted">No outcome data available yet. Outcomes are computed as past scans age and forward returns become available.</p>
        </div>
      </div>
    )
  }

  const sorted = entries.sort((a, b) => (b[1].avg_return_21d || 0) - (a[1].avg_return_21d || 0))

  const chartData = sorted.map(([conviction, data]) => ({
    conviction,
    '21D Return': data.avg_return_21d ?? 0,
    '63D Return': data.avg_return_63d ?? 0,
    'Win Rate 21D': data.win_rate_21d ?? 0,
    n: data.n,
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-6 w-1 bg-brand rounded-full"></div>
        <h2 className="font-display font-bold text-xl tracking-wide text-primary">Factor Lab</h2>
        <span className="font-mono text-[10px] text-muted">Conviction Accuracy Tracker</span>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {sorted.map(([conviction, data]) => (
          <div key={conviction} className="border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[conviction as keyof typeof COLORS] || '#71717a' }}></div>
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted">{conviction}</span>
            </div>
            <div className="font-mono text-[10px] text-muted mb-1">{data.n} samples</div>
            <div className="space-y-2">
              <div>
                <div className="font-mono text-[9px] text-sub uppercase">Win Rate (21D)</div>
                <div className={`font-mono text-lg font-semibold ${(data.win_rate_21d ?? 0) >= 50 ? 'text-green-600 dark:text-green-500' : 'text-red-600 dark:text-red-500'}`}>
                  {data.win_rate_21d != null ? `${data.win_rate_21d}%` : 'N/A'}
                </div>
              </div>
              <div>
                <div className="font-mono text-[9px] text-sub uppercase">Avg Return (21D)</div>
                <div className={`font-mono text-sm font-semibold ${(data.avg_return_21d ?? 0) >= 0 ? 'text-green-600 dark:text-green-500' : 'text-red-600 dark:text-red-500'}`}>
                  {data.avg_return_21d != null ? `${data.avg_return_21d > 0 ? '+' : ''}${data.avg_return_21d}%` : 'N/A'}
                </div>
              </div>
              <div>
                <div className="font-mono text-[9px] text-sub uppercase">Avg Return (63D)</div>
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
        <h3 className="font-mono text-xs uppercase tracking-widest text-brand mb-4 border-b border-border pb-2 font-semibold">Average Forward Returns by Conviction</h3>
        <div style={{ width: '100%', height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#1A1A1A" : "#e2e8f0"} vertical={false} />
              <XAxis dataKey="conviction" stroke={isDark ? "#52525B" : "#94a3b8"} tick={{fill: isDark ? '#71717A' : '#64748b', fontSize: 10, fontFamily: 'Space Mono'}} />
              <YAxis stroke={isDark ? "#52525B" : "#94a3b8"} tick={{fill: isDark ? '#71717A' : '#64748b', fontSize: 10, fontFamily: 'Space Mono'}} />
              <Tooltip contentStyle={{backgroundColor: isDark ? '#0A0A0A' : '#ffffff', borderColor: isDark ? '#27272A' : '#e2e8f0', fontFamily: 'Space Mono', fontSize: '12px'}} />
              <Legend wrapperStyle={{fontFamily: 'Space Mono', fontSize: '10px'}} />
              <Bar dataKey="21D Return" radius={[2, 2, 0, 0]}>
                {chartData.map((entry) => (
                  <Cell key={entry.conviction} fill={COLORS[entry.conviction as keyof typeof COLORS] || '#71717a'} fillOpacity={0.8} />
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
