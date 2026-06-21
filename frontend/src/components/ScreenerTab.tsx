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
  flashTickers?: Record<string, 'up'|'down'>
}

const CONVICTION_OPTIONS = ['Strong Buy', 'Buy', 'Hold', 'Caution', 'Avoid']

export default function ScreenerTab({ data, onSelect, expandedRow, setExpandedRow, watchlist, toggleWatchlist, scoreHistory, flashTickers = {} }: Props) {
  const [sortKey, setSortKey] = useState<string>('Composite_Score')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [showFilters, setShowFilters] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

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
      if (searchQuery) {
        const q = searchQuery.toUpperCase()
        if (!d.Ticker.replace('.NS','').includes(q) && !(d.Long_Name||'').toUpperCase().includes(q)) return false
      }
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
  }, [data, sortKey, sortDir, minComposite, minPiotroski, selectedSectors, selectedConvictions, minMarketCap, maxDE, searchQuery, minValue, maxBeta])

  const activeFilterCount = [minComposite > 0, minPiotroski > 0, minValue > 0, maxBeta < 3, selectedSectors.length > 0, selectedConvictions.length > 0, minMarketCap > 0, maxDE < 999, searchQuery.length > 0].filter(Boolean).length

  const clearFilters = () => {
    setMinComposite(0); setMinPiotroski(0); setMinValue(0); setMaxBeta(3)
    setSelectedSectors([]); setSelectedConvictions([]); setMinMarketCap(0); setMaxDE(999); setSearchQuery('')
  }

  const toggleSector = (s: string) => setSelectedSectors(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  const toggleConviction = (c: string) => setSelectedConvictions(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])

  return (
    <div className="space-y-4">
      {/* Algorithm Info */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="section-label" style={{ color: 'var(--brand)' }}>Scoring Model</span>
          <span className="text-xs" style={{ color: 'var(--text-3)' }}>10 Factors · Cross-Sectional Ranking</span>
        </div>
        <div className="grid grid-cols-5 sm:grid-cols-10 gap-3 text-center">
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
              <span className="text-sm font-mono font-medium" style={{ color }}>{weight}</span>
              <span className="text-[11px] mt-0.5" style={{ color: 'var(--text-3)' }}>{label}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 pt-2 flex flex-wrap gap-3 text-[11px]" style={{ borderTop: '1px solid var(--border)', color: 'var(--text-3)' }}>
          <span>Composite: Tech 35% · Fund 30% · Research 35%</span>
          <span className="hidden sm:inline">|</span>
          <span className="hidden sm:inline">Long-Term: Tech 10% · Fund 40% · Research 50%</span>
        </div>
      </div>

      {/* Search + Filter bar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1">
          <input type="text" placeholder="Search ticker or company…" value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', padding: '7px 12px', fontSize: 13,
              color: 'var(--text)', outline: 'none', width: 220, transition: 'border-color var(--dur-base)' }}
          />
          <span className="text-[12px]" style={{color:'var(--text-3)'}}>Displaying {filteredData.length} of {data.length} stocks</span>
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-2 px-3 py-1.5 text-[13px] font-medium transition-all"
          style={{
            background: showFilters ? 'var(--brand)' : 'var(--surface)',
            color: showFilters ? '#fff' : 'var(--text-2)',
            border: `1px solid ${showFilters ? 'var(--brand)' : 'var(--border)'}`,
            borderRadius: 'var(--radius)',
          }}
        >
          <Filter size={14} /> Filters
          {activeFilterCount > 0 && (
            <span style={{ minWidth: 18, height: 18, borderRadius: 9, background: showFilters ? 'rgba(255,255,255,0.2)' : 'var(--brand)',
              color: showFilters ? 'white' : 'white', fontSize: 10, fontWeight: 700,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* Filters panel with animation */}
      <div className="filter-panel" data-open={showFilters ? 'true' : 'false'}>
        <div className="p-5 card">
          <div className="flex items-center justify-between mb-4">
            <span className="section-label" style={{ color: 'var(--brand)' }}>Filters</span>
            {activeFilterCount > 0 && (
              <button onClick={clearFilters} className="flex items-center gap-1 text-xs transition-colors" style={{ color: 'var(--text-3)' }}>
                <X size={12} /> Clear all
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <div>
              <label className="text-xs mb-1.5 block" style={{ color: 'var(--text-2)' }}>Min composite: {minComposite.toFixed(1)}</label>
              <input type="range" min="0" max="10" step="0.5" value={minComposite} onChange={e => setMinComposite(Number(e.target.value))} className="w-full" aria-label="Minimum composite score" />
            </div>
            <div>
              <label className="text-xs mb-1.5 block" style={{ color: 'var(--text-2)' }}>Min Piotroski: {minPiotroski}</label>
              <input type="range" min="0" max="9" step="1" value={minPiotroski} onChange={e => setMinPiotroski(Number(e.target.value))} className="w-full" aria-label="Minimum Piotroski score" />
            </div>
            <div>
              <label className="text-xs mb-1.5 block" style={{ color: 'var(--text-2)' }}>Min market cap: ₹{minMarketCap.toLocaleString('en-IN')}Cr</label>
              <input type="range" min="0" max="100000" step="500" value={minMarketCap} onChange={e => setMinMarketCap(Number(e.target.value))} className="w-full" aria-label="Minimum market cap" />
            </div>
            <div>
              <label className="text-xs mb-1.5 block" style={{ color: 'var(--text-2)' }}>Max D/E: {maxDE >= 999 ? 'Any' : maxDE}</label>
              <input type="range" min="0" max="10" step="0.5" value={maxDE >= 999 ? 10 : maxDE} onChange={e => setMaxDE(Number(e.target.value) >= 10 ? 999 : Number(e.target.value))} className="w-full" aria-label="Maximum debt to equity" />
            </div>
            <div>
              <label className="text-xs mb-1.5 block" style={{ color: 'var(--text-2)' }}>Min Value Score: {minValue.toFixed(1)}</label>
              <input type="range" min="0" max="10" step="0.5" value={minValue} onChange={e => setMinValue(Number(e.target.value))} className="w-full" aria-label="Minimum value score" />
            </div>
            <div>
              <label className="text-xs mb-1.5 block" style={{ color: 'var(--text-2)' }}>Max Beta: {maxBeta >= 3 ? 'Any' : maxBeta.toFixed(1)}</label>
              <input type="range" min="0" max="3" step="0.1" value={maxBeta} onChange={e => setMaxBeta(Number(e.target.value) >= 2.9 ? 3 : Number(e.target.value))} className="w-full" aria-label="Maximum beta" />
            </div>
            <div>
              <label className="text-xs mb-2 block" style={{ color: 'var(--text-2)' }}>Sectors</label>
              <div className="flex flex-wrap gap-1.5">
                {availableSectors.map(s => (
                  <button key={s} onClick={() => toggleSector(s)} className="px-2.5 py-1 text-[11px] font-medium transition-all" style={selectedSectors.includes(s) ? { background: 'var(--brand)', color: '#fff', borderRadius: 'var(--radius-sm)' } : { background: 'var(--surface-2)', color: 'var(--text-2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs mb-2 block" style={{ color: 'var(--text-2)' }}>Conviction</label>
              <div className="flex flex-wrap gap-1.5">
                {CONVICTION_OPTIONS.map(c => (
                  <button key={c} onClick={() => toggleConviction(c)} className="px-2.5 py-1 text-[11px] font-medium transition-all" style={selectedConvictions.includes(c) ? { background: 'var(--brand)', color: '#fff', borderRadius: 'var(--radius-sm)' } : { background: 'var(--surface-2)', color: 'var(--text-2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop table */}
      <div className="overflow-hidden hidden sm:block card">
        {filteredData.length === 0 ? (
          <div style={{ textAlign:'center', padding:'48px 0' }}>
            <p style={{ color:'var(--text-2)', marginBottom:8 }}>No stocks match your filters.</p>
            <p style={{ color:'var(--text-3)', fontSize:12 }}>Try removing some filters or lowering the minimum score.</p>
          </div>
        ) : (
        <div className="overflow-x-auto">
        <table className="w-full text-left text-xs" style={{borderCollapse:'collapse'}}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
              <th className="py-2 px-2 text-[10px] font-medium cursor-pointer select-none uppercase tracking-wider" style={{color:'var(--text-3)',textAlign:'left',position:'sticky',left:0,background:'var(--surface)',zIndex:1}} onClick={()=>handleSort('Ticker')}>
                <span className="inline-flex items-center gap-1">Ticker{sortKey==='Ticker'&&<span style={{color:'var(--brand)'}}>{sortDir==='asc'?'↑':'↓'}</span>}</span>
              </th>
              <SortHeader field="Sector" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}><span className="hidden md:inline">Sector</span></SortHeader>
              <SortHeader field="Price" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>Price</SortHeader>
              <SortHeader field="1d_Chg_%" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>1D</SortHeader>
              <SortHeader field="Composite_Score" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>Score</SortHeader>
              <th className="py-2 px-2 font-medium text-[10px] text-center" style={{ color: 'var(--text-2)' }}>Trend</th>
              <SortHeader field="Tech_Score" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}><span className="hidden md:inline">Tech</span></SortHeader>
              <SortHeader field="Fund_Score" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}><span className="hidden lg:inline">Fund</span></SortHeader>
              <SortHeader field="Research_Score" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}><span className="hidden lg:inline">Research</span></SortHeader>
              <SortHeader field="Piotroski_F" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}><span className="hidden lg:inline">F-Score</span></SortHeader>
              <SortHeader field="Momentum_12M" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}><span className="hidden xl:inline">12M Mom</span></SortHeader>
              <SortHeader field="Value_Score" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}><span className="hidden xl:inline">Value</span></SortHeader>
              <SortHeader field="Beta" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}><span className="hidden xl:inline">Beta</span></SortHeader>
              <SortHeader field="P/E" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}><span className="hidden xl:inline">P/E</span></SortHeader>
              <SortHeader field="Conviction" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>Conv</SortHeader>
              <th className="py-2 px-2"></th>
            </tr>
          </thead>
          <tbody>
            {filteredData.map((row) => (
              <React.Fragment key={row.Ticker}>
                <tr
                  className="transition-colors"
                  style={{
                    borderBottom: '1px solid var(--border)',
                    background: expandedRow === row.Ticker ? 'var(--brand-soft)' : flashTickers[row.Ticker] === 'up' ? 'var(--green-bg)' : flashTickers[row.Ticker] === 'down' ? 'var(--red-bg)' : 'transparent',
                    cursor: 'pointer',
                    transition: 'background var(--dur-fast)',
                  }}
                  onMouseEnter={e => { if (expandedRow !== row.Ticker && !flashTickers[row.Ticker]) e.currentTarget.style.background = 'var(--surface-2)' }}
                  onMouseLeave={e => { if (expandedRow === row.Ticker) e.currentTarget.style.background = 'var(--brand-soft)' ; else if (!flashTickers[row.Ticker]) e.currentTarget.style.background = 'transparent' }}
                >
                  <td className="py-2 px-2 font-medium cursor-pointer transition-colors" style={{ color: 'var(--text)', position:'sticky', left:0, background:'var(--surface)', zIndex:1 }} onClick={() => onSelect(row.Ticker)}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--brand)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--text)')}
                  >
                    {row.Ticker.replace('.NS', '')}
                  </td>
                  <td className="py-2 px-2 hidden md:table-cell" style={{ color: 'var(--text-2)' }}>{row.Sector || '-'}</td>
                  <td className="py-2 px-2 text-right font-mono" style={{ color: 'var(--text)' }}>{num(row.Price)}</td>
                  <td className={`py-2 px-2 text-right font-medium font-mono ${colorCode(row['1d_Chg_%'])}`}>
                    {row['1d_Chg_%'] != null ? `${row['1d_Chg_%'] > 0 ? '+' : ''}${row['1d_Chg_%'].toFixed(2)}%` : '-'}
                  </td>
                  <td className={`py-2 px-2 text-right font-medium font-mono ${colorCode(row.Composite_Score)}`}>{num(row.Composite_Score)}</td>
                  <td className="py-2 px-2 text-center">
                    <MiniSparkline values={(scoreHistory[row.Ticker] || []).slice(-10).map(s => s.composite)} ticker={row.Ticker} />
                  </td>
                  <td className={`py-2 px-2 text-right font-medium font-mono hidden md:table-cell ${colorCode(row.Tech_Score)}`}>{num(row.Tech_Score)}</td>
                  <td className={`py-2 px-2 text-right font-medium font-mono hidden lg:table-cell`}>{num(row.Fund_Score)}</td>
                  <td className={`py-2 px-2 text-right font-medium font-mono hidden lg:table-cell`}>{num(row.Research_Score)}</td>
                  <td className="py-2 px-2 text-right font-medium hidden lg:table-cell">
                    <span className="font-mono">{row.Piotroski_F ?? '-'}</span><span className="text-[9px] text-[var(--text-3)]">/9</span>
                  </td>
                  <td className="py-2 px-2 text-right font-medium font-mono hidden xl:table-cell">{row.Momentum_12M != null ? `${(row.Momentum_12M * 100).toFixed(1)}%` : '-'}</td>
                  <td className="py-2 px-2 text-right font-medium font-mono hidden xl:table-cell">{num(row.Value_Score)}</td>
                  <td className="py-2 px-2 text-right font-medium font-mono hidden xl:table-cell">{row.Beta != null ? row.Beta.toFixed(2) : '-'}</td>
                  <td className="py-2 px-2 text-right font-mono hidden xl:table-cell" style={{ color: 'var(--text-2)' }}>{num(row['P/E'])}</td>
                  <td className="py-2 px-2 font-medium whitespace-nowrap">
                    <span className={`badge ${row.Conviction === 'Strong Buy' ? 'badge-strong-buy' : row.Conviction === 'Buy' ? 'badge-buy' : row.Conviction === 'Caution' ? 'badge-caution' : row.Conviction === 'Avoid' ? 'badge-avoid' : 'badge-hold'}`}>
                      {row.Conviction || '-'}
                    </span>
                  </td>
                  <td className="py-2 px-2">
                    <div className="flex items-center gap-1">
                      <button onClick={(e) => { e.stopPropagation(); toggleWatchlist(row.Ticker) }}
                        onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.75)')}
                        onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
                        style={{ transition: 'transform var(--dur-fast) var(--ease-out)', border: 'none', background: 'none', cursor: 'pointer', color: watchlist.includes(row.Ticker) ? 'var(--amber)' : 'var(--text-3)' }}>
                        <Star size={12} fill={watchlist.includes(row.Ticker) ? 'var(--amber)' : 'none'} style={{ transition: 'color var(--dur-base), fill var(--dur-base)' }}/>
                      </button>
                      <button onClick={() => setExpandedRow(expandedRow === row.Ticker ? null : row.Ticker)} className="transition-colors" style={{ color: 'var(--text-3)' }}>
                        <Info size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td colSpan={16} style={{ padding: 0, border: 'none' }}>
                    <div style={{
                      maxHeight: expandedRow === row.Ticker ? 800 : 0,
                      overflow: 'hidden',
                      transition: 'max-height var(--dur-slow) var(--ease-out)',
                    }}>
                      <div className="p-6" style={{ borderBottom: '1px solid var(--border)', background: 'var(--brand-soft)' }}>
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                          <div>
                            <h4 className="section-label mb-3" style={{ color: 'var(--brand)' }}>Technical Signals</h4>
                            <div className="space-y-1.5 text-[11px]">
                              {[
                                ['Price vs SMA50', row.Sig_Price_vs_SMA50], ['Price vs SMA200', row.Sig_Price_vs_SMA200],
                                ['SMA50 vs SMA200', row.Sig_SMA50_vs_SMA200], ['RSI', row.Sig_RSI],
                                ['MACD Cross', row.Sig_MACD_Cross], ['MACD Hist', row.Sig_MACD_Hist],
                                ['Stochastic', row.Sig_Stoch], ['Bollinger Bands', row.Sig_BB],
                                ['CCI', row.Sig_CCI], ['Volume Spike', row.Sig_Volume],
                                ['ADX Trend', row.Sig_ADX], ['Supertrend', row.Sig_Supertrend],
                                ['Vol Price Trend', row.Sig_VPT], ['Ichimoku Cloud', row.Sig_Ichimoku],
                              ].map(([label, val]) => (
                                <div key={label as string} className="flex items-center justify-between py-0.5">
                                  <span style={{ color: 'var(--text-2)' }}>{label}</span>
                                  {getSignalLabel(val)}
                                </div>
                              ))}
                            </div>
                          </div>
                          <div>
                            <h4 className="section-label mb-3" style={{ color: 'var(--brand)' }}>Research Factors</h4>
                            <div className="space-y-1.5 text-[11px]">
                              {[
                                ['Piotroski F-Score', `${row.Piotroski_F ?? '-'}/9`],
                                ['Gross Profitability', `${num(row.Gross_Profit_Score)}/10`],
                                ['Earnings Quality', `${num(row.Earnings_Quality)}/10`],
                                ['Value Factor', `${num(row.Value_Score)}/10`],
                                ['Investment Factor', `${num(row.Investment_Score)}/10`],
                                ['SUE / Earnings Mom', `${num(row.SUE_Score)}/10`],
                                ['Low Volatility', row.Vol_60D != null ? `${row.Vol_60D.toFixed(1)}%` : '-'],
                                ['Betting Against Beta', row.Beta != null ? `${row.Beta.toFixed(2)} β` : '-'],
                                ['Alpha (60D)', row.Alpha_60D != null ? `${row.Alpha_60D.toFixed(1)}%` : '-'],
                                ['12M Momentum', row.Momentum_12M != null ? `${(row.Momentum_12M * 100).toFixed(1)}%` : '-'],
                                ['Risk-Adj Mom', num(row.Risk_Adj_Mom)],
                                ['Z-Score (60D)', num(row.Z_Score_60)],
                              ].map(([label, val]) => (
                                <div key={label as string} className="flex items-center justify-between py-0.5">
                                  <span style={{ color: 'var(--text-2)' }}>{label}</span>
                                  <span className="font-mono" style={{color:'var(--text)'}}>{val}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div>
                            <h4 className="section-label mb-3" style={{ color: 'var(--brand)' }}>Key Metrics</h4>
                            <div className="space-y-1.5 text-[11px]">
                              {[
                                ['P/E', row['P/E'] != null && Number(row['P/E']) < 0 ? 'Loss' : num(row['P/E'])],
                                ['Forward P/E', num(row['Forward_P/E'])],
                                ['ROE', row['ROE_%'] != null ? `${row['ROE_%'].toFixed(1)}%` : '-'],
                                ['ROCE', row['ROCE_%'] != null ? `${row['ROCE_%'].toFixed(1)}%` : '-'],
                                ['D/E', row.Debt_to_Equity != null ? row.Debt_to_Equity.toFixed(2) : '-'],
                                ['Mkt Cap', row.Market_Cap_B != null ? `₹${row.Market_Cap_B.toLocaleString('en-IN')}Cr` : '-'],
                                ['Div Yield', row['Div_Yield_%'] != null ? `${row['Div_Yield_%'].toFixed(2)}%` : '-'],
                                ['Promoter', row['Promoter_Holding_%'] != null ? `${row['Promoter_Holding_%'].toFixed(1)}%` : '-'],
                                ['Sharpe', num(row.Sharpe)],
                                ['Max DD', num(row['Max_Drawdown_%'])],
                              ].map(([label, val]) => (
                                <div key={label as string} className="flex items-center justify-between py-0.5">
                                  <span style={{ color: 'var(--text-2)' }}>{label}</span>
                                  <span className="font-mono" style={{color:'var(--text)'}}>{val}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="mt-4 pt-3 grid grid-cols-3 gap-4 text-xs" style={{ borderTop: '1px solid var(--border)' }}>
                          <div className="flex items-center gap-2">
                            <span style={{ color: 'var(--text-3)' }}>Bull</span>
                            <span className="font-medium font-mono" style={{color:'var(--green)'}}>{row.Bull_Count ?? '-'}</span>
                            <span style={{ color: 'var(--text-3)' }}>/</span>
                            <span style={{ color: 'var(--text-3)' }}>Neutral</span>
                            <span className="font-medium font-mono" style={{color:'var(--text-2)'}}>{row.Bull_Count != null && row.Bear_Count != null ? 15 - row.Bull_Count - row.Bear_Count : '-'}</span>
                            <span style={{ color: 'var(--text-3)' }}>/</span>
                            <span style={{ color: 'var(--text-3)' }}>Bear</span>
                            <span className="font-medium font-mono" style={{color:'var(--red)'}}>{row.Bear_Count ?? '-'}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span style={{ color: 'var(--text-3)' }}>RS Percentile</span>
                            <span className="font-medium font-mono" style={{color:'var(--text)'}}>{num(row.RS_Percentile)}%</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span style={{ color: 'var(--text-3)' }}>Vol vs Avg</span>
                            <span className="font-medium font-mono" style={{color:'var(--text)'}}>{row['Vol_vs_Avg_%'] != null ? `${row['Vol_vs_Avg_%'].toFixed(1)}%` : '-'}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              </React.Fragment>
            ))}
          </tbody>
        </table>
        </div>
        )}
      </div>

      {/* Mobile card view */}
      <div className="sm:hidden space-y-2">
        {filteredData.map((row) => (
          <div key={row.Ticker} className="px-3 py-2.5 card" style={{ borderLeft: expandedRow === row.Ticker ? '3px solid var(--brand)' : '3px solid transparent',
            background: flashTickers[row.Ticker] === 'up' ? 'var(--green-bg)' : flashTickers[row.Ticker] === 'down' ? 'var(--red-bg)' : undefined }}>
            {/* Row 1: Ticker, Score, Conviction, Watch */}
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <button onClick={() => onSelect(row.Ticker)} className="text-sm font-bold" style={{ color: 'var(--text)' }}>
                  {row.Ticker.replace('.NS', '')}
                </button>
                <span className={`badge ${row.Conviction === 'Strong Buy' ? 'badge-strong-buy' : row.Conviction === 'Buy' ? 'badge-buy' : row.Conviction === 'Caution' ? 'badge-caution' : row.Conviction === 'Avoid' ? 'badge-avoid' : 'badge-hold'}`}>
                  {row.Conviction || '-'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-mono font-medium ${colorCode(row.Composite_Score)}`}>{num(row.Composite_Score)}</span>
                <button onClick={() => toggleWatchlist(row.Ticker)}
                  onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.75)')}
                  onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
                  style={{ transition: 'transform var(--dur-fast) var(--ease-out)', border: 'none', background: 'none', cursor: 'pointer', color: watchlist.includes(row.Ticker) ? 'var(--amber)' : 'var(--text-3)' }}>
                  <Star size={13} fill={watchlist.includes(row.Ticker) ? 'var(--amber)' : 'none'} />
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
              <MiniSparkline values={(scoreHistory[row.Ticker] || []).slice(-10).map(s => s.composite)} width={48} height={16} ticker={row.Ticker} />
            </div>

            {/* Row 3: Tech, Fund, Research, F-Score, Value */}
            <div className="flex items-center gap-3 text-[10px]" style={{ color: 'var(--text-3)' }}>
              <span>T <span className={`font-mono font-medium ${colorCode(row.Tech_Score)}`}>{num(row.Tech_Score)}</span></span>
              <span>F <span className="font-mono font-medium">{num(row.Fund_Score)}</span></span>
              <span>R <span className="font-mono font-medium">{num(row.Research_Score)}</span></span>
              <span>P <span className="font-mono font-medium">{row.Piotroski_F ?? '-'}/9</span></span>
              {row.Value_Score != null && <span>V <span className="font-mono font-medium">{num(row.Value_Score)}</span></span>}
              <span className="ml-auto">
                <button onClick={() => setExpandedRow(expandedRow === row.Ticker ? null : row.Ticker)} style={{ color: 'var(--text-3)' }}>
                  <Info size={13} />
                </button>
              </span>
            </div>

            <div style={{
              maxHeight: expandedRow === row.Ticker ? 800 : 0,
              overflow: 'hidden',
              transition: 'max-height var(--dur-slow) var(--ease-out)',
            }}>
              {expandedRow === row.Ticker && (
                <div className="mt-2.5 pt-2.5 space-y-3" style={{ borderTop: '1px solid var(--border)' }}>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                    {[
                      ['P/E', row['P/E'] != null && Number(row['P/E']) < 0 ? 'Loss' : num(row['P/E'])],
                      ['ROE', row['ROE_%'] != null ? `${row['ROE_%'].toFixed(1)}%` : '-'],
                      ['ROCE', row['ROCE_%'] != null ? `${row['ROCE_%'].toFixed(1)}%` : '-'],
                      ['D/E', row.Debt_to_Equity != null ? row.Debt_to_Equity.toFixed(2) : '-'],
                      ['Mkt Cap', row.Market_Cap_B != null ? `₹${row.Market_Cap_B.toLocaleString('en-IN')}Cr` : '-'],
                      ['Promoter', row['Promoter_Holding_%'] != null ? `${row['Promoter_Holding_%'].toFixed(1)}%` : '-'],
                    ].map(([label, val]) => (
                      <div key={label as string} className="flex justify-between py-0.5">
                        <span style={{ color: 'var(--text-3)' }}>{label}</span>
                        <span className="font-mono font-medium" style={{color:'var(--text)'}}>{val}</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <h4 className="section-label mb-1.5" style={{ color: 'var(--brand)' }}>Signals</h4>
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
                    <h4 className="section-label mb-1.5" style={{ color: 'var(--brand)' }}>Factor Scores</h4>
                    <div className="grid grid-cols-2 gap-1 text-[11px]">
                      {[
                        ['Value', row.Value_Score],
                        ['Investment', row.Investment_Score],
                        ['SUE', row.SUE_Score],
                        ['Piotroski', row.Piotroski_F != null ? Number(row.Piotroski_F) / 0.9 : null],
                        ['Gross Profit', row.Gross_Profit_Score],
                        ['Earnings Q', row.Earnings_Quality],
                      ].map(([label, val]) => (
                        <div key={label as string} className="flex justify-between">
                          <span style={{ color: 'var(--text-2)' }}>{label}</span>
                          <span className="font-mono">{`${num(val)}/10`}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
