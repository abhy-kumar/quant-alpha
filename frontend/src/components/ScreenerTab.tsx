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
  return { background: 'var(--surface)', color: 'var(--text-2)' }
}

export default function ScreenerTab({ data, onSelect, expandedRow, setExpandedRow, watchlist, toggleWatchlist, scoreHistory }: Props) {
  const [sortKey, setSortKey] = useState<string>('Composite_Score')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [showFilters, setShowFilters] = useState(false)

  const [minComposite, setMinComposite] = useState(0)
  const [minPiotroski, setMinPiotroski] = useState(0)
  const [minValue, setMinValue] = useState(0)
  const [maxBeta, setMaxBeta] = useState(3)
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
      if (minValue > 0 && Number(d.Value_Score) < minValue) return false
      if (maxBeta < 3 && Number(d.Beta) > maxBeta) return false
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

  const activeFilterCount = [minComposite > 0, minPiotroski > 0, minValue > 0, maxBeta < 3, selectedSectors.length > 0, selectedConvictions.length > 0, minMarketCap > 0, maxDE < 999].filter(Boolean).length

  const clearFilters = () => {
    setMinComposite(0); setMinPiotroski(0); setMinValue(0); setMaxBeta(3)
    setSelectedSectors([]); setSelectedConvictions([]); setMinMarketCap(0); setMaxDE(999)
  }

  const toggleSector = (s: string) => setSelectedSectors(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  const toggleConviction = (c: string) => setSelectedConvictions(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])

  return (
    <div className="space-y-4">
      {/* Algorithm Info */}
      <div className="p-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--brand)' }}>Scoring Model</span>
          <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>10 Factors · Cross-Sectional Ranking</span>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-10 gap-2 text-center">
          {[
            ['Piotroski', '0.10', 'var(--green)'],
            ['Profitability', '0.10', 'var(--green)'],
            ['Earnings Q', '0.10', 'var(--green)'],
            ['Momentum', '0.20', 'var(--brand)'],
            ['Value', '0.15', 'var(--blue)'],
            ['Low Vol', '0.10', 'var(--text-2)'],
            ['Beta', '0.10', 'var(--text-2)'],
            ['Investment', '0.10', 'var(--text-2)'],
            ['SUE', '0.10', 'var(--text-2)'],
            ['Reversion', '0.05', 'var(--text-3)'],
          ].map(([label, weight, color]) => (
            <div key={label} className="flex flex-col items-center">
              <span className="text-[10px] font-mono" style={{ color }}>{weight}</span>
              <span className="text-[9px]" style={{ color: 'var(--text-3)' }}>{label}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 pt-2 flex flex-wrap gap-3 text-[9px]" style={{ borderTop: '1px solid var(--border)', color: 'var(--text-3)' }}>
          <span>Composite: Tech 35% · Fund 30% · Research 35%</span>
          <span className="hidden sm:inline">|</span>
          <span className="hidden sm:inline">Long-Term: Tech 10% · Fund 40% · Research 50%</span>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center justify-between">
        <span className="text-[12px]" style={{color:'var(--text-3)'}}>{filteredData.length} results</span>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-2 px-3 py-1.5 text-[13px] font-medium transition-all"
          style={{
            background: showFilters ? 'var(--brand)' : 'var(--surface)',
            color: showFilters ? '#fff' : 'var(--text-2)',
            border: `1px solid ${showFilters ? 'var(--brand)' : 'var(--border)'}`,
          }}
        >
          <Filter size={14} /> Filters {activeFilterCount > 0 && <span className="px-1.5 py-0.5 text-[10px]" style={{ background: showFilters ? 'rgba(255,255,255,0.2)' : 'rgba(30,63,104,0.06)', color: showFilters ? '#fff' : 'var(--brand)' }}>{activeFilterCount}</span>}
        </button>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'none' }}>
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--brand)' }}>Filters</span>
            {activeFilterCount > 0 && (
              <button onClick={clearFilters} className="flex items-center gap-1 text-xs transition-colors" style={{ color: 'var(--text-3)' }}>
                <X size={12} /> Clear all
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <div>
              <label className="text-xs mb-1.5 block" style={{ color: 'var(--text-2)' }}>Min composite: {minComposite.toFixed(1)}</label>
              <input type="range" min="0" max="10" step="0.5" value={minComposite} onChange={e => setMinComposite(Number(e.target.value))} className="w-full" />
            </div>
            <div>
              <label className="text-xs mb-1.5 block" style={{ color: 'var(--text-2)' }}>Min Piotroski: {minPiotroski}</label>
              <input type="range" min="0" max="9" step="1" value={minPiotroski} onChange={e => setMinPiotroski(Number(e.target.value))} className="w-full" />
            </div>
            <div>
              <label className="text-xs mb-1.5 block" style={{ color: 'var(--text-2)' }}>Min market cap: ₹{minMarketCap}Cr</label>
              <input type="range" min="0" max="500" step="10" value={minMarketCap} onChange={e => setMinMarketCap(Number(e.target.value))} className="w-full" />
            </div>
            <div>
              <label className="text-xs mb-1.5 block" style={{ color: 'var(--text-2)' }}>Max D/E: {maxDE >= 999 ? 'Any' : maxDE}</label>
              <input type="range" min="0" max="10" step="0.5" value={maxDE >= 999 ? 10 : maxDE} onChange={e => setMaxDE(Number(e.target.value) >= 10 ? 999 : Number(e.target.value))} className="w-full" />
            </div>
            <div>
              <label className="text-xs mb-1.5 block" style={{ color: 'var(--text-2)' }}>Min Value Score: {minValue.toFixed(1)}</label>
              <input type="range" min="0" max="10" step="0.5" value={minValue} onChange={e => setMinValue(Number(e.target.value))} className="w-full" />
            </div>
            <div>
              <label className="text-xs mb-1.5 block" style={{ color: 'var(--text-2)' }}>Max Beta: {maxBeta >= 3 ? 'Any' : maxBeta.toFixed(1)}</label>
              <input type="range" min="0" max="3" step="0.1" value={maxBeta} onChange={e => setMaxBeta(Number(e.target.value) >= 2.9 ? 3 : Number(e.target.value))} className="w-full" />
            </div>
            <div>
              <label className="text-xs mb-2 block" style={{ color: 'var(--text-2)' }}>Sectors</label>
              <div className="flex flex-wrap gap-1.5">
                {availableSectors.map(s => (
                  <button key={s} onClick={() => toggleSector(s)} className="px-2.5 py-1 text-[11px] font-medium transition-all" style={selectedSectors.includes(s) ? { background: 'var(--brand)', color: '#fff' } : { background: 'var(--surface)', color: 'var(--text-2)' }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs mb-2 block" style={{ color: 'var(--text-2)' }}>Conviction</label>
              <div className="flex flex-wrap gap-1.5">
                {CONVICTION_OPTIONS.map(c => (
                  <button key={c} onClick={() => toggleConviction(c)} className="px-2.5 py-1 text-[11px] font-medium transition-all" style={selectedConvictions.includes(c) ? { background: 'var(--brand)', color: '#fff' } : { background: 'var(--surface)', color: 'var(--text-2)' }}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Desktop table */}
      <div className="overflow-hidden hidden sm:block" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'none' }}>
        <div className="overflow-x-auto">
        <table className="w-full text-left" style={{tableLayout:'auto'}}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
              <SortHeader field="Ticker" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>Ticker</SortHeader>
              <SortHeader field="Sector" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}><span className="hidden md:inline">Sector</span></SortHeader>
              <SortHeader field="Price" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>Price</SortHeader>
              <SortHeader field="1d_Chg_%" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>1D</SortHeader>
              <SortHeader field="Composite_Score" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>Score</SortHeader>
              <th className="py-3 px-3 font-medium text-xs text-center" style={{ color: 'var(--text-2)' }}>Trend</th>
              <SortHeader field="Tech_Score" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}><span className="hidden md:inline">Tech</span></SortHeader>
              <SortHeader field="Fund_Score" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}><span className="hidden lg:inline">Fund</span></SortHeader>
              <SortHeader field="Research_Score" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}><span className="hidden lg:inline">Research</span></SortHeader>
              <SortHeader field="Piotroski_F" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}><span className="hidden lg:inline">F-Score</span></SortHeader>
              <SortHeader field="Momentum_12M" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}><span className="hidden xl:inline">12M Mom</span></SortHeader>
              <SortHeader field="Value_Score" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}><span className="hidden xl:inline">Value</span></SortHeader>
              <SortHeader field="Beta" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}><span className="hidden xl:inline">Beta</span></SortHeader>
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
                    borderBottom: '1px solid var(--border)',
                    background: expandedRow === row.Ticker ? 'rgba(30,63,104,0.06)' : 'transparent',
                  }}
                  onMouseEnter={e => { if (expandedRow !== row.Ticker) e.currentTarget.style.background = 'var(--surface)' }}
                  onMouseLeave={e => { if (expandedRow !== row.Ticker) e.currentTarget.style.background = 'transparent' }}
                >
                  <td className="py-3 px-3 font-medium text-sm cursor-pointer transition-colors" style={{ color: 'var(--text)' }} onClick={() => onSelect(row.Ticker)}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--brand)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--text)')}
                  >
                    {row.Ticker.replace('.NS', '')}
                  </td>
                  <td className="py-3 px-3 text-sm hidden md:table-cell" style={{ color: 'var(--text-2)' }}>{row.Sector || '-'}</td>
                  <td className="py-3 px-3 text-right font-data text-sm" style={{ color: 'var(--text)' }}>{num(row.Price)}</td>
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
                  <td className={`py-3 px-3 text-right text-sm font-medium font-data hidden xl:table-cell ${Number(row.Value_Score) >= 7 ? 'text-green' : Number(row.Value_Score) < 4 ? 'text-red' : 'text-heading'}`}>{num(row.Value_Score)}</td>
                  <td className={`py-3 px-3 text-right text-sm font-medium font-data hidden xl:table-cell ${row.Beta != null && row.Beta < 0.8 ? 'text-green' : row.Beta != null && row.Beta > 1.2 ? 'text-red' : 'text-heading'}`}>{row.Beta != null ? row.Beta.toFixed(2) : 'N/A'}</td>
                  <td className="py-3 px-3 text-right text-sm font-data hidden xl:table-cell" style={{ color: 'var(--text-2)' }}>{num(row['P/E'])}</td>
                  <td className="py-3 px-3 text-sm font-medium">
                    <span className="inline-block px-2 py-0.5 text-[11px] font-medium" style={convictionStyle(row.Conviction)}>
                      {row.Conviction || 'N/A'}
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-1">
                      <button onClick={(e) => { e.stopPropagation(); toggleWatchlist(row.Ticker) }} className="transition-colors" style={{ color: watchlist.includes(row.Ticker) ? 'var(--brand)' : 'var(--text-3)' }}>
                        <Star size={14} fill={watchlist.includes(row.Ticker) ? 'currentColor' : 'none'} />
                      </button>
                      <button onClick={() => setExpandedRow(expandedRow === row.Ticker ? null : row.Ticker)} className="transition-colors" style={{ color: 'var(--text-3)' }}>
                        <Info size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
                {expandedRow === row.Ticker && (
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'rgba(30,63,104,0.06)' }}>
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
                                <span style={{ color: 'var(--text-2)' }}>{label}</span>
                                {getSignalLabel(val)}
                              </div>
                            ))}
                          </div>
                          <div className="mt-4 pt-3 grid grid-cols-3 gap-3 text-xs" style={{ borderTop: '1px solid var(--border)' }}>
                            <div><span style={{ color: 'var(--text-3)' }}>Bull</span><br/><span className="font-medium font-data text-green">{row.Bull_Count ?? '-'}</span></div>
                            <div><span style={{ color: 'var(--text-3)' }}>Bear</span><br/><span className="font-medium font-data text-red">{row.Bear_Count ?? '-'}</span></div>
                            <div><span style={{ color: 'var(--text-3)' }}>RS %ile</span><br/><span className="font-medium font-data text-heading">{num(row.RS_Percentile)}%</span></div>
                          </div>
                        </div>
                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--brand)' }}>Research Factors</h4>
                          <div className="space-y-2 text-sm">
                            {[
                              ['Piotroski F-Score (2000)', `${row.Piotroski_F ?? '-'}/9`],
                              ['Gross Profitability (2013)', `${num(row.Gross_Profit_Score)}/10`],
                              ['Earnings Quality (1996)', `${num(row.Earnings_Quality)}/10`],
                              ['Value Factor (Fama-French)', `${num(row.Value_Score)}/10`],
                              ['Investment Factor (2004)', `${num(row.Investment_Score)}/10`],
                              ['SUE / Earnings Momentum', `${num(row.SUE_Score)}/10`],
                              ['Low Volatility (2011)', `${num(row.Vol_60D)}%`],
                              ['Betting Against Beta', row.Beta != null ? `${row.Beta.toFixed(2)} β` : 'N/A'],
                              ['Alpha (60D)', row.Alpha_60D != null ? `${row.Alpha_60D.toFixed(1)}%` : 'N/A'],
                              ['12M Momentum', row.Momentum_12M != null ? `${(row.Momentum_12M * 100).toFixed(1)}%` : 'N/A'],
                              ['Risk-Adj Mom', num(row.Risk_Adj_Mom)],
                              ['Z-Score (60D)', num(row.Z_Score_60)],
                              ['Sharpe', num(row.Sharpe)],
                              ['Max DD', num(row['Max_Drawdown_%'])],
                            ].map(([label, val]) => (
                              ['12M Momentum', row.Momentum_12M != null ? `${(row.Momentum_12M * 100).toFixed(1)}%` : 'N/A'],
                              ['Risk-Adj Mom', num(row.Risk_Adj_Mom)],
                              ['Z-Score (60D)', num(row.Z_Score_60)],
                              ['Sharpe', num(row.Sharpe)],
                              ['Max DD', num(row['Max_Drawdown_%'])],
                            ].map(([label, val]) => (
                              <div key={label as string} className="flex items-center justify-between">
                                <span style={{ color: 'var(--text-2)' }}>{label}</span>
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
      </div>

      {/* Mobile card view */}
      <div className="sm:hidden space-y-2">
        {filteredData.map((row, i) => (
          <div key={i} className="px-3 py-2.5" style={{ background: 'var(--surface)', border: `1px solid ${expandedRow === row.Ticker ? 'color-mix(in srgb, var(--brand) 30%, var(--border))' : 'var(--border)'}` }}>
            {/* Row 1: Ticker, Score, Conviction, Watch */}
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <button onClick={() => onSelect(row.Ticker)} className="text-sm font-bold" style={{ color: 'var(--text)' }}>
                  {row.Ticker.replace('.NS', '')}
                </button>
                <span className="px-1.5 py-0.5 text-[10px] font-medium" style={convictionStyle(row.Conviction)}>
                  {row.Conviction || 'N/A'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-mono font-medium ${colorCode(row.Composite_Score)}`}>{num(row.Composite_Score)}</span>
                <button onClick={() => toggleWatchlist(row.Ticker)} style={{ color: watchlist.includes(row.Ticker) ? 'var(--brand)' : 'var(--text-3)' }}>
                  <Star size={13} fill={watchlist.includes(row.Ticker) ? 'currentColor' : 'none'} />
                </button>
              </div>
            </div>

            {/* Row 2: Price, 1D, Sector */}
            <div className="flex items-center gap-3 mb-1.5 text-[11px]">
              <span className="font-mono font-medium" style={{ color: 'var(--text)' }}>{num(row.Price)}</span>
              <span className={`font-mono font-medium ${colorCode(row['1d_Chg_%'])}`}>
                {row['1d_Chg_%'] != null ? `${row['1d_Chg_%'] > 0 ? '+' : ''}${row['1d_Chg_%'].toFixed(2)}%` : '-'}
              </span>
              <span className="hidden xs:inline" style={{ color: 'var(--text-3)' }}>{row.Sector || '-'}</span>
              <MiniSparkline values={(scoreHistory[row.Ticker] || []).slice(-10).map(s => s.composite)} width={40} height={12} />
            </div>

            {/* Row 3: Tech, Fund, Research, F-Score, Value */}
            <div className="flex items-center gap-3 text-[10px]" style={{ color: 'var(--text-3)' }}>
              <span>T <span className={`font-mono font-medium ${colorCode(row.Tech_Score)}`}>{num(row.Tech_Score)}</span></span>
              <span>F <span className={`font-mono font-medium ${Number(row.Fund_Score) >= 5 ? 'text-green' : 'text-heading'}`}>{num(row.Fund_Score)}</span></span>
              <span>R <span className={`font-mono font-medium ${Number(row.Research_Score) >= 7 ? 'text-green' : Number(row.Research_Score) < 4 ? 'text-red' : 'text-heading'}`}>{num(row.Research_Score)}</span></span>
              <span>P <span className="font-mono font-medium">{row.Piotroski_F ?? '-'}/9</span></span>
              {row.Value_Score != null && <span>V <span className={`font-mono font-medium ${Number(row.Value_Score) >= 7 ? 'text-green' : 'text-heading'}`}>{num(row.Value_Score)}</span></span>}
              <span className="ml-auto">
                <button onClick={() => setExpandedRow(expandedRow === row.Ticker ? null : row.Ticker)} style={{ color: 'var(--text-3)' }}>
                  <Info size={13} />
                </button>
              </span>
            </div>

            {expandedRow === row.Ticker && (
              <div className="mt-2.5 pt-2.5 space-y-3" style={{ borderTop: '1px solid var(--border)' }}>
                <div>
                  <h4 className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--brand)' }}>Signals</h4>
                  <div className="space-y-1 text-[11px]">
                    {[
                      ['Price vs SMA50', row.Sig_Price_vs_SMA50], ['Price vs SMA200', row.Sig_Price_vs_SMA200],
                      ['SMA50 vs SMA200', row.Sig_SMA50_vs_SMA200], ['RSI', row.Sig_RSI],
                      ['MACD Cross', row.Sig_MACD_Cross], ['Supertrend', row.Sig_Supertrend],
                      ['Bollinger Bands', row.Sig_BB], ['ADX Trend', row.Sig_ADX],
                    ].map(([label, val]) => (
                      <div key={label as string} className="flex items-center justify-between">
                        <span style={{ color: 'var(--text-2)' }}>{label}</span>
                        {getSignalLabel(val)}
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--brand)' }}>Factor Scores</h4>
                  <div className="grid grid-cols-2 gap-1 text-[11px]">
                    {[
                      ['Value (F-F)', row.Value_Score, 7],
                      ['Investment', row.Investment_Score, 6],
                      ['SUE', row.SUE_Score, 6],
                      ['Beta', row.Beta, null],
                      ['Piotroski', row.Piotroski_F != null ? Number(row.Piotroski_F) / 0.9 : null, 7],
                      ['Gross Profit', row.Gross_Profit_Score, 6],
                    ].map(([label, val, threshold]) => (
                      <div key={label as string} className="flex justify-between">
                        <span style={{ color: 'var(--text-2)' }}>{label}</span>
                        <span className={`font-mono ${threshold != null && Number(val) >= Number(threshold) ? 'text-green' : 'text-heading'}`}>
                          {label === 'Beta' ? (val != null ? Number(val).toFixed(2) : 'N/A') : `${num(val)}/10`}
                        </span>
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
