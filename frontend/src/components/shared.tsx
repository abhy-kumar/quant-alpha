import React from 'react'

export const num = (val: any) => (!isNaN(Number(val)) && val !== "" && val !== null ? Number(val).toFixed(2) : 'N/A')

export const colorCode = (val: any) => (Number(val) > 0 ? 'text-green-600 dark:text-green-400' : Number(val) < 0 ? 'text-red-600 dark:text-red-400' : 'text-primary')

export const getSignalLabel = (val: any) => {
  if (val === 1) return <span className="text-green-600 dark:text-green-400 font-medium">Bullish</span>
  if (val === -1) return <span className="text-red-600 dark:text-red-400 font-medium">Bearish</span>
  return <span className="text-muted">Neutral</span>
}

export const scoreBar = (label: string, value: number, min: number = 0, max: number = 10, color?: string) => {
  const range = max - min
  const normalized = range > 0 ? ((value - min) / range) * 100 : 0
  const pct = Math.max(0, Math.min(normalized, 100))
  const barColor = color || (pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500')
  return (
    <div className="flex items-center gap-3">
      <span className="text-muted text-[10px] font-mono w-20 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{width: `${pct}%`}}></div>
      </div>
      <span className="text-sub text-[10px] font-mono w-6 text-right shrink-0">{value.toFixed(1)}</span>
    </div>
  )
}

export const SortHeader = ({ field, children, align = 'left', sortKey, sortDir, onSort }: {
  field: string; children: React.ReactNode; align?: 'left' | 'right';
  sortKey: string; sortDir: 'asc' | 'desc'; onSort: (key: string) => void;
}) => (
  <th
    className={`p-3 font-semibold cursor-pointer hover:text-brand transition-colors select-none text-${align}`}
    onClick={() => onSort(field)}
  >
    <span className="inline-flex items-center gap-1">
      {children}
      {sortKey === field && <span className="text-brand">{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>}
    </span>
  </th>
)

export function MiniSparkline({ values, width = 48, height = 16 }: { values: number[]; width?: number; height?: number }) {
  if (!values || values.length < 2) return <span className="text-muted text-[9px]">\u2014</span>
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width
    const y = height - ((v - min) / range) * (height - 2) - 1
    return `${x},${y}`
  }).join(' ')
  const last = values[values.length - 1]
  const first = values[0]
  const isUp = last >= first
  return (
    <svg width={width} height={height} className="inline-block">
      <polyline
        points={points}
        fill="none"
        stroke={isUp ? '#22c55e' : '#ef4444'}
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
