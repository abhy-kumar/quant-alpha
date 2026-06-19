import React from 'react'

export const num = (v: any) => !isNaN(Number(v)) && v!=="" && v!==null ? Number(v).toFixed(2) : '\u2014'

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
        <div className="h-full rounded-full transition-all duration-500" style={{width:`${pct}%`,background:barColor}} />
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
  <th className="py-2.5 px-3 text-[11px] font-medium cursor-pointer select-none uppercase tracking-wider"
    style={{color:'var(--text-3)',textAlign:align}} onClick={()=>onSort(field)}>
    <span className="inline-flex items-center gap-1">
      {children}
      {sortKey===field && <span style={{color:'var(--brand)'}}>{sortDir==='asc'?'\u2191':'\u2193'}</span>}
    </span>
  </th>
)

export function MiniSparkline({ values, width=48, height=16 }: { values: number[]; width?:number; height?:number }) {
  if (!values||values.length<2) return <span className="text-[var(--text-3)] text-[10px]">\u2014</span>
  const min=Math.min(...values), max=Math.max(...values), range=max-min||1
  const pts = values.map((v,i)=>`${(i/(values.length-1))*width},${height-((v-min)/range)*(height-2)-1}`).join(' ')
  const up = values[values.length-1]>=values[0]
  return <svg width={width} height={height}><polyline points={pts} fill="none" stroke={up?'var(--green)':'var(--red)'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
}
