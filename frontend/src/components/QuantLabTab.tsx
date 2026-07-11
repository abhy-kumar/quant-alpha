import { useEffect, useState, useMemo } from 'react'
import type { QuantData } from '../types'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, BarChart, Bar, PieChart, Pie, Cell, ReferenceLine } from 'recharts'
import { Flask, Target, Scales, Crosshair, TrendUp, ChartLineDown, ShieldCheck, Warning, ChartPieSlice, GridFour, CalendarBlank } from '@phosphor-icons/react'
import { SegmentedControl, InfoTooltip } from './shared'

interface Props {
  isDark: boolean
  scanUpdated?: string
}

const tooltipStyle = (isDark: boolean) => ({
  backgroundColor: isDark ? '#09090b' : '#ffffff',
  borderColor: isDark ? '#18181b' : '#E4E7EC',
  borderRadius: 'var(--radius)',
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: '12px',
  color: isDark ? '#E8ECF2' : '#1A1D26',
  boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.4)' : '0 8px 32px rgba(0,0,0,0.08)',
  padding: '10px 14px',
})

// Recompute backtest stats from a windowed slice of chart data
function computeStats(chart: { date: string; portfolio: number; benchmark: number }[]) {
  if (chart.length < 2) return null
  const first = chart[0].portfolio
  const last = chart[chart.length - 1].portfolio
  const days = Math.max(
    (new Date(chart[chart.length - 1].date).getTime() - new Date(chart[0].date).getTime()) / 86400000,
    1
  )
  const years = Math.max(days / 365.25, 0.01)
  const totalRet = (last / first) - 1
  const cagr = Math.pow(1 + totalRet, 1 / years) - 1

  const dailyReturns = chart.slice(1).map((d, i) => d.portfolio / chart[i].portfolio - 1)
  const benchReturns = chart.slice(1).map((d, i) => d.benchmark / chart[i].benchmark - 1)
  const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length
  const variance = dailyReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / dailyReturns.length
  const annVol = Math.sqrt(variance * 252)
  const sharpe = annVol > 0 ? (cagr - 0.065) / annVol : 0

  let peak = chart[0].portfolio
  let maxDd = 0
  for (const pt of chart) {
    if (pt.portfolio > peak) peak = pt.portfolio
    const dd = (pt.portfolio / peak) - 1
    if (dd < maxDd) maxDd = dd
  }

  const benchFirst = chart[0].benchmark
  const benchLast = chart[chart.length - 1].benchmark
  const benchRet = (benchLast / benchFirst) - 1
  const benchCagr = Math.pow(1 + benchRet, 1 / years) - 1
  const trackingErr = Math.sqrt(
    dailyReturns.map((r, i) => (r - benchReturns[i]) ** 2).reduce((a, b) => a + b, 0) / dailyReturns.length * 252
  )
  const infoRatio = trackingErr > 0 ? (cagr - benchCagr) / trackingErr : 0
  const winRate = dailyReturns.filter(r => r > 0).length / dailyReturns.length * 100

  return {
    total_return: +(totalRet * 100).toFixed(2),
    cagr: +(cagr * 100).toFixed(2),
    volatility: +(annVol * 100).toFixed(2),
    sharpe: +sharpe.toFixed(2),
    max_drawdown: +(maxDd * 100).toFixed(2),
    info_ratio: +infoRatio.toFixed(2),
    win_rate: +winRate.toFixed(1),
  }
}

