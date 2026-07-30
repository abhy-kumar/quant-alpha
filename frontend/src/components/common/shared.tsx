import React, { useRef, useState, useEffect, useCallback } from 'react'
import * as Tooltip from '@radix-ui/react-tooltip'
import { Question } from '@phosphor-icons/react'
import { tooltips } from '../../data/tooltipContent'
import { formatNum, colorCode, scoreColor, getBadgeClass } from '../../utils/formatters'
import { GlassCard, GlassCardHeader, GlassCardContent, GlassCardFooter } from './GlassCard'

export { formatNum, colorCode, scoreColor, getBadgeClass, GlassCard, GlassCardHeader, GlassCardContent, GlassCardFooter }
export const num = formatNum

export const scoreBar = (label: string, value: number, min: number = 0, max: number = 10, color?: string, tooltipId?: string) => {
  const range = max - min
  const normalized = range > 0 ? ((value - min) / range) * 100 : 0
  const pct = Math.max(0, Math.min(normalized, 100))
  const barColor = color || (pct >= 70 ? 'var(--green)' : pct >= 40 ? 'var(--brand)' : 'var(--red)')
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs w-20 shrink-0" style={{ color: 'var(--text-2)' }}>
        {tooltipId ? <InfoTooltip id={tooltipId}>{label}</InfoTooltip> : label}
      </span>
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: barColor, transition: 'width 500ms var(--ease-out)' }} />
      </div>
      <span className="font-mono text-[11px] w-7 text-right shrink-0" style={{ color: 'var(--text)' }}>
        {value.toFixed(1)}
      </span>
    </div>
  )
}

export const getSignalLabel = (v: any) => {
  if (v === 1) return <span className="text-[var(--green)] font-medium text-xs">Bullish</span>
  if (v === -1) return <span className="text-[var(--red)] font-medium text-xs">Bearish</span>
  return <span className="text-[var(--text-3)] text-xs">Neutral</span>
}

export const SortHeader = ({ field, children, align = 'left', sortKey, sortDir, onSort }: {
  field: string; children: React.ReactNode; align?: 'left' | 'right';
  sortKey: string; sortDir: 'asc' | 'desc'; onSort: (k: string) => void;
}) => (
  <th className="py-2.5 px-3 typo-table-head cursor-pointer select-none"
    style={{ textAlign: align }} onClick={() => onSort(field)}>
    <span className="inline-flex items-center gap-1">
      {children}
      {sortKey === field && <span style={{ color: 'var(--brand)' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
    </span>
  </th>
)

export function MiniSparkline({ values, width = 64, height = 22, ticker }: { values: number[]; width?: number; height?: number; ticker?: string }) {
  if (!values || values.length === 0) return <span className="text-[var(--text-3)] text-[10px] block text-center">N/A</span>
  if (values.length === 1) {
    const v = values[0]
    const pct = Math.max(0, Math.min(100, (v / 10) * 100))
    const color = pct >= 70 ? 'var(--green)' : pct >= 40 ? 'var(--brand)' : 'var(--red)'
    return <svg width={width} height={height}><circle cx={width / 2} cy={height / 2} r={3} fill={color} /></svg>
  }
  const min = Math.min(...values), max = Math.max(...values), range = max - min || 1
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * width},${height - ((v - min) / range) * (height - 4) - 2}`).join(' ')
  const fillPts = values.map((v, i) => `${(i / (values.length - 1)) * width},${height - ((v - min) / range) * (height - 4) - 2}`).join(' ')
  const up = values[values.length - 1] >= values[0]
  const lineColor = up ? 'var(--green)' : 'var(--red)'
  const gradientId = `sg-${ticker || Math.random().toString(36).slice(2, 8)}`
  return (
    <svg width={width} height={height}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lineColor} stopOpacity={0.25} />
          <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={`0,${height} ${fillPts} ${width},${height}`} fill={`url(#${gradientId})`} />
      <polyline points={pts} fill="none" stroke={lineColor} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function SegmentedControl({ options, value, onChange, className = '' }: {
  options: { key: string; label: string }[]
  value: string
  onChange: (key: string) => void
  className?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const btnRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null)

  const updateIndicator = useCallback(() => {
    const container = containerRef.current
    const btn = btnRefs.current.get(value)
    if (container && btn) {
      const containerRect = container.getBoundingClientRect()
      const btnRect = btn.getBoundingClientRect()
      if (btnRect.width > 0 && containerRect.width > 0) {
        setIndicator({
          left: btnRect.left - containerRect.left,
          width: btnRect.width,
        })
      }
    }
  }, [value])

  useEffect(() => {
    updateIndicator()

    // Multiple RAF passes to ensure measurements after font load / layout calculations
    let rafId1: number
    let rafId2: number
    rafId1 = requestAnimationFrame(() => {
      updateIndicator()
      rafId2 = requestAnimationFrame(updateIndicator)
    })

    window.addEventListener('resize', updateIndicator)

    let resizeObserver: ResizeObserver | null = null
    if (containerRef.current) {
      resizeObserver = new ResizeObserver(() => {
        updateIndicator()
      })
      resizeObserver.observe(containerRef.current)
    }

    return () => {
      cancelAnimationFrame(rafId1)
      cancelAnimationFrame(rafId2)
      window.removeEventListener('resize', updateIndicator)
      if (resizeObserver) resizeObserver.disconnect()
    }
  }, [updateIndicator])

  return (
    <div ref={containerRef} className={`segmented-control ${className}`}>
      {indicator && indicator.width > 0 && (
        <div className="seg-indicator" style={{ left: indicator.left, width: indicator.width }} />
      )}
      {options.map(opt => (
        <button
          key={opt.key}
          ref={el => { if (el) btnRefs.current.set(opt.key, el) }}
          onClick={() => onChange(opt.key)}
          className={value === opt.key ? 'active' : ''}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export function InfoTooltip({ id, children }: { id: string; children?: React.ReactNode }) {
  const entry = tooltips[id]
  if (!entry) return children ? <>{children}</> : null
  return (
    <Tooltip.Provider delayDuration={200}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          {children ? (
            <span className="inline-flex items-center gap-1 cursor-help">{children}</span>
          ) : (
            <span className="inline-flex items-center gap-1 cursor-help">
              <Question size={11} weight="light" style={{ color: 'var(--text-3)', opacity: 0.6 }} />
            </span>
          )}
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="tooltip-content"
            sideOffset={6}
            side="top"
            style={{
              background: 'var(--glass-bg-strong)',
              backdropFilter: 'blur(var(--glass-blur))',
              WebkitBackdropFilter: 'blur(var(--glass-blur))',
              border: '1px solid var(--glass-border-strong)',
              borderRadius: 'var(--radius)',
              boxShadow: 'var(--glass-shadow-lg)',
              padding: '8px 12px',
              maxWidth: 280,
              zIndex: 9999,
            }}
          >
            <p style={{ fontSize: 11, lineHeight: 1.5, color: 'var(--text)', margin: 0 }}>
              {entry.text}
            </p>
            <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '4px 0 0', fontStyle: 'italic' }}>
              Source: {entry.source}
            </p>
            <Tooltip.Arrow style={{ fill: 'var(--glass-bg-strong)' }} />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  )
}
