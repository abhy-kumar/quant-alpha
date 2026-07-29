import React, { useState, useMemo } from 'react'
import type { DashboardData } from '../../types'
import { num, colorCode, scoreColor, getSignalLabel, getBadgeClass, SortHeader, MiniSparkline, InfoTooltip } from '../common/shared'
import { SegmentedControl } from '../common/shared'
import { Info, Funnel, X, Star, Scales, DownloadSimple } from '@phosphor-icons/react'
import { ComparisonModal } from './ComparisonModal'
import { exportToCSV } from '../../utils/exportUtils'

interface Props {
  data: DashboardData[]
  onSelect: (ticker: string) => void
  expandedRow: string | null
  setExpandedRow: (ticker: string | null) => void
  watchlist: string[]
  toggleWatchlist: (ticker: string) => void
  scoreHistory: Record<string, {date: string; composite: number}[]>
  flashTickers?: Record<string, 'up'|'down'>
  isLoggedIn?: boolean
}

const CONVICTION_OPTIONS = ['Strong Buy', 'Buy', 'Hold', 'Caution', 'Avoid']

export default function ScreenerTab({ data, onSelect, expandedRow, setExpandedRow, watchlist, toggleWatchlist, scoreHistory, flashTickers = {}, isLoggedIn = true }: Props) {
  const [sortKey, setSortKey] = useState<string>('Composite_Score')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [showFilters, setShowFilters] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [horizonMode, setHorizonMode] = useState<'short' | 'long'>('short')
  const [compareTickers, setCompareTickers] = useState<string[]>([])
  const [isCompareOpen, setIsCompareOpen] = useState(false)

  // Active score and conviction column names driven by the horizon toggle
  const scoreCol   = horizonMode === 'long' ? 'Composite_Score_Long' : 'Composite_Score'
  const convCol    = horizonMode === 'long' ? 'Conviction_Long'      : 'Conviction'

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
    const stringFields = new Set(['Ticker', 'Sector', 'Conviction', 'Conviction_Long', 'Industry', 'Long_Name', 'ST_Signal'])
    let arr = data.filter(d => {
      if (searchQuery) {
        const q = searchQuery.toUpperCase()
        if (!d.Ticker.replace('.NS','').includes(q) && !(d.Long_Name||'').toUpperCase().includes(q)) return false
      }
      if (Number(d[scoreCol as keyof DashboardData]) < minComposite) return false
      if (Number(d.Piotroski_F) < minPiotroski) return false
      if (minValue > 0 && Number(d.Value_Score) < minValue) return false
      if (maxBeta < 3 && Number(d.Beta) > maxBeta) return false
      if (selectedSectors.length > 0 && !selectedSectors.includes(d.Sector)) return false
      if (selectedConvictions.length > 0 && !selectedConvictions.includes((d as any)[convCol])) return false
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
  }, [data, sortKey, sortDir, minComposite, minPiotroski, selectedSectors, selectedConvictions, minMarketCap, maxDE, searchQuery, minValue, maxBeta, scoreCol, convCol])

  const activeFilterCount = [minComposite > 0, minPiotroski > 0, minValue > 0, maxBeta < 3, selectedSectors.length > 0, selectedConvictions.length > 0, minMarketCap > 0, maxDE < 999, searchQuery.length > 0].filter(Boolean).length

  const clearFilters = () => {
    setMinComposite(0); setMinPiotroski(0); setMinValue(0); setMaxBeta(3)
    setSelectedSectors([]); setSelectedConvictions([]); setMinMarketCap(0); setMaxDE(999); setSearchQuery('')
  }

  const toggleSector = (s: string) => setSelectedSectors(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  const toggleConviction = (c: string) => setSelectedConvictions(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])

  return (
    <div className="space-y-4">
      {/* Algorithm Info + Horizon Toggle */}
      <div className="card p-4" style={{ borderRadius: 'var(--radius-xl)' }}>
        <div className="flex items-center justify-between mb-3">
          <span className="section-label" style={{ color: 'var(--brand)' }}>Scoring Model</span>
          <div className="flex items-center gap-3">
            <SegmentedControl
              options={[
                { key: 'short', label: 'Short-term' },
                { key: 'long',  label: '1m–6m Horizon' },
              ]}
              value={horizonMode}
              onChange={(v) => {
                setHorizonMode(v as 'short' | 'long')
                // Switch default sort to the matching score column
                setSortKey(v === 'long' ? 'Composite_Score_Long' : 'Composite_Score')
                setSortDir('desc')
              }}
            />
            <span className="text-xs hidden sm:inline" style={{ color: 'var(--text-3)' }}>9 Factors · Cross-Sectional Ranking</span>
          </div>
        </div>
        {horizonMode === 'short' ? (
          <div className="grid grid-cols-5 sm:grid-cols-9 gap-3 text-center">
            {[
              ['Piotroski', '0.08', 'var(--green)'],
              ['Profitability', '0.15', 'var(--green)'],
              ['Earnings Q', '0.10', 'var(--green)'],
              ['Momentum', '0.20', 'var(--brand)'],
              ['Value', '0.15', 'var(--blue)'],
              ['Low Vol', '0.07', 'var(--text-2)'],
              ['Beta', '0.05', 'var(--text-2)'],
              ['Investment', '0.10', 'var(--text-2)'],
              ['SUE', '0.10', 'var(--text-2)'],
            ].map(([label, weight, color]) => (
              <div key={label} className="flex flex-col items-center">
                <span className="text-sm font-mono font-medium" style={{ color }}>{weight}</span>
                <span className="text-[11px] mt-0.5" style={{ color: 'var(--text-3)' }}>{label}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-5 sm:grid-cols-8 gap-3 text-center">
            {[
              ['Profitability', '0.18', 'var(--green)'],
              ['Momentum+52W', '0.20', 'var(--brand)'],
              ['Value', '0.18', 'var(--blue)'],
              ['Investment', '0.12', 'var(--text-2)'],
              ['SUE', '0.10', 'var(--text-2)'],
              ['Low Vol', '0.10', 'var(--text-2)'],
              ['Piotroski', '0.07', 'var(--green)'],
              ['Earnings Q', '0.05', 'var(--green)'],
            ].map(([label, weight, color]) => (
              <div key={label} className="flex flex-col items-center">
                <span className="text-sm font-mono font-medium" style={{ color }}>{weight}</span>
                <span className="text-[11px] mt-0.5" style={{ color: 'var(--text-3)' }}>{label}</span>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 pt-2 flex flex-wrap gap-3 text-[11px]" style={{ borderTop: '1px solid var(--glass-border)', color: 'var(--text-3)' }}>
          {horizonMode === 'short' ? (
            <span>Composite: Tech 35% · Fund 25% · Research 40%</span>
          ) : (
            <span>Long Composite: Tech 15% · Fund 35% · Research (Long) 50% · 52W proximity embedded in momentum</span>
          )}
        </div>
      </div>

      {/* Search + Filter bar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1">
          <input type="text" placeholder="Search ticker or company..." value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="glass-input"
            style={{ width: 220 }}
          />
          <span className="text-[12px]" style={{color:'var(--text-3)'}}>Displaying {filteredData.length} of {data.length} stocks</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const exportData = filteredData.map(d => ({
                Ticker: d.Ticker,
                Company: d.Long_Name || d.Ticker,
                Sector: d.Sector,
                Score: horizonMode === 'long' ? d.Composite_Score_Long : d.Composite_Score,
                Conviction: horizonMode === 'long' ? d.Conviction_Long : d.Conviction,
                Price: d.Price,
                Change_Pct: d["1d_Chg_%"],
                Piotroski_F: d.Piotroski_F,
                RSI: d.RSI_Value,
                Volume_Signal: d.Sig_Volume,
              }))
              exportToCSV(`QuantAlpha_Screener_${horizonMode}_${new Date().toISOString().slice(0, 10)}.csv`, exportData)
            }}
            className="btn-glass"
            title="Export filtered securities to CSV"
          >
            <DownloadSimple size={14} weight="bold" /> Export CSV
          </button>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 px-3 py-1.5 text-[13px] font-medium rounded-xl transition-all duration-200"
            style={{
              background: showFilters ? 'var(--brand)' : 'var(--glass-bg)',
              color: showFilters ? '#fff' : 'var(--text-2)',
              border: `1px solid ${showFilters ? 'var(--brand)' : 'var(--glass-border)'}`,
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              boxShadow: showFilters ? '0 4px 12px rgba(110, 168, 254, 0.3)' : 'var(--glass-shadow)',
            }}
          >
            <Funnel size={14} weight="duotone" /> Filters
            {activeFilterCount > 0 && (
              <span style={{ minWidth: 18, height: 18, borderRadius: 9, background: showFilters ? 'rgba(255,255,255,0.2)' : 'var(--brand)',
                color: showFilters ? 'white' : 'white', fontSize: 10, fontWeight: 700,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Filters panel with animation */}
      <div className="filter-panel" data-open={showFilters ? 'true' : 'false'}>
        <div className="p-5 card" style={{ borderRadius: 'var(--radius-xl)' }}>
          <div className="flex items-center justify-between mb-4">
            <span className="section-label" style={{ color: 'var(--brand)' }}>Filters</span>
            {activeFilterCount > 0 && (
              <button onClick={clearFilters} className="flex items-center gap-1 text-xs transition-colors" style={{ color: 'var(--text-3)' }}>
                <X size={12} weight="light" /> Clear all
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
              <label className="text-xs mb-1.5 block" style={{ color: 'var(--text-2)' }}>Min market cap: ₹{minMarketCap >= 1000 ? `${(minMarketCap/1000).toFixed(1)}T` : `${minMarketCap}B`}</label>
              <input type="range" min="0" max="500" step="5" value={minMarketCap} onChange={e => setMinMarketCap(Number(e.target.value))} className="w-full" aria-label="Minimum market cap" />
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
                  <button key={s} onClick={() => toggleSector(s)} className="px-2.5 py-1 text-[11px] font-medium rounded-lg transition-all duration-200" style={selectedSectors.includes(s) ? {
                    background: 'var(--brand)', color: '#fff',
                    border: '1px solid var(--brand)',
                    boxShadow: '0 2px 8px rgba(110, 168, 254, 0.3)',
                  } : {
                    background: 'var(--glass-bg-subtle)', color: 'var(--text-2)',
                    border: '1px solid var(--glass-border)',
                    backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
                  }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            {isLoggedIn && (
            <div>
              <label className="text-xs mb-2 block" style={{ color: 'var(--text-2)' }}>Conviction</label>
              <div className="flex flex-wrap gap-1.5">
                {CONVICTION_OPTIONS.map(c => (
                  <button key={c} onClick={() => toggleConviction(c)} className="px-2.5 py-1 text-[11px] font-medium rounded-lg transition-all duration-200" style={selectedConvictions.includes(c) ? {
                    background: 'var(--brand)', color: '#fff',
                    border: '1px solid var(--brand)',
                    boxShadow: '0 2px 8px rgba(110, 168, 254, 0.3)',
                  } : {
                    background: 'var(--glass-bg-subtle)', color: 'var(--text-2)',
                    border: '1px solid var(--glass-border)',
                    backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
                  }}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
            )}
          </div>
        </div>
      </div>

      {/* Desktop table */}
      <div className="overflow-hidden hidden sm:block card" style={{ borderRadius: 'var(--radius-xl)' }}>
        {filteredData.length === 0 ? (
          <div style={{ textAlign:'center', padding:'48px 0' }}>
            <p style={{ color:'var(--text-2)', marginBottom:8 }}>No stocks match your filters.</p>
            <p style={{ color:'var(--text-3)', fontSize:12 }}>Try removing some filters or lowering the minimum score.</p>
          </div>
        ) : (
        <div className="overflow-x-auto">
        <table className="w-full text-left text-xs" style={{borderCollapse:'collapse'}}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
              <th className="py-2 px-1 text-center w-8" style={{ color: 'var(--text-3)' }}>
                <span title="Select up to 4 stocks to compare"><Scales size={14} /></span>
              </th>
              <th className="py-2 px-2 text-[10px] font-medium cursor-pointer select-none uppercase tracking-wider" style={{color:'var(--text-3)',textAlign:'left',position:'sticky',left:0,background:'var(--surface)',zIndex:1}} onClick={()=>handleSort('Ticker')}>
                <span className="inline-flex items-center gap-1"><InfoTooltip id="screener.ticker">Ticker</InfoTooltip>{sortKey==='Ticker'&&<span style={{color:'var(--brand)'}}>{sortDir==='asc'?'↑':'↓'}</span>}</span>
              </th>
              <SortHeader field="Sector" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}><span className="hidden md:inline"><InfoTooltip id="screener.sector">Sector</InfoTooltip></span></SortHeader>
              <SortHeader field="Price" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}><InfoTooltip id="screener.price">Price</InfoTooltip></SortHeader>
              <SortHeader field="1d_Chg_%" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}><InfoTooltip id="screener.1d">1D</InfoTooltip></SortHeader>
              {isLoggedIn && <SortHeader field={scoreCol} align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}><InfoTooltip id="screener.score">{horizonMode === 'long' ? 'Long Score' : 'Score'}</InfoTooltip></SortHeader>}
              <th className="py-2 px-2 font-medium text-[10px] text-center" style={{ color: 'var(--text-2)' }}><InfoTooltip id="screener.trend">Trend</InfoTooltip></th>
              <SortHeader field="Tech_Score" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}><span className="hidden md:inline"><InfoTooltip id="screener.tech">Tech</InfoTooltip></span></SortHeader>
              <SortHeader field="Fund_Score" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}><span className="hidden lg:inline"><InfoTooltip id="screener.fund">Fund</InfoTooltip></span></SortHeader>
              <SortHeader field="Research_Score" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}><span className="hidden lg:inline"><InfoTooltip id="screener.research">Research</InfoTooltip></span></SortHeader>
              <SortHeader field="Piotroski_F" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}><span className="hidden lg:inline"><InfoTooltip id="screener.fscore">F-Score</InfoTooltip></span></SortHeader>
              <SortHeader field="Momentum_12M" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}><span className="hidden xl:inline"><InfoTooltip id="screener.12m-mom">12M Mom</InfoTooltip></span></SortHeader>
              <SortHeader field="Value_Score" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}><span className="hidden xl:inline"><InfoTooltip id="screener.value">Value</InfoTooltip></span></SortHeader>
              <SortHeader field="Beta" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}><span className="hidden xl:inline"><InfoTooltip id="screener.beta">Beta</InfoTooltip></span></SortHeader>
              <SortHeader field="P/E" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}><span className="hidden xl:inline"><InfoTooltip id="screener.pe">P/E</InfoTooltip></span></SortHeader>
              {isLoggedIn && <SortHeader field={convCol} sortKey={sortKey} sortDir={sortDir} onSort={handleSort}><InfoTooltip id="screener.conv">{horizonMode === 'long' ? 'L-Conv' : 'Conv'}</InfoTooltip></SortHeader>}
              <th className="py-2 px-2"></th>
            </tr>
          </thead>
          <tbody>
            {filteredData.map((row) => (
              <React.Fragment key={row.Ticker}>
                <tr
                  className="transition-colors"
                  style={{
                    borderBottom: '1px solid var(--glass-border)',
                    background: expandedRow === row.Ticker ? 'var(--glass-bg-subtle)' : flashTickers[row.Ticker] === 'up' ? 'var(--green-bg)' : flashTickers[row.Ticker] === 'down' ? 'var(--red-bg)' : 'transparent',
                    cursor: 'pointer',
                    transition: 'background var(--dur-fast)',
                  }}
                  onMouseEnter={e => { if (expandedRow !== row.Ticker && !flashTickers[row.Ticker]) e.currentTarget.style.background = 'var(--glass-bg-subtle)' }}
                  onMouseLeave={e => { if (expandedRow === row.Ticker) e.currentTarget.style.background = 'var(--glass-bg-subtle)' ; else if (!flashTickers[row.Ticker]) e.currentTarget.style.background = 'transparent' }}
                >
                  <td className="py-2 px-1 text-center" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={compareTickers.includes(row.Ticker)}
                      onChange={() => {
                        setCompareTickers(prev =>
                          prev.includes(row.Ticker) ? prev.filter(t => t !== row.Ticker) : prev.length < 4 ? [...prev, row.Ticker] : prev
                        )
                      }}
                      className="accent-brand rounded cursor-pointer"
                      title="Compare stock"
                    />
                  </td>
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
                  {isLoggedIn && <td className={`py-2 px-2 text-right font-medium font-mono ${scoreColor((row as any)[scoreCol])}`}>{num((row as any)[scoreCol])}</td>}
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
                  {isLoggedIn && (
                  <td className="py-2 px-2 font-medium whitespace-nowrap">
                    <span className={`badge ${getBadgeClass((row as any)[convCol])}`}>
                      {(row as any)[convCol] || '-'}
                    </span>
                  </td>
                  )}
                  <td className="py-2 px-2">
                    <div className="flex items-center gap-1">
                      <button onClick={(e) => { e.stopPropagation(); toggleWatchlist(row.Ticker) }}
                        onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.75)')}
                        onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
                        style={{ transition: 'transform var(--dur-fast) var(--ease-out)', border: 'none', background: 'none', cursor: 'pointer', color: watchlist.includes(row.Ticker) ? 'var(--amber)' : 'var(--text-3)' }}>
                        <Star size={12} weight="fill" color={watchlist.includes(row.Ticker) ? 'var(--amber)' : 'var(--text-3)'} style={{ transition: 'color var(--dur-base)' }}/>
                      </button>
                      <button onClick={() => setExpandedRow(expandedRow === row.Ticker ? null : row.Ticker)} className="transition-colors" style={{ color: 'var(--text-3)' }}>
                        <Info size={14} weight="duotone" />
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
                      <div className="p-6" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--glass-border)' }}>
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                          <div>
                            <h4 className="section-label mb-3" style={{ color: 'var(--brand)' }}>Technical Signals</h4>
                            <div className="space-y-1.5 text-[11px]">
                              {[
                                ['Price vs SMA50', row.Sig_Price_vs_SMA50, 'sig.price-sma50'], ['Price vs SMA200', row.Sig_Price_vs_SMA200, 'sig.price-sma200'],
                                ['SMA50 vs SMA200', row.Sig_SMA50_vs_SMA200, 'sig.sma-cross'], ['RSI', row.Sig_RSI, 'sig.rsi'],
                                ['MACD Cross', row.Sig_MACD_Cross, 'sig.macd-cross'], ['MACD Hist', row.Sig_MACD_Hist, 'sig.macd-hist'],
                                ['Stochastic', row.Sig_Stoch, 'sig.stoch'], ['Bollinger Bands', row.Sig_BB, 'sig.bb'],
                                ['CCI', row.Sig_CCI, 'sig.cci'], ['Volume Spike', row.Sig_Volume, 'sig.vol-spike'],
                                ['ADX Trend', row.Sig_ADX, 'sig.adx'], ['Supertrend', row.Sig_Supertrend, 'sig.supertrend'],
                                ['Vol Price Trend', row.Sig_VPT, 'sig.vpt'], ['Ichimoku Cloud', row.Sig_Ichimoku, 'sig.ichimoku'],
                              ].map(([label, val, tooltipId]) => (
                                <div key={label as string} className="flex items-center justify-between py-0.5">
                                  <span style={{ color: 'var(--text-2)' }}><InfoTooltip id={tooltipId as string}>{label as string}</InfoTooltip></span>
                                  {getSignalLabel(val)}
                                </div>
                              ))}
                            </div>
                          </div>
                          <div>
                            <h4 className="section-label mb-3" style={{ color: 'var(--brand)' }}>Research Factors</h4>
                            <div className="space-y-1.5 text-[11px]">
                              {[
                                ['Piotroski F-Score', `${row.Piotroski_F ?? '-'}/9`, 'research.piotroski'],
                                ['Gross Profitability', `${num(row.Gross_Profit_Score)}/10`, 'research.gross-profit'],
                                ['Earnings Quality', `${num(row.Earnings_Quality)}/10`, 'research.earnings-quality'],
                                ['Value Factor', `${num(row.Value_Score)}/10`, 'research.value'],
                                ['Investment Factor', `${num(row.Investment_Score)}/10`, 'research.investment'],
                                ['SUE / Earnings Mom', `${num(row.SUE_Score)}/10`, 'research.sue'],
                                ['Low Volatility', row.Vol_60D != null ? `${row.Vol_60D.toFixed(1)}%` : '-', 'research.low-vol'],
                                ['Betting Against Beta', row.Beta != null ? `${row.Beta.toFixed(2)} Î²` : '-', 'research.bab'],
                                ['Alpha (60D)', row.Alpha_60D != null ? `${row.Alpha_60D.toFixed(1)}%` : '-', 'research.alpha-60d'],
                                ['12M Momentum', row.Momentum_12M != null ? `${(row.Momentum_12M * 100).toFixed(1)}%` : '-', 'research.12m-mom'],
                                ['Risk-Adj Mom', num(row.Risk_Adj_Mom), 'research.risk-adj-mom'],
                                ['Z-Score (60D)', num(row.Z_Score_60), 'research.z-score-60d'],
                              ].map(([label, val, tooltipId]) => (
                                <div key={label as string} className="flex items-center justify-between py-0.5">
                                  <span style={{ color: 'var(--text-2)' }}><InfoTooltip id={tooltipId as string}>{label as string}</InfoTooltip></span>
                                  <span className="font-mono" style={{color:'var(--text)'}}>{val as React.ReactNode}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div>
                            <h4 className="section-label mb-3" style={{ color: 'var(--brand)' }}>Key Metrics</h4>
                            <div className="space-y-1.5 text-[11px]">
                              {[
                                ['P/E', row['P/E'] != null && Number(row['P/E']) < 0 ? 'Loss' : num(row['P/E']), 'metrics.pe'],
                                ['Forward P/E', num(row['Forward_P/E']), 'metrics.forward-pe'],
                                ['ROE', row['ROE_%'] != null ? `${row['ROE_%'].toFixed(1)}%` : '-', 'metrics.roe'],
                                ['ROCE', row['ROCE_%'] != null ? `${row['ROCE_%'].toFixed(1)}%` : '-', 'metrics.roce'],
                                ['D/E', row.Debt_to_Equity != null ? row.Debt_to_Equity.toFixed(2) : '-', 'metrics.de'],
                                ['Mkt Cap', row.Market_Cap_B != null ? `₹${row.Market_Cap_B.toLocaleString('en-IN')}B` : '-', 'metrics.mkt-cap'],
                                ['Div Yield', row['Div_Yield_%'] != null ? `${row['Div_Yield_%'].toFixed(2)}%` : '-', 'metrics.div-yield'],
                                ['Promoter', row['Promoter_Holding_%'] != null ? `${row['Promoter_Holding_%'].toFixed(1)}%` : '-', 'metrics.promoter'],
                                ['Sharpe', num(row.Sharpe), 'metrics.sharpe'],
                                ['Max DD', num(row['Max_Drawdown_%']), 'metrics.max-dd'],
                              ].map(([label, val, tooltipId]) => (
                                <div key={label as string} className="flex items-center justify-between py-0.5">
                                  <span style={{ color: 'var(--text-2)' }}><InfoTooltip id={tooltipId as string}>{label as string}</InfoTooltip></span>
                                  <span className="font-mono" style={{color:'var(--text)'}}>{val as React.ReactNode}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="mt-4 pt-3 grid grid-cols-3 gap-4 text-xs" style={{ borderTop: '1px solid var(--glass-border)' }}>
                          <div className="flex items-center gap-2">
                            <span style={{ color: 'var(--text-3)' }}><InfoTooltip id="footer.bull-bear">Bull</InfoTooltip></span>
                            <span className="font-medium font-mono" style={{color:'var(--green)'}}>{row.Bull_Count ?? '-'}</span>
                            <span style={{ color: 'var(--text-3)' }}>/</span>
                            <span style={{ color: 'var(--text-3)' }}>Neutral</span>
                            <span className="font-medium font-mono" style={{color:'var(--text-2)'}}>{row.Bull_Count != null && row.Bear_Count != null ? 15 - row.Bull_Count - row.Bear_Count : '-'}</span>
                            <span style={{ color: 'var(--text-3)' }}>/</span>
                            <span style={{ color: 'var(--text-3)' }}>Bear</span>
                            <span className="font-medium font-mono" style={{color:'var(--red)'}}>{row.Bear_Count ?? '-'}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span style={{ color: 'var(--text-3)' }}><InfoTooltip id="footer.rs-percentile">RS Percentile</InfoTooltip></span>
                            <span className="font-medium font-mono" style={{color:'var(--text)'}}>{num(row.RS_Percentile)}%</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span style={{ color: 'var(--text-3)' }}><InfoTooltip id="footer.vol-vs-avg">Vol vs Avg</InfoTooltip></span>
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
          <div key={row.Ticker} className="card" style={{
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
            background: expandedRow === row.Ticker
              ? 'var(--glass-bg-strong)'
              : flashTickers[row.Ticker] === 'up' ? 'rgba(74, 222, 128, 0.06)'
              : flashTickers[row.Ticker] === 'down' ? 'rgba(248, 113, 113, 0.06)'
              : undefined,
            boxShadow: expandedRow === row.Ticker ? 'var(--glass-shadow-lg)' : undefined,
          }}>
            {/* Conviction accent line - top, not left */}
            {expandedRow === row.Ticker && (
              <div style={{ height: 2, background: 'linear-gradient(90deg, var(--brand), transparent)', borderRadius: '2px 2px 0 0' }} />
            )}

            {/* Main card content */}
            <div className="px-3 py-2.5">
              {/* Row 1: Ticker, Score, Conviction, Watch */}
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <button onClick={() => onSelect(row.Ticker)} className="text-sm font-bold" style={{ color: 'var(--text)' }}>
                    {row.Ticker.replace('.NS', '')}
                  </button>
                  {isLoggedIn && (
                  <span className={`badge ${getBadgeClass((row as any)[convCol])}`}>
                    {(row as any)[convCol] || '-'}
                  </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {isLoggedIn && <span className={`text-sm font-mono font-medium ${scoreColor(row.Composite_Score)}`}>{num(row.Composite_Score)}</span>}
                  <button onClick={() => toggleWatchlist(row.Ticker)}
                    onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.75)')}
                    onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
                    style={{ transition: 'transform var(--dur-fast) var(--ease-out)', border: 'none', background: 'none', cursor: 'pointer', color: watchlist.includes(row.Ticker) ? 'var(--amber)' : 'var(--text-3)' }}>
                    <Star size={13} weight="fill" color={watchlist.includes(row.Ticker) ? 'var(--amber)' : 'var(--text-3)'} />
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

              {/* Row 3: Tech, Fund, Research, F-Score, Value + expand */}
              <div className="flex items-center gap-3 text-[10px]" style={{ color: 'var(--text-3)' }}>
                <span><InfoTooltip id="screener.tech">T</InfoTooltip> <span className={`font-mono font-medium ${colorCode(row.Tech_Score)}`}>{num(row.Tech_Score)}</span></span>
                <span><InfoTooltip id="screener.fund">F</InfoTooltip> <span className="font-mono font-medium">{num(row.Fund_Score)}</span></span>
                <span><InfoTooltip id="screener.research">R</InfoTooltip> <span className="font-mono font-medium">{num(row.Research_Score)}</span></span>
                <span><InfoTooltip id="screener.fscore">P</InfoTooltip> <span className="font-mono font-medium">{row.Piotroski_F ?? '-'}/9</span></span>
                {row.Value_Score != null && <span><InfoTooltip id="screener.value">V</InfoTooltip> <span className="font-mono font-medium">{num(row.Value_Score)}</span></span>}
                <span className="ml-auto">
                  <button
                    onClick={() => setExpandedRow(expandedRow === row.Ticker ? null : row.Ticker)}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-md transition-colors text-[10px] font-medium"
                    style={{
                      color: expandedRow === row.Ticker ? 'var(--brand)' : 'var(--text-3)',
                      background: expandedRow === row.Ticker ? 'var(--brand-soft)' : 'transparent',
                    }}>
                    <Info size={12} weight="duotone" />
                    {expandedRow === row.Ticker ? 'Close' : 'Details'}
                  </button>
                </span>
              </div>
            </div>

            {/* Expanded info - slides in below */}
            <div style={{
              maxHeight: expandedRow === row.Ticker ? 700 : 0,
              overflow: 'hidden',
              transition: 'max-height var(--dur-slow) var(--ease-out)',
            }}>
              {expandedRow === row.Ticker && (
                <div style={{ borderTop: '1px solid var(--glass-border)' }}>
                  {/* Metrics grid */}
                  <div className="px-3 py-2.5 grid grid-cols-3 gap-x-3 gap-y-2.5 text-[11px]">
                    {[
                      ['P/E', row['P/E'] != null && Number(row['P/E']) < 0 ? 'Loss' : num(row['P/E']), 'metrics.pe'],
                      ['ROE', row['ROE_%'] != null ? `${row['ROE_%'].toFixed(1)}%` : '-', 'metrics.roe'],
                      ['ROCE', row['ROCE_%'] != null ? `${row['ROCE_%'].toFixed(1)}%` : '-', 'metrics.roce'],
                      ['D/E', row.Debt_to_Equity != null ? row.Debt_to_Equity.toFixed(2) : '-', 'metrics.de'],
                      ['Mkt Cap', row.Market_Cap_B != null ? `₹${row.Market_Cap_B.toLocaleString('en-IN')}B` : '-', 'metrics.mkt-cap'],
                      ['Promoter', row['Promoter_Holding_%'] != null ? `${row['Promoter_Holding_%'].toFixed(1)}%` : '-', 'metrics.promoter'],
                    ].map(([label, val, tooltipId]) => (
                      <div key={label as string} className="flex flex-col gap-0.5">
                        <span className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
                          <InfoTooltip id={tooltipId as string}>{label as string}</InfoTooltip>
                        </span>
                        <span className="font-mono font-medium text-[12px]" style={{ color: 'var(--text)' }}>{val as React.ReactNode}</span>
                      </div>
                    ))}
                  </div>

                  {/* Signals */}
                  <div className="px-3 pb-2 pt-1" style={{ borderTop: '1px solid var(--glass-border)' }}>
                    <p className="text-[9px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-3)' }}>Technical Signals</p>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        ['SMA50', row.Sig_Price_vs_SMA50, 'sig.price-sma50'],
                        ['SMA200', row.Sig_Price_vs_SMA200, 'sig.price-sma200'],
                        ['GC/DC', row.Sig_SMA50_vs_SMA200, 'sig.sma-cross'],
                        ['RSI', row.Sig_RSI, 'sig.rsi'],
                        ['MACD', row.Sig_MACD_Cross, 'sig.macd-cross'],
                        ['ST', row.Sig_Supertrend, 'sig.supertrend'],
                        ['BB', row.Sig_BB, 'sig.bb'],
                        ['ADX', row.Sig_ADX, 'sig.adx'],
                      ].map(([label, val, tooltipId]) => {
                        const bullish = val === 1
                        const bearish = val === -1
                        return (
                          <span
                            key={label as string}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium"
                            style={{
                              background: bullish ? 'rgba(74,222,128,0.10)' : bearish ? 'rgba(248,113,113,0.10)' : 'var(--glass-bg-subtle)',
                              color: bullish ? 'var(--green)' : bearish ? 'var(--red)' : 'var(--text-3)',
                              border: `1px solid ${bullish ? 'rgba(74,222,128,0.18)' : bearish ? 'rgba(248,113,113,0.18)' : 'var(--glass-border)'}`,
                            }}
                          >
                            <InfoTooltip id={tooltipId as string}>{label as string}</InfoTooltip>
                            <span>{bullish ? '↑' : bearish ? '↓' : '-'}</span>
                          </span>
                        )
                      })}
                    </div>
                  </div>

                  {/* Factor scores - compact horizontal bars */}
                  <div className="px-3 pb-3 pt-1" style={{ borderTop: '1px solid var(--glass-border)' }}>
                    <p className="text-[9px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-3)' }}>Factor Scores</p>
                    <div className="space-y-1.5">
                      {[
                        ['Value', row.Value_Score],
                        ['Investment', row.Investment_Score],
                        ['SUE', row.SUE_Score],
                        ['Gross Profit', row.Gross_Profit_Score],
                        ['Earnings Q', row.Earnings_Quality],
                      ].map(([label, val]) => {
                        const v = Number(val) || 0
                        const pct = Math.min(100, (v / 10) * 100)
                        return (
                          <div key={label as string} className="flex items-center gap-2">
                            <span className="text-[10px] w-20 shrink-0" style={{ color: 'var(--text-3)' }}>{label as string}</span>
                            <div className="flex-1 h-1 rounded-full" style={{ background: 'var(--glass-border)' }}>
                              <div
                                className="h-1 rounded-full"
                                style={{
                                  width: `${pct}%`,
                                  background: v >= 7 ? 'var(--green)' : v >= 5 ? 'var(--brand)' : v >= 3 ? 'var(--amber)' : 'var(--red)',
                                  transition: 'width 400ms var(--ease-out)',
                                }}
                              />
                            </div>
                            <span className="font-mono text-[10px] w-5 text-right" style={{ color: 'var(--text-2)' }}>{num(val)}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Floating Stock Comparison Toolbar */}
      {compareTickers.length > 0 && (
        <div
          className="fixed bottom-6 right-6 z-40 flex items-center gap-3 px-4 py-3 rounded-2xl glass-strong shadow-2xl animate-fade-in"
          style={{
            background: 'var(--surface-3)',
            color: 'var(--text)',
            border: '1px solid var(--border-2)',
            boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
          }}
        >
          <div className="flex items-center gap-2">
            <Scales size={18} style={{ color: 'var(--brand)' }} />
            <span className="text-xs font-semibold" style={{ color: 'var(--text)' }}>
              {compareTickers.length} of 4 stocks selected
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsCompareOpen(true)}
              className="px-3 py-1.5 rounded-xl font-bold text-xs transition-all shadow-md"
              style={{
                background: 'var(--brand)',
                color: '#ffffff',
              }}
            >
              Compare Matrix
            </button>
            <button
              onClick={() => setCompareTickers([])}
              className="p-1.5 rounded-lg transition-colors text-xs hover:bg-white/10"
              style={{ color: 'var(--text-3)' }}
              title="Clear selection"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Multi-Stock Comparison Matrix Modal */}
      <ComparisonModal
        isOpen={isCompareOpen}
        onClose={() => setIsCompareOpen(false)}
        tickers={compareTickers}
        allData={data}
        onRemoveTicker={(t) => setCompareTickers((prev) => prev.filter((x) => x !== t))}
        onSelectTicker={onSelect}
      />
    </div>
  )
}
