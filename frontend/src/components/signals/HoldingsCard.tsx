import React, { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { Briefcase, Trash } from '@phosphor-icons/react'
import type { DashboardData } from '../../types'
import { GlassCard, GlassCardHeader, GlassCardContent, GlassCardFooter } from '../common/shared'
import { getBadgeClass } from '../../utils/formatters'
import { useHoldings } from '../../hooks/useHoldings'

const percent = (value: number) => `${value >= 0 ? '+' : '−'}${Math.abs(value * 100).toFixed(1)}%`
const today = () => new Date().toISOString().slice(0, 10)
const WARN = new Set(['Caution', 'Avoid'])

interface Props { data: DashboardData[]; basket?: string[]; onSelect: (ticker: string) => void }

export const HoldingsCard: React.FC<Props> = ({ data, basket, onSelect }) => {
  const { holdings, add, remove } = useHoldings()
  const [form, setForm] = useState({ ticker: '', date: today(), price: '', quantity: '' })
  const [error, setError] = useState('')
  const [nifty, setNifty] = useState<{ time: number; close: number }[]>([])
  const byTicker = useMemo(() => new Map(data.map(row => [row.Ticker, row])), [data])
  const inBasket = useMemo(() => new Set(basket ?? []), [basket])

  // One NIFTY history request, only when there is something to compare against.
  const needNifty = holdings.length > 0
  useEffect(() => {
    if (!needNifty) return
    const controller = new AbortController()
    axios.get('/api/chart', { params: { ticker: '^NSEI', period: '2y', interval: '1d' }, signal: controller.signal })
      .then(response => setNifty((Array.isArray(response.data?.data) ? response.data.data : [])
        .map((bar: { time: number | string; close: number }) => ({ time: typeof bar.time === 'number' ? bar.time * 1000 : Date.parse(String(bar.time)), close: Number(bar.close) }))
        .filter((bar: { time: number; close: number }) => Number.isFinite(bar.time) && bar.close > 0)))
      .catch(() => setNifty([]))
    return () => controller.abort()
  }, [needNifty])
  const niftySince = (date: string) => {
    if (nifty.length < 2) return null
    const start = nifty.find(bar => bar.time >= Date.parse(date))
    return start ? nifty[nifty.length - 1].close / start.close - 1 : null
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const symbol = form.ticker.trim().toUpperCase().replace(/\.NS$/, '')
    const ticker = `${symbol}.NS`
    const price = Number(form.price)
    const quantity = form.quantity.trim() ? Number(form.quantity) : null
    if (!byTicker.has(ticker)) return setError(`${symbol || 'That symbol'} is not one of the tracked stocks.`)
    if (!(price > 0)) return setError('Enter the price you paid per share.')
    if (quantity !== null && !(quantity > 0)) return setError('Quantity must be more than zero, or left empty.')
    if (!form.date || form.date > today()) return setError('The purchase date cannot be in the future.')
    add({ ticker, date: form.date, price, quantity })
    setForm({ ticker: '', date: form.date, price: '', quantity: '' })
    setError('')
  }

  const rows = holdings.map(holding => {
    const stock = byTicker.get(holding.ticker)
    const now = stock && Number(stock.Price) > 0 ? Number(stock.Price) : null
    const gain = now ? now / holding.price - 1 : null
    return { holding, stock, now, gain, market: niftySince(holding.date) }
  })
  const invested = rows.reduce((sum, row) => sum + (row.holding.quantity ?? 0) * row.holding.price, 0)
  const worth = rows.reduce((sum, row) => sum + (row.holding.quantity ?? 0) * (row.now ?? row.holding.price), 0)
  const flagged = rows.filter(row => row.stock && WARN.has(row.stock.Conviction ?? '')).length

  return (
    <GlassCard>
      <GlassCardHeader icon={Briefcase} title="My Holdings" tooltipId="signals.holdings"
        subtitle={rows.length ? `${rows.length} ${rows.length === 1 ? 'position' : 'positions'}${invested > 0 ? ` · ${percent(worth / invested - 1)} overall` : ''}${flagged ? ` · ${flagged} now rated Caution or Avoid` : ''}` : 'Track what you own against the current ratings'} />
      <GlassCardContent className="p-5 space-y-4">
        <form onSubmit={submit} className="grid grid-cols-2 md:grid-cols-[1.4fr_1fr_1fr_1fr_auto] gap-2 items-end">
          <label className="flex flex-col gap-1 text-[12px]" style={{ color: 'var(--text-3)' }}>Stock
            <input className="input" list="holding-symbols" placeholder="e.g. TCS" value={form.ticker} autoComplete="off"
              onChange={event => setForm({ ...form, ticker: event.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-[12px]" style={{ color: 'var(--text-3)' }}>Bought on
            <input className="input" type="date" max={today()} value={form.date} onChange={event => setForm({ ...form, date: event.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-[12px]" style={{ color: 'var(--text-3)' }}>Price paid
            <input className="input" type="number" inputMode="decimal" min="0" step="any" placeholder="₹ per share" value={form.price}
              onChange={event => setForm({ ...form, price: event.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-[12px]" style={{ color: 'var(--text-3)' }}>Quantity (optional)
            <input className="input" type="number" inputMode="decimal" min="0" step="any" value={form.quantity}
              onChange={event => setForm({ ...form, quantity: event.target.value })} />
          </label>
          <button type="submit" className="btn-primary col-span-2 md:col-span-1">Add</button>
          <datalist id="holding-symbols">
            {data.filter(row => row.Sector !== 'ETF').map(row => <option key={row.Ticker} value={row.Ticker.replace('.NS', '')}>{row.Long_Name}</option>)}
          </datalist>
        </form>
        {error && <p role="alert" className="text-[13px]" style={{ color: 'var(--red)' }}>{error}</p>}

        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr>
                  <th className="pb-2 text-left">Stock</th>
                  <th className="pb-2 px-2 text-left hidden sm:table-cell">Bought</th>
                  <th className="pb-2 px-2 text-right">Return</th>
                  <th className="pb-2 px-2 text-right hidden sm:table-cell">NIFTY since</th>
                  <th className="pb-2 px-2 text-left">Rating now</th>
                  {basket && <th className="pb-2 px-2 text-left hidden md:table-cell">In model basket</th>}
                  <th className="pb-2 w-8"><span className="sr-only">Remove</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ holding, stock, now, gain, market }) => (
                  <tr key={holding.id}>
                    <td className="py-2">
                      <button type="button" className="ticker-link font-semibold" onClick={() => onSelect(holding.ticker)}>{holding.ticker.replace('.NS', '')}</button>
                      <div className="typo-caption">{now ? `₹${now.toLocaleString('en-IN')}` : 'No current price'}</div>
                    </td>
                    <td className="py-2 px-2 hidden sm:table-cell" style={{ color: 'var(--text-2)' }}>
                      {holding.date}<div className="typo-caption">₹{holding.price.toLocaleString('en-IN')}{holding.quantity ? ` × ${holding.quantity}` : ''}</div>
                    </td>
                    <td className="py-2 px-2 text-right font-mono font-medium" style={{ color: gain == null ? 'var(--text-3)' : gain >= 0 ? 'var(--green)' : 'var(--red)' }}>{gain == null ? 'N/A' : percent(gain)}</td>
                    <td className="py-2 px-2 text-right font-mono hidden sm:table-cell" style={{ color: 'var(--text-2)' }}>{market == null ? 'N/A' : percent(market)}</td>
                    <td className="py-2 px-2">{stock ? <span className={`badge ${getBadgeClass(stock.Conviction)}`}>{stock.Conviction ?? 'Not rated'}</span> : <span style={{ color: 'var(--text-3)' }}>Not tracked</span>}</td>
                    {basket && <td className="py-2 px-2 hidden md:table-cell" style={{ color: 'var(--text-2)' }}>{inBasket.has(holding.ticker) ? 'Yes' : 'No'}</td>}
                    <td className="py-2 text-right">
                      <button type="button" className="icon-button" aria-label={`Remove ${holding.ticker.replace('.NS', '')}`} onClick={() => remove(holding.id)}><Trash size={15} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCardContent>
      <GlassCardFooter>
        Saved in this browser only and never sent anywhere. Returns are price changes since your purchase price, before costs and dividends. A rating describes the stock today; it is not an instruction to sell.
      </GlassCardFooter>
    </GlassCard>
  )
}
