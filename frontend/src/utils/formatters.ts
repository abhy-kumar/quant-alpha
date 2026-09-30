/**
 * formatters.ts
 * Standard financial and number formatting utilities.
 */

export function formatNum(v: any, decimals = 1): string {
  if (v == null || isNaN(Number(v))) return '-'
  return Number(v).toFixed(decimals)
}

export function colorCode(v: any, pos = 'text-[var(--green)]', neg = 'text-[var(--red)]', zero = 'text-[var(--text-3)]'): string {
  const n = Number(v)
  if (isNaN(n) || n === 0) return zero
  return n > 0 ? pos : neg
}

export function scoreColor(s: number | null | undefined): string {
  if (s == null || isNaN(Number(s))) return 'text-[var(--text-3)]'
  const n = Number(s)
  if (n >= 7) return 'text-[var(--green)]'
  if (n >= 4) return 'text-[var(--brand)]'
  return 'text-[var(--red)]'
}

export function getBadgeClass(conviction: string | null | undefined): string {
  if (!conviction) return 'badge-neutral'
  const c = conviction.toLowerCase()
  if (c.includes('strong buy')) return 'badge-strong-buy'
  if (c.includes('buy')) return 'badge-buy'
  if (c.includes('caution')) return 'badge-caution'
  if (c.includes('avoid')) return 'badge-avoid'
  return 'badge-neutral'
}

export function formatINR(value: number | undefined | null, decimals = 2): string {
  if (value == null || isNaN(Number(value))) return '-'
  return Number(value).toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

export function formatPercent(value: number | undefined | null, decimals = 1, showSign = true): string {
  if (value == null || isNaN(Number(value))) return '-'
  const n = Number(value)
  const sign = showSign && n > 0 ? '+' : ''
  return `${sign}${n.toFixed(decimals)}%`
}

export function formatMarketCap(capInBillions: number | undefined | null): string {
  if (capInBillions == null || isNaN(Number(capInBillions))) return '-'
  const n = Number(capInBillions)
  if (n >= 1000) {
    return `₹${(n / 1000).toFixed(2)}T`
  }
  return `₹${n.toFixed(1)}B`
}

export function debtEquityRatio(value: number | null | undefined): number | null {
  return value == null || !Number.isFinite(value) ? null : value / 100
}
