import type { CSSProperties } from 'react'

export const CHART_COLORS = ['var(--chart-blue)', 'var(--chart-teal)', 'var(--chart-purple)', 'var(--chart-orange)', 'var(--chart-pink)', 'var(--chart-indigo)', 'var(--green)', 'var(--red)']

export function getRechartsTooltipStyle(_isDark: boolean): CSSProperties {
  return { colorScheme: _isDark ? 'dark' : 'light', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
    fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--text)', boxShadow: 'var(--shadow-md)', padding: '12px' }
}

/** Canvas APIs need resolved colors and font names rather than CSS var() strings. */
export function getCanvasChartTheme() {
  const style = getComputedStyle(document.documentElement)
  const value = (name: string) => style.getPropertyValue(name).trim()
  return { textColor: value('--text-3'), gridColor: value('--chart-grid'), crosshairColor: value('--border-2'),
    fontFamily: value('--font-ui'), green: value('--green'), red: value('--red'),
    blue: value('--chart-blue'), orange: value('--chart-orange'), teal: value('--chart-teal'), purple: value('--chart-purple') }
}
