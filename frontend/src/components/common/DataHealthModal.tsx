import React from 'react'
import { X } from '@phosphor-icons/react'
import type { DataHealth } from '../../types'
import { ModalShell } from './ModalShell'

const tone = (value: number | null) => value == null ? 'var(--text-3)' : value >= 90 ? 'var(--green)' : value >= 75 ? 'var(--amber)' : 'var(--red)'

function Bar({ label, value, note }: { label: string; value: number | null; note?: string }) {
  return (
    <div className="flex items-center gap-3 text-[13px] py-1">
      <span className="flex-1 min-w-0 truncate" style={{ color: 'var(--text-2)' }}>{label}</span>
      {note && <span className="font-mono text-[12px]" style={{ color: 'var(--red)' }}>{note}</span>}
      <span className="w-24 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }} aria-hidden="true">
        <span className="block h-full rounded-full" style={{ width: `${value ?? 0}%`, background: tone(value) }} />
      </span>
      <span className="w-12 text-right font-mono" style={{ color: tone(value) }}>{value == null ? 'N/A' : `${value.toFixed(0)}%`}</span>
    </div>
  )
}

export const DataHealthModal: React.FC<{ health: DataHealth; onClose: () => void }> = ({ health, onClose }) => {
  const degraded = health.status === 'degraded'
  const check = health.price_check
  return (
    <ModalShell title="Data health" onClose={onClose} className="w-full max-w-xl">
      <div className="p-5 space-y-5 max-h-[85vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="typo-h2">Data health</h2>
            <p className="typo-caption">Scan of {health.scan_time ?? 'unknown time'} · {health.stocks} stocks{health.requested ? ` of ${health.requested} requested` : ''}</p>
          </div>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="rounded-[var(--radius)] p-3" style={{ background: degraded ? 'var(--amber-bg)' : 'var(--green-bg)' }}>
          <div className="font-semibold text-[14px]" style={{ color: degraded ? 'var(--amber)' : 'var(--green)' }}>
            {degraded ? `${health.issues.length} ${health.issues.length === 1 ? 'problem' : 'problems'} in this scan` : 'Every source answered and every input is within its normal range'}
          </div>
          {degraded && <ul className="mt-1.5 space-y-1 text-[13px] list-disc pl-5" style={{ color: 'var(--text)' }}>{health.issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}
        </div>

        <section>
          <h3 className="typo-h3 mb-1">Inputs to the rating</h3>
          <p className="typo-caption mb-2">Share of stocks that have each input. Inputs that do not apply to banks are measured on other companies.</p>
          {health.inputs.map(input => (
            <Bar key={input.id} label={input.label} value={input.coverage}
              note={input.change != null && input.change <= -5 ? `${input.change.toFixed(0)} pts` : undefined} />
          ))}
        </section>

        <section>
          <h3 className="typo-h3 mb-1">Other fields</h3>
          {health.fields.map(field => <Bar key={field.label} label={field.label} value={field.coverage} />)}
          <Bar label="Stocks with enough data to be rated" value={health.eligible_pct} />
        </section>

        <section className="text-[13px] space-y-1.5" style={{ color: 'var(--text-2)' }}>
          <h3 className="typo-h3 mb-1" style={{ color: 'var(--text)' }}>Market sources</h3>
          <p>
            {health.market_readings.available ?? 'N/A'} of {health.market_readings.of} market readings fetched
            {health.market_readings.missing.length ? `; missing ${health.market_readings.missing.join(', ')}.` : '.'}
          </p>
          <p>
            {check && check.compared
              ? `${check.compared - check.mismatched} of ${check.compared} closing prices match the NSE daily file for ${check.date} within 1%.`
              : 'Closing prices could not be compared with the NSE daily file in this scan.'}
          </p>
          {check && check.worst.length > 0 && (
            <p className="font-mono text-[12px]">{check.worst.slice(0, 5).map(item => `${item.ticker.replace('.NS', '')} ${(item.gap * 100).toFixed(1)}%`).join(' · ')}</p>
          )}
        </section>
      </div>
    </ModalShell>
  )
}
