import React from 'react'
import { InfoTooltip } from './shared'

interface GlassCardProps {
  children: React.ReactNode
  className?: string
  hover?: boolean
  onClick?: () => void
  style?: React.CSSProperties
}

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  className = '',
  hover = false,
  onClick,
  style,
}) => {
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onClick() } } : undefined}
      className={`card ${hover ? 'card-hover' : ''} overflow-hidden ${className}`}
      style={style}
    >
      {children}
    </div>
  )
}

interface GlassCardHeaderProps {
  title: React.ReactNode
  subtitle?: React.ReactNode
  icon?: React.ElementType
  iconColor?: string
  badge?: React.ReactNode
  action?: React.ReactNode
  tooltipId?: string
  className?: string
}

export const GlassCardHeader: React.FC<GlassCardHeaderProps> = ({
  title,
  subtitle,
  icon: Icon,
  iconColor = 'var(--brand)',
  badge,
  action,
  tooltipId,
  className = '',
}) => {
  return (
    <div className={`section-band flex flex-wrap items-center justify-between gap-3 ${className}`}>
      <div className="flex items-start gap-3 min-w-0 flex-1">
        {Icon && (
          <div className="flex items-center justify-center shrink-0 mt-0.5">
            <Icon size={18} weight="regular" style={{ color: iconColor }} />
          </div>
        )}
        <div className="min-w-0">
        <h2 className="typo-h3 flex items-center gap-1.5" style={{ color: 'var(--text)' }}>
          {title}
          {tooltipId && <InfoTooltip id={tooltipId} />}
        </h2>
        {subtitle && <span className="block mt-1 typo-caption text-[12px] text-[var(--text-3)]">{subtitle}</span>}
        </div>
      </div>

      {(badge || action) && (
        <div className="flex items-center gap-2">
          {badge}
          {action}
        </div>
      )}
    </div>
  )
}

export const GlassCardContent: React.FC<{ children: React.ReactNode; className?: string; style?: React.CSSProperties }> = ({
  children,
  className = 'p-5',
  style,
}) => {
  return (
    <div className={className} style={style}>
      {children}
    </div>
  )
}

export const GlassCardFooter: React.FC<{ children: React.ReactNode; className?: string; style?: React.CSSProperties }> = ({
  children,
  className = 'px-5 py-3 border-t border-[var(--glass-border)] text-xs text-[var(--text-3)]',
  style,
}) => {
  return (
    <div className={className} style={style}>
      {children}
    </div>
  )
}
