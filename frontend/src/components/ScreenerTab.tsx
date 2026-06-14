import React, { useState, useMemo } from 'react'
import type { DashboardData } from '../types'
import { num, colorCode, getSignalLabel, SortHeader } from './shared'
import { Info, Filter, X } from 'lucide-react'

interface Props {
  data: DashboardData[]
  onSelect: (ticker: string) => void
  expandedRow: string | null
  setExpandedRow: (ticker: string | null) => void
}

const CONVICTION_OPTIONS = ['Strong Buy', 'Buy', 'Hold', 'Caution', 'Avoid']

export default function ScreenerTab({ data, onSelect, expandedRow, setExpandedRow }: Props) {
  const [sortKey, setSortKey] = useState<string>('Composite_Score')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [showFilters, setShowFilters] = useState(false)

  const [minComposite, setMinComposite] = useState(0)
  const [minPiotroski, setMinPiotroski] = useState(0)
  const [selectedSectors, setSelectedSectors] = useState<string[]>([])
  const [selectedConvictions, setSelectedConvictions] = useState<string[]>([])
  const [minMarketCap, setMinMarketCap] = useState(0)
  const [maxDE, setMaxDE] = useState(999)

  // Derive unique sectors from data dynamically
  const availableSectors = useMemo(() => {
    const set = new Set<string>()
    data.forEach(d => { if (d.Sector && d.Sector !== 'Unknown' && d.Sector !== 'ETF') set.add(d.Sector) })
    return Array.from(set).sort()
  }, [data])

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const filteredData = useMemo(() => {
    const stringFields = new Set(['Ticker', 'Sector', 'Conviction', 'Industry', 'Long_Name', 'ST_Signal'])
    let arr = data.filter(d => {
      if (Number(d.Composite_Score) < minComposite) return false
      if (Number(d.Piotroski_F) < minPiotroski) return false
      if (selectedSectors.length > 0 && !selectedSectors.includes(d.Sector)) return false
      if (selectedConvictions.length > 0 && !selectedConvictions.includes(d.Conviction)) return false
      if (minMarketCap > 0 && Number(d.Market_Cap_B) < minMarketCap) return false
      if (maxDE < 999 && Number(d.Debt_to_Equity) > maxDE) return false
      return true
    })
    arr.sort((a, b) => {
      const av = (a as any)[sortKey]
      const bv = (b as any)[sortKey]
      if (stringFields.has(sortKey)) {
        return sortDir === 'asc' ? String(av || '').localeCompare(String(bv || '')) : String(bv || '').localeCompare(String(av || ''))
      }
      return sortDir === 'asc' ? (Number(av) || 0) - (Number(bv) || 0) : (Number(bv) || 0) - (Number(av) || 0)
    })
    return arr
  }, [data, sortKey, sortDir, minComposite, minPiotroski, selectedSectors, selectedConvictions, minMarketCap, maxDE])

  const activeFilterCount = [minComposite > 0, minPiotroski > 0, selectedSectors.length > 0, selectedConvictions.length > 0, minMarketCap > 0, maxDE < 999].filter(Boolean).length

  const clearFilters = () => {
    setMinComposite(0); setMinPiotroski(0); setSelectedSectors([])
    setSelectedConvictions([]); setMinMarketCap(0); setMaxDE(999)
  }

  const toggleSector = (s: string) => setSelectedSectors(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  const toggleConviction = (c: string) => setSelectedConvictions(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-6 w-1 bg-brand rounded-full"></div>
          <h2 className="font-display font-bold text-xl tracking-wide text-primary">Universe Screening</h2>
          <span className="font-mono text-[10px] text-muted">({filteredData.length}/{data.length})</span>
        </div>
        <button 
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-1.5 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest border transition-all ${showFilters ? 'border-brand bg-brand text-white' : 'border-border text-muted hover:text-primary hover:border-primary'}`}
        >
          <Filter size={12} /> Filters {activeFilterCount > 0 && <span className="ml-1 px-1.5 py-0.5 bg-white/20 rounded-sm text-[9px]">{activeFilterCount}</span>}
        </button>
      </div>

      {showFilters && (
        <div className="border border-border bg-card p-4 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-widest text-brand font-semibold">Screener Filters</span>
            {activeFilterCount > 0 && (
              <button onClick={clearFilters} className="flex items-center gap-1 font-mono text-[10px] text-muted hover:text-brand transition-colors">
                <X size={10} /> Clear All
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="font-mono text-[10px] text-muted uppercase mb-1 block">Min Composite: {minComposite.toFixed(1)}</label>
              <input type="range" min="0" max="10" step="0.5" value={minComposite} onChange={e => setMinComposite(Number(e.target.value))} className="w-full accent-brand" />
            </div>
            <div>
              <label className="font-mono text-[10px] text-muted uppercase mb-1 block">Min Piotroski: {minPiotroski}</label>
              <input type="range" min="0" max="9" step="1" value={minPiotroski} onChange={e => setMinPiotroski(Number(e.target.value))} className="w-full accent-brand" />
            </div>
            <div>
              <label className="font-mono text-[10px] text-muted uppercase mb-1 block">Min Market Cap: ₹{minMarketCap}B</label>
              <input type="range" min="0" max="500" step="10" value={minMarketCap} onChange={e => setMinMarketCap(Number(e.target.value))} className="w-full accent-brand" />
            </div>
            <div>
              <label className="font-mono text-[10px] text-muted uppercase mb-1 block">Max D/E: {maxDE >= 999 ? 'Any' : maxDE}</label>
              <input type="range" min="0" max="10" step="0.5" value={maxDE >= 999 ? 10 : maxDE} onChange={e => setMaxDE(Number(e.target.value) >= 10 ? 999 : Number(e.target.value))} className="w-full accent-brand" />
            </div>
            <div>
              <label className="font-mono text-[10px] text-muted uppercase mb-2 block">Sectors</label>
              <div className="flex flex-wrap gap-1">
                {availableSectors.map(s => (
                  <button key={s} onClick={() => toggleSector(s)} className={`px-2 py-0.5 font-mono text-[9px] border transition-all ${selectedSectors.includes(s) ? 'border-brand bg-brand text-white' : 'border-border text-muted hover:text-primary'}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="font-mono text-[10px] text-muted uppercase mb-2 block">Conviction</label>
              <div className="flex flex-wrap gap-1">
                {CONVICTION_OPTIONS.map(c => (
                  <button key={c} onClick={() => toggleConviction(c)} className={`px-2 py-0.5 font-mono text-[9px] border transition-all ${selectedConvictions.includes(c) ? 'border-brand bg-brand text-white' : 'border-border text-muted hover:text-primary'}`}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto border border-border bg-card shadow-sm rounded-sm">
        <table className="w-full text-left font-mono text-xs">
          <thead>
            <tr className="border-b border-border text-sub uppercase tracking-widest bg-black/5 dark:bg-black/50">
              <SortHeader field="Ticker" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>Ticker</SortHeader>
              <SortHeader field="Sector" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>Sector</SortHeader>
              <SortHeader field="Price" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>LTP</SortHeader>
              <SortHeader field="1d_Chg_%" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>1D %</SortHeader>
              <SortHeader field="Composite_Score" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>Composite</SortHeader>
              <SortHeader field="Tech_Score" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>Tech</SortHeader>
              <SortHeader field="Fund_Score" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>Fund</SortHeader>
              <SortHeader field="Research_Score" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>Research</SortHeader>
              <SortHeader field="Piotroski_F" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>F-Score</SortHeader>
              <SortHeader field="Momentum_12M" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>12M Mom</SortHeader>
              <SortHeader field="P/E" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>P/E</SortHeader>
              <SortHeader field="Debt_to_Equity" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>D/E</SortHeader>
              <SortHeader field="Conviction" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>Conviction</SortHeader>
              <th className="p-4"></th>
            </tr>
          </thead>
          <tbody>
            {filteredData.map((row, i) => (
              <React.Fragment key={i}>
                <tr 
                  className={`border-b border-border hover:bg-black/5 dark:hover:bg-white/5 transition-colors duration-200 ${expandedRow === row.Ticker ? 'bg-black/5 dark:bg-white/5' : ''}`}
                >
                  <td className="p-3 text-primary font-medium cursor-pointer" onClick={() => onSelect(row.Ticker)}>{row.Ticker.replace('.NS', '')}</td>
                  <td className="p-3 text-muted">{row.Sector || '-'}</td>
                  <td className="p-3 text-right text-muted">{num(row.Price)}</td>
                  <td className={`p-3 text-right font-medium ${colorCode(row['1d_Chg_%'])}`}>
                    {row['1d_Chg_%'] != null ? `${row['1d_Chg_%'] > 0 ? '+' : ''}${row['1d_Chg_%'].toFixed(2)}%` : '-'}
                  </td>
                  <td className={`p-3 text-right font-medium ${colorCode(row.Composite_Score)}`}>{num(row.Composite_Score)}</td>
                  <td className={`p-3 text-right font-medium ${colorCode(row.Tech_Score)}`}>{num(row.Tech_Score)}</td>
                  <td className={`p-3 text-right font-medium ${Number(row.Fund_Score) >= 5 ? 'text-green-600 dark:text-green-500' : 'text-primary'}`}>{num(row.Fund_Score)}</td>
                  <td className={`p-3 text-right font-medium ${Number(row.Research_Score) >= 7 ? 'text-green-600 dark:text-green-500' : Number(row.Research_Score) < 4 ? 'text-red-600 dark:text-red-500' : 'text-primary'}`}>{num(row.Research_Score)}</td>
                  <td className={`p-3 text-right font-medium ${Number(row.Piotroski_F) >= 7 ? 'text-green-600 dark:text-green-500' : Number(row.Piotroski_F) <= 3 ? 'text-red-600 dark:text-red-500' : 'text-primary'}`}>{row.Piotroski_F ?? '-'}<span className="text-muted">/9</span></td>
                  <td className={`p-3 text-right font-medium ${colorCode(row.Momentum_12M)}`}>{row.Momentum_12M != null ? `${(row.Momentum_12M * 100).toFixed(1)}%` : 'N/A'}</td>
                  <td className="p-3 text-right text-muted">{num(row['P/E'])}</td>
                  <td className="p-3 text-right text-muted">{num(row['Debt_to_Equity'])}</td>
                  <td className="p-3 font-medium">
                    <span className={`px-1.5 py-0.5 text-[9px] font-mono border rounded-sm ${
                      row.Conviction === 'Strong Buy' ? 'border-green-500/50 text-green-600 dark:text-green-400 bg-green-500/10' :
                      row.Conviction === 'Buy' ? 'border-blue-500/50 text-blue-600 dark:text-blue-400 bg-blue-500/10' :
                      row.Conviction === 'Caution' ? 'border-orange-500/50 text-orange-600 dark:text-orange-400 bg-orange-500/10' :
                      row.Conviction === 'Avoid' ? 'border-red-500/50 text-red-600 dark:text-red-400 bg-red-500/10' :
                      'border-border text-muted'
                    }`}>{row.Conviction || 'N/A'}</span>
                  </td>
                  <td className="p-3 text-center">
                    <button 
                      onClick={() => setExpandedRow(expandedRow === row.Ticker ? null : row.Ticker)}
                      className="text-sub hover:text-brand transition-colors"
                      title="View Score Breakdown"
                    >
                      <Info size={16} />
                    </button>
                  </td>
                </tr>
                {expandedRow === row.Ticker && (
                  <tr className="bg-black/5 dark:bg-black/20 border-b border-border">
                    <td colSpan={14} className="p-6">
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div>
                          <h4 className="font-mono text-[10px] uppercase tracking-widest text-brand mb-3">Technical Signals</h4>
                          <div className="space-y-2 font-mono text-[11px]">
                            {[
                              ['Price vs SMA50', row.Sig_Price_vs_SMA50], ['Price vs SMA200', row.Sig_Price_vs_SMA200],
                              ['SMA50 vs SMA200', row.Sig_SMA50_vs_SMA200], ['RSI', row.Sig_RSI],
                              ['MACD Cross', row.Sig_MACD_Cross], ['MACD Hist', row.Sig_MACD_Hist],
                              ['Stochastic', row.Sig_Stoch], ['Bollinger Bands', row.Sig_BB],
                              ['CCI', row.Sig_CCI], ['Volume Spike', row.Sig_Volume],
                              ['ADX Trend', row.Sig_ADX], ['Supertrend', row.Sig_Supertrend],
                              ['Vol Price Trend', row.Sig_VPT], ['Ichimoku Cloud', row.Sig_Ichimoku],
                            ].map(([label, val]) => (
                              <div key={label as string} className="flex items-center justify-between">
                                <span className="text-muted">{label}</span>
                                {getSignalLabel(val)}
                              </div>
                            ))}
                          </div>
                          <div className="mt-3 pt-3 border-t border-border grid grid-cols-3 gap-3 font-mono text-[10px]">
                            <div><span className="text-muted block">Bull Signals</span><span className="text-green-600 dark:text-green-500 font-semibold">{row.Bull_Count ?? '-'}</span></div>
                            <div><span className="text-muted block">Bear Signals</span><span className="text-red-600 dark:text-red-500 font-semibold">{row.Bear_Count ?? '-'}</span></div>
                            <div><span className="text-muted block">RS Percentile</span><span className="text-primary font-semibold">{num(row.RS_Percentile)}%</span></div>
                          </div>
                        </div>
                        <div>
                          <h4 className="font-mono text-[10px] uppercase tracking-widest text-brand mb-3">Research Factors</h4>
                          <div className="space-y-2 font-mono text-[11px]">
                            {[
                              ['Piotroski F-Score', `${row.Piotroski_F ?? '-'}/9`],
                              ['Gross Profitability', `${num(row.Gross_Profit_Score)}/10`],
                              ['Earnings Quality', `${num(row.Earnings_Quality)}/10`],
                              ['Volatility (60D)', row.Vol_60D != null ? `${row.Vol_60D.toFixed(1)}%` : 'N/A'],
                              ['1M Momentum', row.Momentum_1M != null ? `${(row.Momentum_1M * 100).toFixed(2)}%` : 'N/A'],
                              ['3M Momentum', row.Momentum_3M != null ? `${(row.Momentum_3M * 100).toFixed(2)}%` : 'N/A'],
                              ['6M Momentum', row.Momentum_6M != null ? `${(row.Momentum_6M * 100).toFixed(2)}%` : 'N/A'],
                              ['12M Momentum', row.Momentum_12M != null ? `${(row.Momentum_12M * 100).toFixed(2)}%` : 'N/A'],
                              ['Risk-Adj Mom', num(row.Risk_Adj_Mom)],
                              ['Z-Score (60D)', num(row.Z_Score_60)],
                              ['Reversion Signal', Number(row.Reversion_Signal) === 1 ? 'Oversold' : Number(row.Reversion_Signal) === -1 ? 'Overbought' : 'Neutral'],
                              ['Downside Dev', row.Downside_Dev != null ? `${row.Downside_Dev.toFixed(1)}%` : 'N/A'],
                            ].map(([label, val]) => (
                              <div key={label as string} className="flex items-center justify-between">
                                <span className="text-muted">{label}</span>
                                <span className="text-primary">{val}</span>
                              </div>
                            ))}
                          </div>
                          <div className="mt-4 pt-3 border-t border-border grid grid-cols-4 gap-3 font-mono text-[10px]">
                            <div><span className="text-muted block">Total Return</span><span className={`font-semibold ${colorCode(row['Total_Return_%'])}`}>{num(row['Total_Return_%'])}%</span></div>
                            <div><span className="text-muted block">Ann Vol</span><span className="text-primary">{num(row['Ann_Vol_%'])}%</span></div>
                            <div><span className="text-muted block">Sharpe</span><span className={`font-semibold ${colorCode(row.Sharpe)}`}>{num(row.Sharpe)}</span></div>
                            <div><span className="text-muted block">Max DD</span><span className="text-red-600 dark:text-red-500">{num(row['Max_Drawdown_%'])}%</span></div>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
