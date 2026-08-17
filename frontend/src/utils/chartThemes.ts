/**
 * chartThemes.ts
 * Shared theme styles and tooltip configurations for Recharts and visualization components.
 */

import type { CSSProperties } from 'react'

export function getRechartsTooltipStyle(isDark: boolean): CSSProperties {
  return {
    backgroundColor: isDark ? '#09090b' : '#ffffff',
    borderColor: isDark ? '#18181b' : '#E4E7EC',
    borderRadius: 'var(--radius, 8px)',
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    fontSize: '12px',
    color: isDark ? '#E8ECF2' : '#1A1D26',
    boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.45)' : '0 8px 32px rgba(0,0,0,0.08)',
    padding: '10px 14px',
  }
}
