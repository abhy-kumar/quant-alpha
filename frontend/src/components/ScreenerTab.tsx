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

const convictionStyle = (c: string) => {
  if (c === 'Strong Buy') return { background: 'var(--green-soft)', color: 'var(--green)' }
  if (c === 'Buy') return { background: 'var(--blue-soft)', color: 'var(--blue)' }
  if (c === 'Caution') return { background: 'var(--amber-soft)', color: 'var(--amber)' }
  if (c === 'Avoid') return { background: 'var(--red-soft)', color: 'var(--red)' }
  return { background: 'var(--surface)', color: 'var(--text-muted)' }
}

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
    <div className="space-y-5">
      {/* Section heading */}
      <div>
        <h1 className="text-xl font-semibold" style={{ color: 'var(--text-main)' }}>Universe Screener</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-sub)' }}>
          {data.length} securities across NSE. Sort, filter, and expand for signal breakdowns.
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex items-center justify-between">
        <span className="text-sm" style={{ color: 'var(--text-sub)' }}>
          {filteredData.length} results
        </span>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-all"
          style={{
            background: showFilters ? 'var(--brand)' : 'var(--bg-card)',
            color: showFilters ? '#fff' : 'var(--text-muted)',
            border: `1px solid ${showFilters ? 'var(--brand)' : 'var(--border-color)'}`,
            boxShadow: showFilters ? 'none' : 'var(--shadow-sm)',
          }}
        >
          <Filter size={14} /> Filters {activeFilterCount > 0 && <span className="px-1.5 py-0.5 text-[10px] rounded-full" style={{ background: showFilters ? 'rgba(255,255,255,0.2)' : 'var(--brand-soft)', color: showFilters ? '#fff' : 'var(--brand)' }}>{activeFilterCount}</span>}
        </button>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="rounded-2xl p-5 animate-fade-up" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow)' }}>
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--brand)' }}>Filters</span>
            {activeFilterCount > 0 && (
              <button onClick={clearFilters} className="flex items-center gap-1 text-xs transition-colors" style={{ color: 'var(--text-sub)' }}>
                <X size={12} /> Clear all
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <div>
              <label className="text-xs mb-1.5 block" style={{ color: 'var(--text-muted)' }}>Min composite: {minComposite.toFixed(1)}</label>
              <input type="range" min="0" max="10" step="0.5" value={minComposite} onChange={e => setMinComposite(Number(e.target.value))} className="w-full" />
            </div>
            <div>
              <label className="text-xs mb-1.5 block" style={{ color: 'var(--text-muted)' }}>Min Piotroski: {minPiotroski}</label>
              <input type="range" min="0" max="9" step="1" value={minPiotroski} onChange={e => setMinPiotroski(Number(e.target.value))} className="w-full" />
            </div>
            <div>
              <label className="text-xs mb-1.5 block" style={{ color: 'var(--text-muted)' }}>Min market cap: ₹{minMarketCap}B</label>
              <input type="range" min="0" max="500" step="10" value={minMarketCap} onChange={e => setMinMarketCap(Number(e.target.value))} className="w-full" />
            </div>
            <div>
              <label className="text-xs mb-1.5 block" style={{ color: 'var(--text-muted)' }}>Max D/E: {maxDE >= 999 ? 'Any' : maxDE}</label>
              <input type="range" min="0" max="10" step="0.5" value={maxDE >= 999 ? 10 : maxDE} onChange={e => setMaxDE(Number(e.target.value) >= 10 ? 999 : Number(e.target.value))} className="w-full" />
            </div>
            <div>
              <label className="text-xs mb-2 block" style={{ color: 'var(--text-muted)' }}>Sectors</label>
              <div className="flex flex-wrap gap-1.5">
                {availableSectors.map(s => (
                  <button key={s} onClick={() => toggleSector(s)} className="px-2.5 py-1 text-[11px] font-medium rounded-lg transition-all" style={selectedSectors.includes(s) ? { background: 'var(--brand)', color: '#fff' } : { background: 'var(--surface)', color: 'var(--text-muted)' }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs mb-2 block" style={{ color: 'var(--text-muted)' }}>Conviction</label>
              <div className="flex flex-wrap gap-1.5">
                {CONVICTION_OPTIONS.map(c => (
                  <button key={c} onClick={() => toggleConviction(c)} className="px-2.5 py-1 text-[11px] font-medium rounded-lg transition-all" style={selectedConvictions.includes(c) ? { background: 'var(--brand)', color: '#fff' } : { background: 'var(--surface)', color: 'var(--text-muted)' }}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Desktop table */}
      <div className="rounded-2xl overflow-hidden hidden sm:block" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow)' }}>
        <table className="w-full text-left">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'var(--surface)' }}>
              <SortHeader field="Ticker" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>Ticker</SortHeader>
              <SortHeader field="Sector" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}><span className="hidden md:inline">Sector</span></SortHeader>
              <SortHeader field="Price" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>Price</SortHeader>
              <SortHeader field="1d_Chg_%" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>1D</SortHeader>
              <SortHeader field="Composite_Score" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>Score</SortHeader>
              <th className="py-3 px-3 font-medium text-xs text-center" style={{ color: 'var(--text-muted)' }}>Trend</th>
              <SortHeader field="Tech_Score" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}><span className="hidden md:inline">Tech</span></SortHeader>
              <SortHeader field="Fund_Score" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}><span className="hidden lg:inline">Fund</span></SortHeader>
              <SortHeader field="Research_Score" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}><span className="hidden lg:inline">Research</span></SortHeader>
              <SortHeader field="Piotroski_F" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}><span className="hidden lg:inline">F-Score</span></SortHeader>
              <SortHeader field="Momentum_12M" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}><span className="hidden xl:inline">12M Mom</span></SortHeader>
              <SortHeader field="P/E" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}><span className="hidden xl:inline">P/E</span></SortHeader>
              <SortHeader field="Conviction" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>Conv</SortHeader>
              <th className="py-3 px-3"></th>
            </tr>
          </thead>
          <tbody>
            {filteredData.map((row, i) => (
              <React.Fragment key={i}>
                <tr
                  className="transition-colors"
                  style={{
                    borderBottom: '1px solid var(--border-color)',
                    background: expandedRow === row.Ticker ? 'var(--brand-soft)' : 'transparent',
                  }}
                  onMouseEnter={e => { if (expandedRow !== row.Ticker) e.currentTarget.style.background = 'var(--surface)' }}
                  onMouseLeave={e => { if (expandedRow !== row.Ticker) e.currentTarget.style.background = 'transparent' }}
                >
                  <td className="py-3 px-3 font-medium text-sm cursor-pointer transition-colors" style={{ color: 'var(--text-main)' }} onClick={() => onSelect(row.Ticker)}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--brand)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-main)')}
                  >
                    {row.Ticker.replace('.NS', '')}
                  </td>
                  <td className="py-3 px-3 text-sm hidden md:table-cell" style={{ color: 'var(--text-muted)' }}>{row.Sector || '-'}</td>
                  <td className="py-3 px-3 text-right font-data text-sm" style={{ color: 'var(--text-main)' }}>{num(row.Price)}</td>
                  <td className={`py-3 px-3 text-right text-sm font-medium ${colorCode(row['1d_Chg_%'])}`}>
                    {row['1d_Chg_%'] != null ? `${row['1d_Chg_%'] > 0 ? '+' : ''}${row['1d_Chg_%'].toFixed(2)}%` : '-'}
                  </td>
                  <td className={`py-3 px-3 text-right text-sm font-medium font-data ${colorCode(row.Composite_Score)}`}>{num(row.Composite_Score)}</td>
                  <td className="py-3 px-3 text-center">
                    <MiniSparkline values={(scoreHistory[row.Ticker] || []).slice(-10).map(s => s.composite)} />
                  </td>
                  <td className={`py-3 px-3 text-right text-sm font-medium font-data hidden md:table-cell ${colorCode(row.Tech_Score)}`}>{num(row.Tech_Score)}</td>
                  <td className={`py-3 px-3 text-right text-sm font-medium font-data hidden lg:table-cell ${Number(row.Fund_Score) >= 5 ? 'text-green' : 'text-heading'}`}>{num(row.Fund_Score)}</td>
                  <td className={`py-3 px-3 text-right text-sm font-medium font-data hidden lg:table-cell ${Number(row.Research_Score) >= 7 ? 'text-green' : Number(row.Research_Score) < 4 ? 'text-red' : 'text-heading'}`}>{num(row.Research_Score)}</td>
                  <td className={`py-3 px-3 text-right text-sm font-medium hidden lg:table-cell ${Number(row.Piotroski_F) >= 7 ? 'text-green' : Number(row.Piotroski_F) <= 3 ? 'text-red' : 'text-heading'}`}>
                    <span className="font-data">{row.Piotroski_F ?? '-'}</span><span className="text-sub">/9</span>
                  </td>
                  <td className={`py-3 px-3 text-right text-sm font-medium font-data hidden xl:table-cell ${colorCode(row.Momentum_12M)}`}>{row.Momentum_12M != null ? `${(row.Momentum_12M * 100).toFixed(1)}%` : 'N/A'}</td>
                  <td className="py-3 px-3 text-right text-sm font-data hidden xl:table-cell" style={{ color: 'var(--text-muted)' }}>{num(row['P/E'])}</td>
                  <td className="py-3 px-3 text-sm font-medium">
                    <span className="inline-block px-2 py-0.5 text-[11px] font-medium rounded-full" style={convictionStyle(row.Conviction)}>
                      {row.Conviction || 'N/A'}
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-1">
                      <button onClick={(e) => { e.stopPropagation(); toggleWatchlist(row.Ticker) }} className="transition-colors" style={{ color: watchlist.includes(row.Ticker) ? 'var(--brand)' : 'var(--text-sub)' }}>
                        <Star size={14} fill={watchlist.includes(row.Ticker) ? 'currentColor' : 'none'} />
                      </button>
                      <button onClick={() => setExpandedRow(expandedRow === row.Ticker ? null : row.Ticker)} className="transition-colors" style={{ color: 'var(--text-sub)' }}>
                        <Info size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
                {expandedRow === row.Ticker && (
                  <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'var(--brand-soft)' }}>
                    <td colSpan={14} className="p-6">
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--brand)' }}>Technical Signals</h4>
                          <div className="space-y-2 text-sm">
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
                                <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                                {getSignalLabel(val)}
                              </div>
                            ))}
                          </div>
                          <div className="mt-4 pt-3 grid grid-cols-3 gap-3 text-xs" style={{ borderTop: '1px solid var(--border-color)' }}>
                            <div><span style={{ color: 'var(--text-sub)' }}>Bull</span><br/><span className="font-medium font-data text-green">{row.Bull_Count ?? '-'}</span></div>
                            <div><span style={{ color: 'var(--text-sub)' }}>Bear</span><br/><span className="font-medium font-data text-red">{row.Bear_Count ?? '-'}</span></div>
                            <div><span style={{ color: 'var(--text-sub)' }}>RS %ile</span><br/><span className="font-medium font-data text-heading">{num(row.RS_Percentile)}%</span></div>
                          </div>
                        </div>
                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--brand)' }}>Research Factors</h4>
                          <div className="space-y-2 text-sm">
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
                                <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                                <span className="text-heading">{val}</span>
                              </div>
                            ))}
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

      {/* Mobile card view */}
      <div className="sm:hidden space-y-3">
        {filteredData.map((row, i) => (
          <div key={i} className="rounded-2xl p-4" style={{ background: 'var(--bg-card)', border: `1px solid ${expandedRow === row.Ticker ? 'color-mix(in srgb, var(--brand) 30%, var(--border-color))' : 'var(--border-color)'}`, boxShadow: 'var(--shadow-sm)' }}>
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => onSelect(row.Ticker)} className="text-lg font-bold" style={{ color: 'var(--text-main)' }}>
                {row.Ticker.replace('.NS', '')}
              </button>
              <div className="flex items-center gap-2">
                <button onClick={() => toggleWatchlist(row.Ticker)} style={{ color: watchlist.includes(row.Ticker) ? 'var(--brand)' : 'var(--text-sub)' }}>
                  <Star size={14} fill={watchlist.includes(row.Ticker) ? 'currentColor' : 'none'} />
                </button>
                <span className="px-2 py-0.5 text-[11px] font-medium rounded-full" style={convictionStyle(row.Conviction)}>
                  {row.Conviction || 'N/A'}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 text-sm mb-3">
              <div>
                <span className="text-[11px]" style={{ color: 'var(--text-sub)' }}>Price</span>
                <p className="font-data font-medium text-heading">{num(row.Price)}</p>
              </div>
              <div>
                <span className="text-[11px]" style={{ color: 'var(--text-sub)' }}>1D</span>
                <p className={`font-data font-medium ${colorCode(row['1d_Chg_%'])}`}>
                  {row['1d_Chg_%'] != null ? `${row['1d_Chg_%'] > 0 ? '+' : ''}${row['1d_Chg_%'].toFixed(2)}%` : '-'}
                </p>
              </div>
              <div>
                <span className="text-[11px]" style={{ color: 'var(--text-sub)' }}>Score</span>
                <p className={`font-data font-medium ${colorCode(row.Composite_Score)}`}>{num(row.Composite_Score)}</p>
              </div>
            </div>
            <button
              onClick={() => setExpandedRow(expandedRow === row.Ticker ? null : row.Ticker)}
              className="w-full py-2 text-xs font-medium rounded-lg transition-all"
              style={{ background: 'var(--surface)', color: 'var(--text-muted)' }}
            >
              {expandedRow === row.Ticker ? 'Show less' : 'Show more'}
            </button>
            {expandedRow === row.Ticker && (
              <div className="mt-3 pt-3 space-y-4 animate-fade-up" style={{ borderTop: '1px solid var(--border-color)' }}>
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--brand)' }}>Signals</h4>
                  <div className="space-y-1.5 text-sm">
                    {[
                      ['Price vs SMA50', row.Sig_Price_vs_SMA50], ['Price vs SMA200', row.Sig_Price_vs_SMA200],
                      ['SMA50 vs SMA200', row.Sig_SMA50_vs_SMA200], ['RSI', row.Sig_RSI],
                      ['MACD Cross', row.Sig_MACD_Cross], ['Supertrend', row.Sig_Supertrend],
                      ['Bollinger Bands', row.Sig_BB], ['ADX Trend', row.Sig_ADX],
                    ].map(([label, val]) => (
                      <div key={label as string} className="flex items-center justify-between">
                        <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                        {getSignalLabel(val)}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
