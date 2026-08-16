import React, { useState } from 'react'
import type { DashboardData } from '../../types'
import { FactorRadarChart } from './FactorRadarChart'
import { formatNum as num, colorCode, scoreColor, getBadgeClass } from '../../utils/formatters'
import { X, Printer, Copy, Check, FileText } from '@phosphor-icons/react'

interface Props {
  asset: DashboardData | null
  isOpen: boolean
  onClose: () => void
  peerGroup?: DashboardData[]
}

export const EquityFactsheetModal: React.FC<Props> = ({ asset, isOpen, onClose, peerGroup = [] }) => {
  const [copied, setCopied] = useState(false)

  if (!isOpen || !asset) return null

  const ticker = asset.Ticker.replace('.NS', '')
  const cmp = asset.Price ? `₹${asset.Price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : 'N/A'
  const chg = asset['1d_Chg_%'] != null ? `${asset['1d_Chg_%'] >= 0 ? '+' : ''}${asset['1d_Chg_%'].toFixed(2)}%` : '-'
  const mktCap = asset.Market_Cap_B ? `₹${asset.Market_Cap_B.toLocaleString('en-IN')}B` : 'N/A'

  const handlePrint = () => {
    window.print()
  }

  const handleCopySummary = async () => {
    const summary = `ALPHA QUANT RESEARCH FACTSHEET
----------------------------------------
Ticker: ${ticker} (${asset.Long_Name || ticker})
Exchange: NSE India | Sector: ${asset.Sector || 'N/A'}
LTP: ${cmp} (${chg}) | Market Cap: ${mktCap}
Composite Score: ${num(asset.Composite_Score)}/10 [${asset.Conviction || 'Hold'}]
Piotroski F-Score: ${asset.Piotroski_F ?? '-'}/9
12M Momentum: ${asset.Momentum_12M != null ? `${(asset.Momentum_12M * 100).toFixed(1)}%` : '-'}
P/E: ${num(asset['P/E'])}x | ROE: ${asset['ROE_%'] ? `${asset['ROE_%']}%` : '-'}
Technical Trend: ${asset.Sig_Supertrend === 1 ? 'Bullish' : asset.Sig_Supertrend === -1 ? 'Bearish' : 'Neutral'}
----------------------------------------
Platform: https://quant-alpha-sage.vercel.app/?ticker=${ticker}`

    try {
      await navigator.clipboard.writeText(summary)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/70 backdrop-blur-md animate-fade-in" onClick={onClose}>
      <div
        className="relative w-full max-w-4xl max-h-[95vh] overflow-y-auto card p-4 sm:p-6 shadow-2xl rounded-2xl animate-scale-up factsheet-container"
        style={{ background: 'var(--surface-3)', border: '1px solid var(--border-2)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Top Control Bar (Hidden on Print) */}
        <div className="flex items-center justify-between pb-3 mb-4 print:hidden border-b border-[var(--glass-border)]">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl text-[var(--brand)]" style={{ background: 'var(--brand-soft)' }}>
              <FileText size={20} weight="duotone" />
            </div>
            <div>
              <h3 className="text-base font-bold" style={{ color: 'var(--text)' }}>Institutional Research Factsheet</h3>
              <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>1-Page Quantitative Equity Tear-Sheet</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopySummary}
              className="btn-glass text-xs py-1.5 px-3 flex items-center gap-1.5"
              title="Copy text summary"
            >
              {copied ? <Check size={14} className="text-[var(--green)]" /> : <Copy size={14} />}
              <span>{copied ? 'Copied' : 'Copy Text'}</span>
            </button>
            <button
              onClick={handlePrint}
              className="btn-primary text-xs py-1.5 px-3.5 flex items-center gap-1.5 font-semibold"
              title="Print or Save as PDF"
            >
              <Printer size={15} weight="bold" />
              <span>Print / Save PDF</span>
            </button>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 text-[var(--text-3)] transition-colors ml-1">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Printable Factsheet Content Area */}
        <div id="factsheet-printable-area" className="p-4 sm:p-6 rounded-xl space-y-4" style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)' }}>
          {/* Institutional Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-[var(--glass-border)]">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] tracking-wider uppercase font-bold text-[var(--brand)] font-mono">ALPHA QUANT RESEARCH</span>
                <span className="text-[10px] text-[var(--text-3)]">•</span>
                <span className="text-[10px] text-[var(--text-3)]">FMS Delhi Quant Club</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black mt-0.5" style={{ color: 'var(--text)' }}>
                {ticker} <span className="text-sm font-normal text-[var(--text-2)]">({asset.Long_Name || ticker})</span>
              </h1>
              <p className="text-[11px] text-[var(--text-3)] mt-0.5">
                NSE India • {asset.Sector || 'Equities'} • {asset.Industry || 'Industry N/A'}
              </p>
            </div>

            <div className="text-left sm:text-right">
              <div className="text-2xl font-black font-mono" style={{ color: 'var(--text)' }}>{cmp}</div>
              <div className={`text-xs font-bold font-mono ${colorCode(asset['1d_Chg_%'])}`}>
                {chg} (1D)
              </div>
              <div className="text-[10px] text-[var(--text-3)] mt-0.5 font-mono">
                Market Cap: {mktCap}
              </div>
            </div>
          </div>

          {/* Hero Conviction & Scoring Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-2.5 card text-center rounded-xl">
              <span className="text-[9px] uppercase font-semibold text-[var(--text-3)] block">Conviction Tier</span>
              <span className={`badge mt-1 inline-block ${getBadgeClass(asset.Conviction)}`}>
                {asset.Conviction || 'Hold'}
              </span>
            </div>
            <div className="p-2.5 card text-center rounded-xl">
              <span className="text-[9px] uppercase font-semibold text-[var(--text-3)] block">Composite Score</span>
              <span className={`text-base font-bold font-mono mt-0.5 block ${scoreColor(asset.Composite_Score)}`}>
                {num(asset.Composite_Score)}/10
              </span>
            </div>
            <div className="p-2.5 card text-center rounded-xl">
              <span className="text-[9px] uppercase font-semibold text-[var(--text-3)] block">Piotroski F-Score</span>
              <span className="text-base font-bold font-mono mt-0.5 block" style={{ color: 'var(--text)' }}>
                {asset.Piotroski_F ?? '-'}/9
              </span>
            </div>
            <div className="p-2.5 card text-center rounded-xl">
              <span className="text-[9px] uppercase font-semibold text-[var(--text-3)] block">Technical Score</span>
              <span className={`text-base font-bold font-mono mt-0.5 block ${colorCode(asset.Tech_Score)}`}>
                {num(asset.Tech_Score)}
              </span>
            </div>
          </div>

          {/* Core Visuals: 10-Factor Spider Radar & Key Dimension Checklist */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Embedded Radar Chart */}
            <div className="p-3 card rounded-xl flex flex-col items-center justify-center">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--brand)] mb-1">
                10-Factor Academic DNA Polygon
              </span>
              <FactorRadarChart asset={asset} peerGroup={peerGroup} size={260} showLegend={true} />
            </div>

            {/* Financial Health & Valuation Table */}
            <div className="p-3.5 card rounded-xl flex flex-col justify-between">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--brand)] mb-2">
                Financial Health & Valuation Matrix
              </span>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-[var(--glass-border)]">
                  <span className="text-[var(--text-3)]">P/E Multiple</span>
                  <span className="font-mono font-medium">{num(asset['P/E'])}x</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[var(--glass-border)]">
                  <span className="text-[var(--text-3)]">Forward P/E</span>
                  <span className="font-mono font-medium">{num(asset['Forward_P/E'])}x</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[var(--glass-border)]">
                  <span className="text-[var(--text-3)]">Return on Equity</span>
                  <span className="font-mono font-medium">{asset['ROE_%'] != null ? `${asset['ROE_%'].toFixed(1)}%` : '-'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[var(--glass-border)]">
                  <span className="text-[var(--text-3)]">ROCE</span>
                  <span className="font-mono font-medium">{asset['ROCE_%'] != null ? `${asset['ROCE_%'].toFixed(1)}%` : '-'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[var(--glass-border)]">
                  <span className="text-[var(--text-3)]">Debt to Equity</span>
                  <span className="font-mono font-medium">{asset.Debt_to_Equity != null ? asset.Debt_to_Equity.toFixed(2) : '-'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[var(--glass-border)]">
                  <span className="text-[var(--text-3)]">Div Yield</span>
                  <span className="font-mono font-medium">{asset['Div_Yield_%'] != null ? `${asset['Div_Yield_%'].toFixed(2)}%` : '-'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[var(--glass-border)]">
                  <span className="text-[var(--text-3)]">Promoter Holding</span>
                  <span className="font-mono font-medium">{asset['Promoter_Holding_%'] != null ? `${asset['Promoter_Holding_%'].toFixed(1)}%` : '-'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[var(--glass-border)]">
                  <span className="text-[var(--text-3)]">Promoter Pledge</span>
                  <span className="font-mono font-medium">{asset['Promoter_Pledging_%'] != null ? `${asset['Promoter_Pledging_%'].toFixed(1)}%` : '0.0%'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[var(--glass-border)]">
                  <span className="text-[var(--text-3)]">Market Beta</span>
                  <span className="font-mono font-medium">{asset.Beta != null ? `${asset.Beta.toFixed(2)} β` : '-'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[var(--glass-border)]">
                  <span className="text-[var(--text-3)]">60D Volatility</span>
                  <span className="font-mono font-medium">{asset.Vol_60D != null ? `${asset.Vol_60D.toFixed(1)}%` : '-'}</span>
                </div>
              </div>

              {/* Technical Indicator Status Pills */}
              <div className="mt-3 pt-2 border-t border-[var(--glass-border)]">
                <span className="text-[9px] uppercase tracking-wider text-[var(--text-3)] font-semibold mb-1.5 block">
                  Technical Indicator States
                </span>
                <div className="flex flex-wrap gap-1.5 text-[10px]">
                  <span className={`px-2 py-0.5 rounded ${asset.Sig_Price_vs_SMA50 === 1 ? 'bg-green-500/10 text-green-500 font-bold' : 'bg-red-500/10 text-red-500'}`}>
                    SMA 50: {asset.Sig_Price_vs_SMA50 === 1 ? 'Above' : 'Below'}
                  </span>
                  <span className={`px-2 py-0.5 rounded ${asset.Sig_Price_vs_SMA200 === 1 ? 'bg-green-500/10 text-green-500 font-bold' : 'bg-red-500/10 text-red-500'}`}>
                    SMA 200: {asset.Sig_Price_vs_SMA200 === 1 ? 'Above' : 'Below'}
                  </span>
                  <span className={`px-2 py-0.5 rounded ${asset.Sig_Supertrend === 1 ? 'bg-green-500/10 text-green-500 font-bold' : 'bg-red-500/10 text-red-500'}`}>
                    Supertrend: {asset.Sig_Supertrend === 1 ? 'Bullish' : 'Bearish'}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-[var(--surface-3)] text-[var(--text-2)] font-mono">
                    RSI: {asset.RSI_Value ? asset.RSI_Value.toFixed(1) : '-'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Quantitative Thesis Brief */}
          <div className="p-3 card rounded-xl text-xs space-y-1">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--brand)]">
              Algorithmic Thesis Summary
            </span>
            <p className="text-[11px] leading-relaxed text-[var(--text-2)]">
              {ticker} displays a Composite Factor Score of <strong>{num(asset.Composite_Score)}/10</strong> with a Piotroski financial resilience rating of <strong>{asset.Piotroski_F ?? '-'}/9</strong>. 
              {asset.Momentum_12M != null && asset.Momentum_12M > 0.1 ? ` Strong 12-month relative momentum (+${(asset.Momentum_12M * 100).toFixed(1)}%) indicates sustained price trend persistence.` : ''}
              {asset.Value_Score != null && asset.Value_Score > 6 ? ` Valuation multiples remain attractive relative to ${asset.Sector || 'sector'} industry peers.` : ''}
              {asset.Beta != null && asset.Beta < 0.9 ? ` Low-beta defensive characteristics (${asset.Beta.toFixed(2)}x) offer favorable downside protection.` : ''}
            </p>
          </div>

          {/* Academic & Legal Disclaimer */}
          <div className="pt-2 border-t border-[var(--glass-border)] text-[9px] text-[var(--text-3)] flex items-center justify-between">
            <span>Generated on {new Date().toLocaleDateString('en-IN', { dateStyle: 'medium' })} • Alpha Research Club, FMS Delhi</span>
            <span>Academic quantitative research only • Not SEBI registered investment advice</span>
          </div>
        </div>
      </div>
    </div>
  )
}
