import React from 'react'

export const num = (val: any) => (!isNaN(Number(val)) && val !== "" && val !== null ? Number(val).toFixed(2) : 'N/A')

export const colorCode = (val: any) => Number(val) > 0 ? 'text-green' : Number(val) < 0 ? 'text-red' : 'text-heading'

export const getSignalLabel = (val: any) => {
  if (val === 1) return <span className="text-green font-medium text-xs">Bullish</span>
  if (val === -1) return <span className="text-red font-medium text-xs">Bearish</span>
  return <span className="text-sub text-xs">Neutral</span>
}

export const scoreBar = (label: string, value: number, min: number = 0, max: number = 10, color?: string) => {
  const range = max - min
  const normalized = range > 0 ? ((value - min) / range) * 100 : 0
  const pct = Math.max(0, Math.min(normalized, 100))
  const barColor = color || (pct >= 70 ? 'var(--green)' : pct >= 40 ? 'var(--amber)' : 'var(--red)')
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs w-20 shrink-0" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border-color)' }}>
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: barColor }} />
      </div>
      <span className="font-data text-[11px] w-7 text-right shrink-0" style={{ color: 'var(--text-main)' }}>{value.toFixed(1)}</span>
    </div>
  )
}

export const SortHeader = ({ field, children, align = 'left', sortKey, sortDir, onSort }: {
  field: string; children: React.ReactNode; align?: 'left' | 'right';
  sortKey: string; sortDir: 'asc' | 'desc'; onSort: (key: string) => void;
}) => (
  <th
    className="py-3 px-3 font-medium text-xs cursor-pointer select-none transition-colors"
    style={{ color: 'var(--text-muted)', textAlign: align }}
    onClick={() => onSort(field)}
    onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-main)')}
    onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
  >
    <span className="inline-flex items-center gap-1">
      {children}
      {sortKey === field && <span style={{ color: 'var(--brand)' }}>{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>}
    </span>
  </th>
)

export function MiniSparkline({ values, width = 48, height = 16 }: { values: number[]; width?: number; height?: number }) {
  if (!values || values.length < 2) return <span className="text-sub text-[11px]">\u2014</span>
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
        stroke={isUp ? 'var(--green)' : 'var(--red)'}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
