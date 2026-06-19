import React, { useState, useMemo } from 'react'
import type { DashboardData } from '../types'
import { num, colorCode, getSignalLabel, SortHeader, MiniSparkline } from './shared'
import { Info, Filter, X, Star } from 'lucide-react'

interface Props {
  data: DashboardData[]
  onSelect: (ticker: string) => void
  expandedRow: string | null
  setExpandedRow: (ticker: string | null) => void
  watchlist: string[]
  toggleWatchlist: (ticker: string) => void
  scoreHistory: Record<string, {date: string; composite: number}[]>
}

const CONVICTION_OPTIONS = ['Strong Buy', 'Buy', 'Hold', 'Caution', 'Avoid']

export default function ScreenerTab({ data, onSelect, expandedRow, setExpandedRow, watchlist, toggleWatchlist, scoreHistory }: Props) {
  const [sortKey, setSortKey] = useState<string>('Composite_Score')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [showFilters, setShowFilters] = useState(false)

  const [minComposite, setMinComposite] = useState(0)
  const [minPiotroski, setMinPiotroski] = useState(0)
  const [selectedSectors, setSelectedSectors] = useState<string[]>([])
  const [selectedConvictions, setSelectedConvictions] = useState<string[]>([])
  const [minMarketCap, setMinMarketCap] = useState(0)
  const [maxDE, setMaxDE] = useState(999)

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
        <span className="font-mono text-[10px] text-sub uppercase tracking-widest sm:hidden">
          {filteredData.length} results
        </span>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-1.5 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest border transition-all rounded-md ${showFilters ? 'border-brand bg-brand text-background font-semibold' : 'border-border text-muted hover:text-primary hover:border-brand/30'}`}
        >
          <Filter size={12} /> Filters {activeFilterCount > 0 && <span className="ml-1 px-1.5 py-0.5 bg-brand/20 rounded-md text-[9px]">{activeFilterCount}</span>}
        </button>
      </div>

      {showFilters && (
        <div className="border border-border bg-card p-4 rounded-card shadow-card space-y-4 animate-fade-in">
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
              <div className="flex flex-wrap gap-1.5">
                {availableSectors.map(s => (
                  <button key={s} onClick={() => toggleSector(s)} className={`px-2 py-0.5 font-mono text-[9px] border transition-all rounded-md ${selectedSectors.includes(s) ? 'border-brand bg-brand text-background font-semibold' : 'border-border text-muted hover:text-primary hover:border-brand/30'}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="font-mono text-[10px] text-muted uppercase mb-2 block">Conviction</label>
              <div className="flex flex-wrap gap-1.5">
                {CONVICTION_OPTIONS.map(c => (
                  <button key={c} onClick={() => toggleConviction(c)} className={`px-2 py-0.5 font-mono text-[9px] border transition-all rounded-md ${selectedConvictions.includes(c) ? 'border-brand bg-brand text-background font-semibold' : 'border-border text-muted hover:text-primary hover:border-brand/30'}`}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mobile: Card view */}
      <div className="sm:hidden space-y-3">
        {filteredData.map((row, i) => (
          <div
            key={i}
            className={`card-base p-4 rounded-card transition-all ${expandedRow === row.Ticker ? 'border-brand/40' : ''}`}
          >
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() => onSelect(row.Ticker)}
                className="font-display font-bold text-lg text-primary tracking-tight"
              >
                {row.Ticker.replace('.NS', '')}<span className="text-brand">.</span>
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleWatchlist(row.Ticker)}
                  className={`transition-colors ${watchlist.includes(row.Ticker) ? 'text-brand' : 'text-sub hover:text-brand'}`}
                >
                  <Star size={14} fill={watchlist.includes(row.Ticker) ? 'currentColor' : 'none'} />
                </button>
                <span className={`whitespace-nowrap px-1.5 py-0.5 text-[9px] font-mono border rounded-md ${
                  row.Conviction === 'Strong Buy' ? 'border-green-500/40 text-green-600 dark:text-green-400 bg-green-500/10' :
                  row.Conviction === 'Buy' ? 'border-blue-500/40 text-blue-600 dark:text-blue-400 bg-blue-500/10' :
                  row.Conviction === 'Caution' ? 'border-orange-500/40 text-orange-600 dark:text-orange-400 bg-orange-500/10' :
                  row.Conviction === 'Avoid' ? 'border-red-500/40 text-red-600 dark:text-red-400 bg-red-500/10' :
                  'border-border text-muted'
                }`}>{row.Conviction || 'N/A'}</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 font-mono text-[10px] mb-3">
              <div>
                <span className="text-sub block uppercase">LTP</span>
                <span className="text-primary font-medium">{num(row.Price)}</span>
              </div>
              <div>
                <span className="text-sub block uppercase">1D %</span>
                <span className={`font-medium ${colorCode(row['1d_Chg_%'])}`}>
                  {row['1d_Chg_%'] != null ? `${row['1d_Chg_%'] > 0 ? '+' : ''}${row['1d_Chg_%'].toFixed(2)}%` : '-'}
                </span>
              </div>
              <div>
                <span className="text-sub block uppercase">Comp</span>
                <span className={`font-medium ${colorCode(row.Composite_Score)}`}>{num(row.Composite_Score)}</span>
              </div>
              <div>
                <span className="text-sub block uppercase">Sector</span>
                <span className="text-primary truncate block">{row.Sector || '-'}</span>
              </div>
              <div>
                <span className="text-sub block uppercase">Trend</span>
                <MiniSparkline values={(scoreHistory[row.Ticker] || []).slice(-10).map(s => s.composite)} />
              </div>
              <div>
                <span className="text-sub block uppercase">Tech</span>
                <span className={`font-medium ${colorCode(row.Tech_Score)}`}>{num(row.Tech_Score)}</span>
              </div>
            </div>

            <button
              onClick={() => setExpandedRow(expandedRow === row.Ticker ? null : row.Ticker)}
              className="w-full flex items-center justify-center gap-1 py-1.5 font-mono text-[9px] text-sub border border-border rounded-md hover:border-brand/30 hover:text-brand transition-all"
            >
              <Info size={10} />
              {expandedRow === row.Ticker ? 'Less' : 'More'}
            </button>

            {expandedRow === row.Ticker && (
              <div className="mt-3 pt-3 border-t border-border space-y-4 animate-fade-in">
                <div>
                  <h4 className="font-mono text-[10px] uppercase tracking-widest text-brand mb-2">Technical Signals</h4>
                  <div className="space-y-1.5 font-mono text-[10px]">
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
                  <div className="mt-3 pt-2 border-t border-border grid grid-cols-3 gap-2 font-mono text-[9px]">
                    <div><span className="text-sub block">Bull</span><span className="text-green-600 dark:text-green-400 font-semibold">{row.Bull_Count ?? '-'}</span></div>
                    <div><span className="text-sub block">Bear</span><span className="text-red-600 dark:text-red-400 font-semibold">{row.Bear_Count ?? '-'}</span></div>
                    <div><span className="text-sub block">RS %ile</span><span className="text-primary font-semibold">{num(row.RS_Percentile)}%</span></div>
                  </div>
                </div>
                <div>
                  <h4 className="font-mono text-[10px] uppercase tracking-widest text-brand mb-2">Research Factors</h4>
                  <div className="space-y-1.5 font-mono text-[10px]">
                    {[
                      ['Piotroski F-Score', `${row.Piotroski_F ?? '-'}/9`],
                      ['Gross Profitability', `${num(row.Gross_Profit_Score)}/10`],
                      ['Earnings Quality', `${num(row.Earnings_Quality)}/10`],
                      ['Volatility (60D)', row.Vol_60D != null ? `${row.Vol_60D.toFixed(1)}%` : 'N/A'],
                      ['12M Momentum', row.Momentum_12M != null ? `${(row.Momentum_12M * 100).toFixed(1)}%` : 'N/A'],
                      ['Risk-Adj Mom', num(row.Risk_Adj_Mom)],
                      ['Z-Score (60D)', num(row.Z_Score_60)],
                      ['Sharpe', num(row.Sharpe)],
                      ['Max DD', num(row['Max_Drawdown_%'])],
                    ].map(([label, val]) => (
                      <div key={label as string} className="flex items-center justify-between">
                        <span className="text-muted">{label}</span>
                        <span className="text-primary">{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Desktop: Table view */}
      <div className="overflow-x-auto border border-border bg-card shadow-card rounded-card hidden sm:block">
        <table className="w-full text-left font-mono text-xs">
          <thead>
            <tr className="border-b border-border text-sub uppercase tracking-widest bg-brand-soft">
              <SortHeader field="Ticker" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>Ticker</SortHeader>
              <SortHeader field="Sector" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}><span className="hidden md:inline">Sector</span></SortHeader>
              <SortHeader field="Price" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>LTP</SortHeader>
              <SortHeader field="1d_Chg_%" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>1D %</SortHeader>
              <SortHeader field="Composite_Score" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>Comp</SortHeader>
              <th className="p-3 font-semibold text-center">Trend</th>
              <SortHeader field="Tech_Score" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}><span className="hidden md:inline">Tech</span></SortHeader>
              <SortHeader field="Fund_Score" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}><span className="hidden lg:inline">Fund</span></SortHeader>
              <SortHeader field="Research_Score" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}><span className="hidden lg:inline">Research</span></SortHeader>
              <SortHeader field="Piotroski_F" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}><span className="hidden lg:inline">F-Score</span></SortHeader>
              <SortHeader field="Momentum_12M" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}><span className="hidden xl:inline">12M Mom</span></SortHeader>
              <SortHeader field="P/E" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}><span className="hidden xl:inline">P/E</span></SortHeader>
              <SortHeader field="Debt_to_Equity" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}><span className="hidden xl:inline">D/E</span></SortHeader>
              <SortHeader field="Conviction" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>Conv</SortHeader>
              <th className="p-4"></th>
            </tr>
          </thead>
          <tbody>
            {filteredData.map((row, i) => (
              <React.Fragment key={i}>
                <tr
                  className={`border-b border-border hover:bg-brand-soft transition-colors duration-200 ${expandedRow === row.Ticker ? 'bg-brand-soft' : ''}`}
                >
                  <td className="p-3 text-primary font-medium cursor-pointer hover:text-brand transition-colors" onClick={() => onSelect(row.Ticker)}>{row.Ticker.replace('.NS', '')}</td>
                  <td className="p-3 text-muted hidden md:table-cell">{row.Sector || '-'}</td>
                  <td className="p-3 text-right text-muted">{num(row.Price)}</td>
                  <td className={`p-3 text-right font-medium ${colorCode(row['1d_Chg_%'])}`}>
                    {row['1d_Chg_%'] != null ? `${row['1d_Chg_%'] > 0 ? '+' : ''}${row['1d_Chg_%'].toFixed(2)}%` : '-'}
                  </td>
                  <td className={`p-3 text-right font-medium ${colorCode(row.Composite_Score)}`}>{num(row.Composite_Score)}</td>
                  <td className="p-3 text-center">
                    <MiniSparkline values={(scoreHistory[row.Ticker] || []).slice(-10).map(s => s.composite)} />
                  </td>
                  <td className={`p-3 text-right font-medium hidden md:table-cell ${colorCode(row.Tech_Score)}`}>{num(row.Tech_Score)}</td>
                  <td className={`p-3 text-right font-medium hidden lg:table-cell ${Number(row.Fund_Score) >= 5 ? 'text-green-600 dark:text-green-400' : 'text-primary'}`}>{num(row.Fund_Score)}</td>
                  <td className={`p-3 text-right font-medium hidden lg:table-cell ${Number(row.Research_Score) >= 7 ? 'text-green-600 dark:text-green-400' : Number(row.Research_Score) < 4 ? 'text-red-600 dark:text-red-400' : 'text-primary'}`}>{num(row.Research_Score)}</td>
                  <td className={`p-3 text-right font-medium hidden lg:table-cell ${Number(row.Piotroski_F) >= 7 ? 'text-green-600 dark:text-green-400' : Number(row.Piotroski_F) <= 3 ? 'text-red-600 dark:text-red-400' : 'text-primary'}`}>{row.Piotroski_F ?? '-'}<span className="text-sub">/9</span></td>
                  <td className={`p-3 text-right font-medium hidden xl:table-cell ${colorCode(row.Momentum_12M)}`}>{row.Momentum_12M != null ? `${(row.Momentum_12M * 100).toFixed(1)}%` : 'N/A'}</td>
                  <td className="p-3 text-right text-muted hidden xl:table-cell">{num(row['P/E'])}</td>
                  <td className="p-3 text-right text-muted hidden xl:table-cell">{num(row['Debt_to_Equity'])}</td>
                  <td className="p-3 font-medium">
                    <span className={`whitespace-nowrap px-1.5 py-0.5 text-[9px] font-mono border rounded-md ${
                      row.Conviction === 'Strong Buy' ? 'border-green-500/40 text-green-600 dark:text-green-400 bg-green-500/10' :
                      row.Conviction === 'Buy' ? 'border-blue-500/40 text-blue-600 dark:text-blue-400 bg-blue-500/10' :
                      row.Conviction === 'Caution' ? 'border-orange-500/40 text-orange-600 dark:text-orange-400 bg-orange-500/10' :
                      row.Conviction === 'Avoid' ? 'border-red-500/40 text-red-600 dark:text-red-400 bg-red-500/10' :
                      'border-border text-muted'
                    }`}>{row.Conviction || 'N/A'}</span>
                  </td>
                  <td className="p-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleWatchlist(row.Ticker) }}
                        className={`transition-colors ${watchlist.includes(row.Ticker) ? 'text-brand' : 'text-sub hover:text-brand'}`}
                        title={watchlist.includes(row.Ticker) ? 'Remove from Watchlist' : 'Add to Watchlist'}
                      >
                        <Star size={14} fill={watchlist.includes(row.Ticker) ? 'currentColor' : 'none'} />
                      </button>
                      <button
                        onClick={() => setExpandedRow(expandedRow === row.Ticker ? null : row.Ticker)}
                        className="text-sub hover:text-brand transition-colors"
                        title="View Score Breakdown"
                      >
                        <Info size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
                {expandedRow === row.Ticker && (
                  <tr className="bg-brand-soft border-b border-border">
                    <td colSpan={15} className="p-6">
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="flex flex-col">
                          <h4 className="font-mono text-[10px] uppercase tracking-widest text-brand mb-3 font-semibold">Technical Signals</h4>
                          <div className="space-y-2 font-mono text-[11px] flex-1">
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
                          <div className="mt-4 pt-3 border-t border-border grid grid-cols-3 gap-3 font-mono text-[10px]">
                            <div><span className="text-sub block">Bull Signals</span><span className="text-green-600 dark:text-green-400 font-semibold">{row.Bull_Count ?? '-'}</span></div>
                            <div><span className="text-sub block">Bear Signals</span><span className="text-red-600 dark:text-red-400 font-semibold">{row.Bear_Count ?? '-'}</span></div>
                            <div><span className="text-sub block">RS Percentile</span><span className="text-primary font-semibold">{num(row.RS_Percentile)}%</span></div>
                          </div>
                        </div>
                        <div className="flex flex-col">
                          <h4 className="font-mono text-[10px] uppercase tracking-widest text-brand mb-3 font-semibold">Research Factors</h4>
                          <div className="space-y-2 font-mono text-[11px] flex-1">
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
                            <div><span className="text-sub block">Total Return</span><span className={`font-semibold ${colorCode(row['Total_Return_%'])}`}>{num(row['Total_Return_%'])}%</span></div>
                            <div><span className="text-sub block">Ann Vol</span><span className="text-primary">{num(row['Ann_Vol_%'])}%</span></div>
                            <div><span className="text-sub block">Sharpe</span><span className={`font-semibold ${colorCode(row.Sharpe)}`}>{num(row.Sharpe)}</span></div>
                            <div><span className="text-sub block">Max DD</span><span className="text-red-600 dark:text-red-400">{num(row['Max_Drawdown_%'])}%</span></div>
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
