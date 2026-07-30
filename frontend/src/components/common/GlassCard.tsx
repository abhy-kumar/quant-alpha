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
  hover = true,
  onClick,
  style,
}) => {
  return (
    <div
      onClick={onClick}
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
      <div className="flex items-center gap-2">
        {Icon && (
          <div className="p-1 rounded-md flex items-center justify-center" style={{ background: 'var(--brand-soft)' }}>
            <Icon size={15} weight="duotone" style={{ color: iconColor }} />
          </div>
        )}
        <span className="typo-h3 font-semibold flex items-center gap-1.5" style={{ color: 'var(--text)' }}>
          {title}
          {tooltipId && <InfoTooltip id={tooltipId} />}
        </span>
        {subtitle && <span className="typo-caption text-[11px] text-[var(--text-3)]">{subtitle}</span>}
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
  className = 'px-5 py-3 border-t-[0.5px] border-[var(--glass-border)] text-xs text-[var(--text-3)]',
  style,
}) => {
  return (
    <div className={className} style={style}>
      {children}
    </div>
  )
}
