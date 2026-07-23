/**
 * formatters.ts
 * -------------
 * Centralized formatting utilities and color helpers for Quant Alpha UI.
 * Single source of truth for numeric formatting, currency, volume, and score color coding.
 */

export const formatNum = (val: any, decimals = 2): string => {
  if (val === undefined || val === null || val === '' || isNaN(Number(val))) return 'N/A'
  return Number(val).toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

export const formatCurrency = (val: any, symbol = '₹', decimals = 2): string => {
  if (val === undefined || val === null || val === '' || isNaN(Number(val))) return 'N/A'
  return `${symbol}${Number(val).toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`
}

export const formatVolume = (vol?: number): string => {
  if (!vol || isNaN(vol)) return '-'
  if (vol >= 1e7) return `${(vol / 1e7).toFixed(2)}Cr`
  if (vol >= 1e5) return `${(vol / 1e5).toFixed(2)}L`
  if (vol >= 1e3) return `${(vol / 1e3).toFixed(1)}k`
  return vol.toString()
}

export const formatPercent = (val: any, decimals = 2, showSign = true): string => {
  if (val === undefined || val === null || val === '' || isNaN(Number(val))) return '-'
  const numVal = Number(val)
  const sign = showSign && numVal > 0 ? '+' : ''
  return `${sign}${numVal.toFixed(decimals)}%`
}

export const colorCode = (v: any): string => {
  const numVal = Number(v)
  if (isNaN(numVal) || numVal === 0) return ''
  return numVal > 0 ? 'text-[var(--green)]' : 'text-[var(--red)]'
}

export const scoreColor = (v: any): string => {
  const n = Number(v)
  if (isNaN(n)) return 'text-[var(--text-3)]'
  return n >= 7 ? 'text-[var(--green)]' : n >= 4 ? 'text-[var(--brand)]' : 'text-[var(--red)]'
}

export const getBadgeClass = (conviction?: string): string => {
  switch (conviction) {
    case 'Strong Buy':
      return 'badge-strong-buy'
    case 'Buy':
      return 'badge-buy'
    case 'Caution':
      return 'badge-caution'
    case 'Avoid':
      return 'badge-avoid'
    default:
      return 'badge-hold'
  }
}
