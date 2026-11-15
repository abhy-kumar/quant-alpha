import { useCallback, useEffect, useState } from 'react'

export interface Holding { id: string; ticker: string; date: string; price: number; quantity: number | null }

const KEY = 'qa_holdings'
const valid = (item: unknown): item is Holding => {
  const h = item as Holding
  return !!h && typeof h.id === 'string' && typeof h.ticker === 'string' && typeof h.date === 'string' &&
    typeof h.price === 'number' && h.price > 0 && (h.quantity === null || (typeof h.quantity === 'number' && h.quantity > 0))
}

/** Positions the person entered. Kept in this browser only; never sent to the server. */
export function useHoldings() {
  const [holdings, setHoldings] = useState<Holding[]>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(KEY) ?? '[]')
      return Array.isArray(stored) ? stored.filter(valid) : []
    } catch { return [] }
  })
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(holdings)) } catch { /* private mode: keep in memory */ } }, [holdings])
  const add = useCallback((holding: Omit<Holding, 'id'>) =>
    setHoldings(list => [...list, { ...holding, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }]), [])
  const remove = useCallback((id: string) => setHoldings(list => list.filter(item => item.id !== id)), [])
  return { holdings, add, remove }
}
