import React, { useState } from 'react'
import { ChartLineUp } from '@phosphor-icons/react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import type { PaperPortfolio } from '../../types'
import { GlassCard, GlassCardHeader, GlassCardContent, GlassCardFooter } from '../common/shared'
import { getBadgeClass } from '../../utils/formatters'
import { getRechartsTooltipStyle } from '../../utils/chartThemes'

const percent = (value: number, digits = 1) => `${value >= 0 ? '+' : '−'}${Math.abs(value * 100).toFixed(digits)}%`
const short = (ticker: string) => ticker.replace('.NS', '')

interface Props { portfolio?: PaperPortfolio | null; isDark: boolean; onSelect: (ticker: string) => void }

export const PaperPortfolioCard: React.FC<Props> = ({ portfolio, isDark, onSelect }) => {
  const [showAll, setShowAll] = useState(false)
  if (!portfolio) return null
  const gap = portfolio.return - portfolio.nifty_return
  const holdings = showAll ? portfolio.holdings : portfolio.holdings.slice(0, 8)
  const next = portfolio.next_basket
  const tiles: [string, string, string, string?][] = [
    ['Paper portfolio', percent(portfolio.return), `since ${portfolio.inception}`, portfolio.return >= 0 ? 'var(--green)' : 'var(--red)'],
    ['NIFTY 50', percent(portfolio.nifty_return), 'same period'],
    ['Against NIFTY', `${gap >= 0 ? '+' : '−'}${Math.abs(gap * 100).toFixed(1)} pts`, gap >= 0 ? 'ahead' : 'behind', gap >= 0 ? 'var(--green)' : 'var(--red)'],
    ['Next review', portfolio.sessions_to_next_review === 0 ? 'Due' : `${portfolio.sessions_to_next_review} sessions`, `last on ${portfolio.last_review}`],
  ]
  return (
    <GlassCard>
      <GlassCardHeader icon={ChartLineUp} title="Model Basket" tooltipId="quant.basket"
        subtitle={`${portfolio.holdings.length} stocks held on paper · ${portfolio.sessions} sessions of history`} />
      <GlassCardContent className="p-5 space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {tiles.map(([label, value, note, color]) => (
            <div key={label} className="rounded-[var(--radius)] p-3" style={{ background: 'var(--surface-2)' }}>
              <div className="typo-caption">{label}</div>
              <div className="typo-h2 font-mono mt-0.5" style={color ? { color } : undefined}>{value}</div>
              <div className="typo-caption mt-0.5">{note}</div>
            </div>
          ))}
        </div>

        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={portfolio.chart} margin={{ top: 5, right: 12, bottom: 0, left: -12 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="date" stroke="var(--border)" tick={{ fill: 'var(--text-3)', fontSize: 12 }} tickMargin={8} minTickGap={40} />
              <YAxis stroke="var(--border)" tick={{ fill: 'var(--text-3)', fontSize: 12 }} domain={['auto', 'auto']} tickFormatter={value => Number(value).toFixed(0)} />
              <Tooltip contentStyle={getRechartsTooltipStyle(isDark)} formatter={(value) => Number(value).toFixed(1)} />
              <ReferenceLine y={100} stroke="var(--border-2)" strokeDasharray="4 4" />
              <Line type="monotone" dataKey="portfolio" name="Model basket" stroke="var(--brand)" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="nifty" name="NIFTY 50" stroke="var(--text-3)" strokeWidth={1.5} strokeDasharray="5 5" dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                <th className="pb-2 text-left">Held now</th>
                <th className="pb-2 px-2 text-left hidden sm:table-cell">Sector</th>
                <th className="pb-2 px-2 text-left hidden md:table-cell">Bought</th>
                <th className="pb-2 px-2 text-right">Since bought</th>
                <th className="pb-2 pl-2 text-right">Rating now</th>
              </tr>
            </thead>
            <tbody>
              {holdings.map(holding => (
                <tr key={holding.ticker}>
                  <td className="py-1.5"><button type="button" className="ticker-link font-semibold" onClick={() => onSelect(holding.ticker)}>{short(holding.ticker)}</button></td>
                  <td className="py-1.5 px-2 hidden sm:table-cell" style={{ color: 'var(--text-2)' }}>{holding.sector ?? 'N/A'}</td>
                  <td className="py-1.5 px-2 hidden md:table-cell font-mono" style={{ color: 'var(--text-3)' }}>{holding.entry_date}</td>
                  <td className="py-1.5 px-2 text-right font-mono font-medium" style={{ color: holding.return >= 0 ? 'var(--green)' : 'var(--red)' }}>{percent(holding.return)}</td>
                  <td className="py-1.5 pl-2 text-right">{holding.rating_now ? <span className={`badge ${getBadgeClass(holding.rating_now)}`}>{holding.rating_now}</span> : 'N/A'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="typo-caption max-w-[64ch]">
            {next.would_add.length || next.would_drop.length
              ? `If reviewed on today's ratings it would add ${next.would_add.map(short).join(', ') || 'nothing'} and drop ${next.would_drop.map(short).join(', ') || 'nothing'}.`
              : "Today's ratings would leave the basket unchanged."}
          </p>
          {portfolio.holdings.length > 8 && (
            <button type="button" className="btn-secondary" aria-expanded={showAll} onClick={() => setShowAll(value => !value)}>
              {showAll ? 'Show fewer' : `Show all ${portfolio.holdings.length}`}
            </button>
          )}
        </div>
      </GlassCardContent>
      <GlassCardFooter>
        {portfolio.rules} Deepest fall so far {percent(portfolio.max_drawdown)}. This follows the ratings as published, so it is a record, not a backtest. A few weeks of results say little either way.
      </GlassCardFooter>
    </GlassCard>
  )
}
