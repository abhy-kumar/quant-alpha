import React from 'react'

export const num = (v: any) => !isNaN(Number(v)) && v!=="" && v!==null ? Number(v).toFixed(2) : 'N/A'

export const colorCode = (v: any) => Number(v)>0 ? 'text-[var(--green)]' : Number(v)<0 ? 'text-[var(--red)]' : ''

export const scoreBar = (label: string, value: number, min: number = 0, max: number = 10, color?: string) => {
  const range = max - min
  const normalized = range > 0 ? ((value - min) / range) * 100 : 0
  const pct = Math.max(0, Math.min(normalized, 100))
  const barColor = color || (pct >= 70 ? 'var(--green)' : pct >= 40 ? 'var(--brand)' : 'var(--red)')
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs w-20 shrink-0" style={{color:'var(--text-2)'}}>{label}</span>
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{background:'var(--border)'}}>
        <div className="h-full rounded-full" style={{width:`${pct}%`,background:barColor,transition:'width 500ms var(--ease-out)'}} />
      </div>
      <span className="font-mono text-[11px] w-7 text-right shrink-0" style={{color:'var(--text)'}}>{value.toFixed(1)}</span>
    </div>
  )
}

export const getSignalLabel = (v: any) => {
  if (v===1) return <span className="text-[var(--green)] font-medium text-xs">Bullish</span>
  if (v===-1) return <span className="text-[var(--red)] font-medium text-xs">Bearish</span>
  return <span className="text-[var(--text-3)] text-xs">Neutral</span>
}

export const SortHeader = ({ field, children, align='left', sortKey, sortDir, onSort }: {
  field: string; children: React.ReactNode; align?: 'left'|'right';
  sortKey: string; sortDir: 'asc'|'desc'; onSort: (k: string) => void;
}) => (
  <th className="py-2 px-2 text-[10px] font-medium cursor-pointer select-none uppercase tracking-wider"
    style={{color:'var(--text-3)',textAlign:align}} onClick={()=>onSort(field)}>
    <span className="inline-flex items-center gap-1">
      {children}
      {sortKey===field && <span style={{color:'var(--brand)'}}>{sortDir==='asc'?'↑':'↓'}</span>}
    </span>
  </th>
)

export function MiniSparkline({ values, width=64, height=22, ticker }: { values: number[]; width?:number; height?:number; ticker?: string }) {
  if (!values||values.length===0) return <span className="text-[var(--text-3)] text-[10px] block text-center">N/A</span>
  if (values.length===1) {
    const v = values[0]
    const pct = Math.max(0, Math.min(100, (v / 10) * 100))
    const color = pct >= 70 ? 'var(--green)' : pct >= 40 ? 'var(--brand)' : 'var(--red)'
    return <svg width={width} height={height}><circle cx={width/2} cy={height/2} r={3} fill={color}/></svg>
  }
  const min=Math.min(...values), max=Math.max(...values), range=max-min||1
  const pts = values.map((v,i)=>`${(i/(values.length-1))*width},${height-((v-min)/range)*(height-4)-2}`).join(' ')
  const fillPts = values.map((v,i)=>`${(i/(values.length-1))*width},${height-((v-min)/range)*(height-4)-2}`).join(' ')
  const up = values[values.length-1]>=values[0]
  const lineColor = up ? 'var(--green)' : 'var(--red)'
  const gradientId = `sg-${ticker || Math.random().toString(36).slice(2,8)}`
  return (
    <svg width={width} height={height}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lineColor} stopOpacity={0.25}/>
          <stop offset="100%" stopColor={lineColor} stopOpacity={0}/>
        </linearGradient>
      </defs>
      <polygon points={`0,${height} ${fillPts} ${width},${height}`} fill={`url(#${gradientId})`}/>
      <polyline points={pts} fill="none" stroke={lineColor} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}
