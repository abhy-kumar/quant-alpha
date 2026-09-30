import React from 'react'
import { ModalShell } from '../common/ModalShell'
import type { DashboardData } from '../../types'
import { num, scoreColor, InfoTooltip } from '../common/shared'
import { X, Minus } from '@phosphor-icons/react'
import { FactorRadarChart } from '../common/FactorRadarChart'

interface ComparisonModalProps {
  isOpen: boolean
  onClose: () => void
  tickers: string[]
  allData: DashboardData[]
  onRemoveTicker: (ticker: string) => void
  onSelectTicker: (ticker: string) => void
}

export const ComparisonModal: React.FC<ComparisonModalProps> = ({
  isOpen,
  onClose,
  tickers,
  allData,
  onRemoveTicker,
  onSelectTicker,
}) => {
  if (!isOpen) return null

  const selectedAssets = tickers
    .map((t) => allData.find((d) => d.Ticker === t))
    .filter((d): d is DashboardData => d !== undefined)

  const renderMetricRow = (
    label: string,
    getValue: (asset: DashboardData) => React.ReactNode,
    tooltipId?: string
  ) => {
    return (
      <tr style={{ borderBottom: '1px solid var(--border)' }}>
        <td
          className="py-2.5 px-4 text-xs font-medium sticky left-0 z-10 glass"
          style={{ color: 'var(--text-2)', minWidth: 160, background: 'var(--surface)' }}
        >
          {tooltipId ? <InfoTooltip id={tooltipId}>{label}</InfoTooltip> : label}
        </td>
        {selectedAssets.map((asset) => (
          <td
            key={asset.Ticker}
            className="py-2.5 px-4 text-sm text-center font-mono font-medium"
            style={{ color: 'var(--text)', minWidth: 140 }}
          >
            {getValue(asset)}
          </td>
        ))}
      </tr>
    )
  }

  return (
    <ModalShell title="Compare stocks" onClose={onClose} className="max-w-5xl overflow-hidden" overlayClassName="">
        {/* macOS Window Titlebar Header */}
        <div
          className="flex items-center justify-between px-6 py-4 glass-strong"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <div className="flex items-center gap-3">
            <div className="h-4 w-px bg-white/10 mx-1" />
            <div>
              <h2 className="text-base font-semibold tracking-tight" style={{ color: 'var(--text)' }}>
                Stock Comparison
              </h2>
              <p className="text-[12px]" style={{ color: 'var(--text-3)' }}>
                {selectedAssets.length} stock{selectedAssets.length === 1 ? '' : 's'} selected for comparison
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="icon-button"
            style={{ color: 'var(--text-2)' }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-auto p-6 scrollbar-thin">
          {selectedAssets.length === 0 ? (
            <div className="py-12 text-center text-sm" style={{ color: 'var(--text-3)' }}>
              No stocks selected for comparison. Select stocks in Screener tab to compare.
            </div>
          ) : (
            <>
              {/* Factor Radar Chart */}
              {selectedAssets.every(asset => asset.Composite_Score != null) && <div className="mb-6 card p-4">
                <div className="text-xs font-semibold  tracking-normal mb-2 text-center" style={{ color: 'var(--brand)' }}>
                  Factor Radar
                </div>
                <FactorRadarChart assets={selectedAssets} />
              </div>}

              <table className="w-full text-left border-collapse">
              <thead>
                <tr style={{ borderBottom: '2px solid var(--glass-border-strong)' }}>
                  <th
                    className="py-3 px-4 text-xs font-semibold  tracking-normal sticky left-0 z-10 glass-strong"
                    style={{ color: 'var(--text-3)' }}
                  >
                    Asset
                  </th>
                  {selectedAssets.map((asset) => (
                    <th key={asset.Ticker} className="py-3 px-4 text-center min-w-[140px]">
                      <div className="flex flex-col items-center gap-1">
                        <div className="flex items-center justify-between w-full">
                          <span
                            onClick={() => {
                              onSelectTicker(asset.Ticker)
                              onClose()
                            }}
                            className="font-semibold text-sm cursor-pointer hover:underline"
                            style={{ color: 'var(--brand)' }}
                          >
                            {asset.Ticker.replace('.NS', '')}
                          </span>
                          <button
                            onClick={() => onRemoveTicker(asset.Ticker)}
                            className="p-1 rounded text-[var(--red)] hover:bg-[var(--red-bg)] transition-colors"
                            title="Remove from comparison"
                          >
                            <Minus size={14} />
                          </button>
                        </div>
                        <span className="text-[12px] truncate max-w-[130px]" style={{ color: 'var(--text-3)' }}>
                          {asset.Sector}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* General Info */}
                <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                  <td
                    colSpan={selectedAssets.length + 1}
                    className="py-1.5 px-4 text-[12px] font-semibold  tracking-normal"
                    style={{ color: 'var(--brand)' }}
                  >
                    Valuation &amp; Profile
                  </td>
                </tr>
                {renderMetricRow('Price', (a) => `₹${num(a.Price)}`, 'chart.price')}
                {renderMetricRow(
                  '1D Change',
                  (a) => (
                    <span className={a['1d_Chg_%'] && a['1d_Chg_%'] >= 0 ? 'text-[var(--green)]' : 'text-[var(--red)]'}>
                      {a['1d_Chg_%'] ? `${a['1d_Chg_%'] >= 0 ? '+' : ''}${a['1d_Chg_%'].toFixed(2)}%` : '-'}
                    </span>
                  ),
                  'chart.1d-change'
                )}
                {renderMetricRow('Market Cap', (a) => (a.Market_Cap_B ? `₹${num(a.Market_Cap_B)}B` : '-'), 'chart.market-cap')}
                {renderMetricRow('Forward P/E', (a) => num(a['Forward_P/E']), 'chart.forward-pe')}

                {/* Score Section */}
                <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                  <td
                    colSpan={selectedAssets.length + 1}
                    className="py-1.5 px-4 text-[12px] font-semibold  tracking-normal"
                    style={{ color: 'var(--blue)' }}
                  >
                    Composite &amp; Sub-Scores
                  </td>
                </tr>
                {renderMetricRow(
                  'Composite Score',
                  (a) => (
                    <span className={`px-2 py-0.5 rounded-md font-semibold ${scoreColor(a.Composite_Score)}`}>
                      {num(a.Composite_Score)}/10
                    </span>
                  ),
                  'chart.score.composite'
                )}
                {renderMetricRow(
                  'Tech Score',
                  (a) => <span className={scoreColor(a.Tech_Score)}>{num(a.Tech_Score)}/10</span>,
                  'chart.tech-score'
                )}
                {renderMetricRow('Fund Score', (a) => `${num(a.Fund_Score)}/10`, 'chart.fund-score')}
                {renderMetricRow('Research Score', (a) => `${num(a.Research_Score)}/10`, 'chart.score.research')}
                {renderMetricRow('Conviction', (a) => a.Conviction || '-', 'chart.conviction')}

                {/* Quantitative Factor Section */}
                <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                  <td
                    colSpan={selectedAssets.length + 1}
                    className="py-1.5 px-4 text-[12px] font-semibold  tracking-normal"
                    style={{ color: 'var(--amber)' }}
                  >
                    Quantitative Factors
                  </td>
                </tr>
                {renderMetricRow('Piotroski F-Score', (a) => `${a.Piotroski_F ?? '-'}/9`, 'chart.piotroski')}
                {renderMetricRow('Gross Profit Score', (a) => num(a.Gross_Profit_Score), 'chart.gross-profit')}
                {renderMetricRow('Value Score', (a) => num(a.Value_Score), 'chart.value-score')}
                {renderMetricRow('Investment Factor', (a) => num(a.Investment_Score), 'chart.investment')}
                {renderMetricRow('Earnings Quality', (a) => num(a.Earnings_Quality), 'chart.earnings-quality')}
                {renderMetricRow('SUE Score', (a) => num(a.SUE_Score), 'chart.sue')}

                {/* Technical Signals */}
                <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                  <td
                    colSpan={selectedAssets.length + 1}
                    className="py-1.5 px-4 text-[12px] font-semibold  tracking-normal"
                    style={{ color: 'var(--green)' }}
                  >
                    Technicals &amp; Risk
                  </td>
                </tr>
                {renderMetricRow('RSI (14)', (a) => num(a.RSI_Value), 'chart.rsi')}
                {renderMetricRow('ADX (14)', (a) => num(a.ADX_Value), 'chart.adx')}
                {renderMetricRow('Supertrend Signal', (a) => a.ST_Signal || '-', 'chart.supertrend')}
                {renderMetricRow('Beta', (a) => (a.Beta != null ? a.Beta.toFixed(2) : '-'), 'chart.beta')}
                {renderMetricRow('Vol (60D)', (a) => `${num(a.Vol_60D)}%`, 'chart.vol-60d')}
                {renderMetricRow('Sharpe Ratio', (a) => num(a.Sharpe), 'chart.sharpe')}
              </tbody>
            </table>
            </>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-6 py-3 text-xs glass"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <span style={{ color: 'var(--text-3)' }}>Click a stock to view its chart</span>
          <button type="button" aria-label="Close dialog"
            onClick={onClose}
            className="icon-button"
            style={{
              background: 'var(--accent-fill)',
              color: 'var(--on-accent)',
            }}
          >
            Close
          </button>
        </div>
    </ModalShell>
  )
}