export default function QuantLabTab({ isDark, scanUpdated }: Props) {
  const [quantData, setQuantData] = useState<QuantData | null>(null)
  const [loading, setLoading] = useState(true)
  const [startDate, setStartDate] = useState<string>('')
  const [backtestMode, setBacktestMode] = useState<'short' | 'long'>('short')

  useEffect(() => {
    fetch('/quant_data.json?t=' + Date.now())
      .then(r => r.json())
      .then(d => {
        setQuantData(d)
        setLoading(false)
      })
      .catch(e => {
        console.error('Failed to load quant data', e)
        setLoading(false)
      })
  }, [scanUpdated])

  const radarData = useMemo(() => {
    if (!quantData?.factor_exposures) return []
    const ex = quantData.factor_exposures
    return [
      { subject: 'Value', A: ex.Value, fullMark: 100 },
      { subject: 'Momentum', A: ex.Momentum, fullMark: 100 },
      { subject: 'Quality', A: ex.Quality, fullMark: 100 },
      { subject: 'Low Volatility', A: ex.Low_Volatility, fullMark: 100 }
    ]
  }, [quantData])

  // Active backtest dataset switches based on the model toggle
  const activeBacktest = backtestMode === 'long'
    ? (quantData?.backtest_long ?? quantData?.backtest)
    : quantData?.backtest

  const allChartData = activeBacktest?.chart ?? []
  const firstDate = allChartData[0]?.date ?? ''

  // Determine the effective start date (default = first available date)
  const effectiveStart = startDate || firstDate

  // Slice and rebase chart data from the chosen start date
  const windowedChart = useMemo(() => {
    if (!allChartData.length) return []
    const idx = allChartData.findIndex(d => d.date >= effectiveStart)
    const slice = idx >= 0 ? allChartData.slice(idx) : allChartData
    if (slice.length === 0) return []
    const basePort = slice[0].portfolio
    const baseBench = slice[0].benchmark
    return slice.map(d => ({
      ...d,
      portfolio: +((d.portfolio / basePort) * 100).toFixed(2),
      benchmark: +((d.benchmark / baseBench) * 100).toFixed(2),
    }))
  }, [allChartData, effectiveStart])

  const computedStats = useMemo(() => {
    if (!allChartData.length) return null
    const idx = allChartData.findIndex(d => d.date >= effectiveStart)
    const slice = idx >= 0 ? allChartData.slice(idx) : allChartData
    return computeStats(slice)
  }, [allChartData, effectiveStart])

  const backtestStats = computedStats

  if (loading) {
    return <div className="p-8 text-center" style={{ color: 'var(--text-3)' }}>Loading Quant Lab...</div>
  }

  if (!quantData || !quantData.backtest?.chart || quantData.backtest.chart.length === 0) {
    return (
      <div className="p-8 text-center card" style={{ borderRadius: 'var(--radius-xl)' }}>
        <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text)' }}>Quant Lab Initialization</h3>
        <p style={{ color: 'var(--text-2)' }}>Insufficient history to run portfolio optimizations or backtests. Run the scanner for a few more days to collect data.</p>
      </div>
    )
  }

  const max_sharpe = quantData.model_portfolios?.max_sharpe || {}
  const min_volatility = quantData.model_portfolios?.min_volatility || {}

  return (
    <div className="space-y-5">
      {/* Header row: description + regime */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="overflow-hidden card lg:col-span-2" data-liquid style={{ borderRadius: 'var(--radius-xl)' }}>
          <div className="px-4 py-3 text-xs font-medium" style={{ borderBottom: '1px solid var(--glass-border)', color: 'var(--text-2)' }}>
            Quant Lab · Last calculated: {quantData.last_updated}
          </div>
          <div className="p-5 flex items-start gap-4">
            <div className="p-2.5 shrink-0" style={{ background: 'var(--brand-soft)', borderRadius: 'var(--radius)' }}>
              <Flask size={18} weight="duotone" style={{ color: 'var(--brand)' }} />
            </div>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-2)' }}>
              Institutional-grade portfolio tools. Analyzes top screening picks to optimize portfolio weights, tracks aggregate factor exposures, and visualizes historical backtested performance.
            </p>
          </div>
        </div>

        {quantData.market_regime && (
          <div className="overflow-hidden card" data-liquid style={{ borderRadius: 'var(--radius-xl)' }}>
            <div className="px-4 py-3 text-xs font-medium flex items-center gap-1" style={{ borderBottom: '1px solid var(--glass-border)', color: 'var(--text-2)' }}>
              Market Regime<InfoTooltip id="quant.regime" />
            </div>
            <div className="p-5 flex flex-col items-center text-center gap-2">
              {quantData.market_regime.score >= 70 ? (
                <ShieldCheck size={28} weight="duotone" style={{ color: 'var(--green)' }} />
              ) : quantData.market_regime.score <= 30 ? (
                <Warning size={28} weight="duotone" style={{ color: 'var(--red)' }} />
              ) : (
                <Scales size={28} weight="duotone" style={{ color: 'var(--amber)' }} />
              )}
              <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                {quantData.market_regime.score >= 70 ? 'Risk-On (Bull)' : quantData.market_regime.score <= 30 ? 'Risk-Off (Bear)' : 'Neutral Regime'}
              </div>
              <div className="grid grid-cols-3 gap-3 w-full mt-1">
                <div>
                  <div className="text-[11px] flex items-center justify-center gap-0.5" style={{ color: 'var(--text-3)' }}>Score<InfoTooltip id="quant.regime" /></div>
                  <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>{quantData.market_regime.score}/100</div>
                </div>
                <div>
                  <div className="text-[11px] flex items-center justify-center gap-0.5" style={{ color: 'var(--text-3)' }}>Breadth<InfoTooltip id="quant.breadth" /></div>
                  <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>{quantData.market_regime.breadth.toFixed(1)}%</div>
                </div>
                <div>
                  <div className="text-[11px] flex items-center justify-center gap-0.5" style={{ color: 'var(--text-3)' }}>VIX<InfoTooltip id="quant.vix" /></div>
                  <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>{quantData.market_regime.vix.toFixed(1)}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Stat cards */}
      {backtestStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-5">
          {[
            { icon: <TrendUp size={13} />, label: backtestMode === 'long' ? 'CAGR (Long Picks)' : 'CAGR (Alpha Picks)', tooltipId: 'quant.cagr', value: `${backtestStats.cagr > 0 ? '+' : ''}${backtestStats.cagr.toFixed(2)}%`, color: backtestStats.cagr >= 0 ? 'var(--green)' : 'var(--red)' },
            { icon: <ChartLineDown size={13} />, label: 'Ann. Volatility', tooltipId: 'quant.volatility', value: `${backtestStats.volatility.toFixed(1)}%`, color: backtestStats.volatility <= 20 ? 'var(--green)' : 'var(--amber)' },
            { icon: <Target size={13} />, label: 'Sharpe Ratio', tooltipId: 'quant.sharpe', value: backtestStats.sharpe.toFixed(2), color: backtestStats.sharpe >= 1 ? 'var(--green)' : 'var(--text)' },
            { icon: <Warning size={13} />, label: 'Max Drawdown', tooltipId: 'quant.maxdd', value: `${backtestStats.max_drawdown.toFixed(2)}%`, color: 'var(--red)' },
          ].map(stat => (
            <div key={stat.label} className="overflow-hidden card" data-liquid style={{ borderRadius: 'var(--radius-xl)' }}>
              <div className="px-4 py-3 text-xs font-medium flex items-center gap-1.5" style={{ borderBottom: '1px solid var(--glass-border)', color: 'var(--text-2)' }}>
                {stat.icon}{stat.label}<InfoTooltip id={stat.tooltipId} />
              </div>
              <div className="px-4 py-3 text-xl font-bold" style={{ color: stat.color }}>{stat.value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Left: Backtest + Portfolios */}
        <div className="lg:col-span-2 space-y-5">

          {/* Backtest chart */}
          <div className="overflow-hidden card" data-liquid style={{ borderRadius: 'var(--radius-xl)' }}>
            <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3" style={{ borderBottom: '1px solid var(--glass-border)' }}>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs font-medium flex items-center gap-1" style={{ color: 'var(--text-2)' }}>
                  Strategy Backtest · Top 10 Equal Weight<InfoTooltip id="quant.backtest" />
                </span>
                <SegmentedControl
                  options={[
                    { key: 'short', label: 'Short-term' },
                    { key: 'long',  label: '1m–6m Horizon' },
                  ]}
                  value={backtestMode}
                  onChange={(v) => { setBacktestMode(v as 'short' | 'long'); setStartDate('') }}
                />
              </div>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <SegmentedControl
                  options={[
                    { key: firstDate, label: 'All' },
                    { key: allChartData.length ? new Date(new Date(allChartData[allChartData.length-1].date).getTime() - 30*86400000).toISOString().slice(0,10) : firstDate, label: '1M' },
                    { key: allChartData.length ? new Date(new Date(allChartData[allChartData.length-1].date).getTime() - 14*86400000).toISOString().slice(0,10) : firstDate, label: '2W' },
                  ]}
                  value={effectiveStart}
                  onChange={setStartDate}
                />
                <div className="flex items-center gap-1.5" style={{ color: 'var(--text-3)' }}>
                  <CalendarBlank size={13} />
                  <input
                    type="date"
                    value={effectiveStart}
                    min={firstDate}
                    max={allChartData[allChartData.length - 1]?.date ?? ''}
                    onChange={e => setStartDate(e.target.value)}
                    className="text-[10px] px-2 py-1 rounded-md outline-none"
                    style={{
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-2)',
                      colorScheme: isDark ? 'dark' : 'light',
                      fontFamily: 'Inter, system-ui, sans-serif',
                    }}
                  />
                </div>
              </div>
            </div>
            {backtestMode === 'long' && !quantData?.backtest_long && (
              <div className="px-5 py-2 text-[11px]" style={{ background: 'var(--amber-bg)', borderBottom: '1px solid var(--glass-border)', color: 'var(--amber)' }}>
                Long-term backtest data not yet generated. Re-run the scanner to produce it.
              </div>
            )}
            <div className="p-5" style={{ height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={windowedChart} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="date" stroke="var(--border)" tick={{ fill: 'var(--text-3)', fontSize: 10, fontFamily: 'Inter, system-ui, sans-serif' }} tickMargin={10} minTickGap={30} />
                  <YAxis stroke="var(--border)" tick={{ fill: 'var(--text-3)', fontSize: 10, fontFamily: 'Inter, system-ui, sans-serif' }} domain={['auto', 'auto']} tickFormatter={(v) => typeof v === 'number' ? v.toFixed(1) : v} />
                  <Tooltip contentStyle={tooltipStyle(isDark)} formatter={(v: any) => [typeof v === 'number' ? v.toFixed(2) : v]} />
                  <Legend verticalAlign="top" height={30} align="right" wrapperStyle={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '10px', color: 'var(--text-3)' }} />
                  <ReferenceLine y={100} stroke="var(--border)" strokeDasharray="4 4" />
                  <Line type="monotone" dataKey="portfolio" name={backtestMode === 'long' ? 'Long Horizon Picks' : 'Alpha Picks'} stroke={backtestMode === 'long' ? 'var(--green)' : 'var(--brand)'} strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
                  <Line type="monotone" dataKey="benchmark" name="NIFTY 50" stroke="var(--text-3)" strokeWidth={1.5} dot={false} strokeDasharray="5 5" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Model Portfolios */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {[
              { title: 'Max Sharpe Portfolio', tooltipId: 'quant.max-sharpe', icon: <Target size={13} weight="duotone" style={{ color: 'var(--brand)' }} />, data: max_sharpe, accent: 'var(--brand)' },
              { title: 'Min Volatility Portfolio', tooltipId: 'quant.min-vol', icon: <Scales size={13} weight="duotone" style={{ color: 'var(--amber)' }} />, data: min_volatility, accent: 'var(--amber)' },
            ].map(port => (
              <div key={port.title} className="overflow-hidden card" data-liquid style={{ borderRadius: 'var(--radius-xl)' }}>
                <div className="px-4 py-3 text-xs font-medium flex items-center gap-1.5" style={{ borderBottom: '1px solid var(--glass-border)', color: 'var(--text-2)' }}>
                  {port.icon}{port.title}<InfoTooltip id={port.tooltipId} />
                </div>
                <div className="p-5 space-y-3 max-h-56 overflow-y-auto scrollbar-none">
                  {Object.entries(port.data).map(([ticker, weight]) => (
                    <div key={ticker}>
                      <div className="flex justify-between text-xs mb-1.5" style={{ color: 'var(--text-2)' }}>
                        <span className="font-medium" style={{ color: 'var(--text)' }}>{ticker.replace('.NS', '')}</span>
                        <span>{(Number(weight) * 100).toFixed(1)}%</span>
                      </div>
                      <div className="h-1 rounded-full w-full overflow-hidden" style={{ background: 'var(--border)' }}>
                        <div className="h-full rounded-full" style={{ width: `${Number(weight) * 100}%`, background: port.accent }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-5">

          {/* Factor Exposures */}
          <div className="overflow-hidden card" data-liquid style={{ borderRadius: 'var(--radius-xl)' }}>
            <div className="px-4 py-3 text-xs font-medium flex items-center gap-1.5" style={{ borderBottom: '1px solid var(--glass-border)', color: 'var(--text-2)' }}>
              <Crosshair size={13} weight="duotone" style={{ color: 'var(--green)' }} />Portfolio Factor Exposure<InfoTooltip id="quant.factor.value" />
            </div>
            <div className="p-5" style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={radarData} layout="vertical" margin={{ top: 0, right: 10, left: 20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" horizontal={false} vertical={true} />
                  <XAxis type="number" domain={[0, 100]} stroke="var(--border)" tick={{ fill: 'var(--text-3)', fontSize: 10, fontFamily: 'Inter, system-ui, sans-serif' }} />
                  <YAxis dataKey="subject" type="category" stroke="var(--border)" tick={{ fontSize: 11, fill: 'var(--text-2)', fontFamily: 'Inter, system-ui, sans-serif' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle(isDark)} cursor={{ fill: 'var(--surface-2)' }} />
                  <Bar dataKey="A" name="Exposure" fill="var(--green)" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[11px] text-center px-4 pb-4 leading-relaxed" style={{ color: 'var(--text-3)' }}>
              Percentile rank of top picks against screened universe.
            </p>
          </div>

          {/* Sector Allocation */}
          {quantData.sector_allocation && (
            <div className="overflow-hidden card" data-liquid style={{ borderRadius: 'var(--radius-xl)' }}>
              <div className="px-4 py-3 text-xs font-medium flex items-center gap-1.5" style={{ borderBottom: '1px solid var(--glass-border)', color: 'var(--text-2)' }}>
                <ChartPieSlice size={13} weight="duotone" style={{ color: 'var(--blue)' }} />Sector Allocation<InfoTooltip id="quant.sector" />
              </div>
              <div className="px-5 pt-3" style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={Object.entries(quantData.sector_allocation).map(([name, value]) => ({ name, value }))}
                      cx="50%" cy="50%"
                      innerRadius={55} outerRadius={75}
                      paddingAngle={2} dataKey="value"
                    >
                      {Object.entries(quantData.sector_allocation).map((_entry, index) => {
                        const colors = ['#0D9488', '#2563EB', '#7C3AED', '#DB2777', '#EA580C', '#65A30D', '#0891B2', '#4F46E5', '#C026D3', '#E11D48']
                        return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                      })}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle(isDark)} formatter={(value: any) => `${Number(value).toFixed(1)}%`} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1.5 justify-center px-4 pb-4">
                {Object.entries(quantData.sector_allocation).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, val], i) => {
                  const colors = ['#0D9488', '#2563EB', '#7C3AED', '#DB2777', '#EA580C', '#65A30D', '#0891B2', '#4F46E5', '#C026D3', '#E11D48']
                  return (
                    <div key={name} className="flex items-center gap-1.5 text-[10px]" style={{ color: 'var(--text-2)' }}>
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: colors[i % colors.length] }} />
                      {name} ({val}%)
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Correlation Matrix */}
          {quantData.correlation_matrix && quantData.correlation_matrix.labels.length > 0 && (
            <div className="overflow-hidden card" data-liquid style={{ borderRadius: 'var(--radius-xl)' }}>
              <div className="px-4 py-3 text-xs font-medium flex items-center gap-1.5" style={{ borderBottom: '1px solid var(--glass-border)', color: 'var(--text-2)' }}>
                <GridFour size={13} weight="duotone" style={{ color: 'var(--amber)' }} />Asset Correlation<InfoTooltip id="quant.correlation" />
              </div>
              <div className="p-5 overflow-x-auto scrollbar-none">
                <table className="w-full" style={{ borderSpacing: '2px', borderCollapse: 'separate' }}>
                  <thead>
                    <tr>
                      <th className="p-1 text-[10px] font-medium" style={{ color: 'var(--text-3)', width: 40 }} />
                      {quantData.correlation_matrix.labels.map(l => (
                        <th key={l} className="p-1 text-[9px] font-medium" style={{ color: 'var(--text-3)', height: 28, width: 24, textAlign: 'center' }}>
                          {l.substring(0, 4)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {quantData.correlation_matrix.matrix.map((row, i) => (
                      <tr key={i}>
                        <td className="p-1 text-[10px] font-medium text-right" style={{ color: 'var(--text-3)' }}>
                          {quantData.correlation_matrix!.labels[i].substring(0, 4)}
                        </td>
                        {row.map((val, j) => {
                          let bg = 'transparent'
                          let color = 'var(--text)'
                          if (val === 1) { bg = isDark ? '#1F2937' : '#F3F4F6'; color = 'var(--text-3)' }
                          else if (val > 0.5) { bg = `rgba(16, 185, 129, ${val * 0.8})`; color = '#fff' }
                          else if (val > 0) { bg = `rgba(16, 185, 129, ${val * 0.4})`; color = isDark ? '#fff' : '#000' }
                          else if (val < -0.5) { bg = `rgba(239, 68, 68, ${Math.abs(val) * 0.8})`; color = '#fff' }
                          else if (val < 0) { bg = `rgba(239, 68, 68, ${Math.abs(val) * 0.4})`; color = isDark ? '#fff' : '#000' }
                          return (
                            <td key={j} className="p-1 text-[9px] text-center rounded-sm transition-colors" style={{ backgroundColor: bg, color }}>
                              {val.toFixed(2)}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
