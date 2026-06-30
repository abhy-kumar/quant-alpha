import { useEffect, useState, useMemo } from 'react'
import type { QuantData } from '../types'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, BarChart, Bar, PieChart, Pie, Cell } from 'recharts'
import { Flask, ChartLineUp, Target, Scales, Crosshair, TrendUp, ChartLineDown, ShieldCheck, Warning, ChartPieSlice, GridFour } from '@phosphor-icons/react'

interface Props {
  isDark: boolean
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

export default function QuantLabTab({ isDark }: Props) {
  const [quantData, setQuantData] = useState<QuantData | null>(null)
  const [loading, setLoading] = useState(true)

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
  }, [])

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

  const backtestStats = quantData?.backtest?.stats

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
      {/* Header & Regime */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="p-6 sm:p-8 card lg:col-span-2 flex flex-col justify-center" style={{ borderRadius: 'var(--radius-xl)' }}>
          <div className="flex items-start gap-4">
            <div className="p-3" style={{ background: 'var(--brand-soft)', borderRadius: 'var(--radius)' }}>
              <Flask size={20} weight="duotone" style={{ color: 'var(--brand)' }} />
            </div>
            <div>
              <h2 className="text-base font-semibold mb-1" style={{ color: 'var(--text)' }}>Quant Lab</h2>
              <p className="text-sm leading-relaxed max-w-2xl" style={{ color: 'var(--text-2)' }}>
                Institutional-grade portfolio tools. Analyzes top screening picks to optimize portfolio weights, tracks aggregate factor exposures, and visualizes historical backtested performance.
              </p>
              <p className="text-[11px] mt-2" style={{ color: 'var(--text-3)' }}>Last calculated: {quantData.last_updated}</p>
            </div>
          </div>
        </div>
        
        {quantData.market_regime && (
          <div className="p-6 sm:p-8 card flex flex-col justify-center items-center text-center" style={{ borderRadius: 'var(--radius-xl)' }}>
            <div className="mb-2">
              {quantData.market_regime.score >= 70 ? (
                <ShieldCheck size={32} weight="duotone" style={{ color: 'var(--green)' }} />
              ) : quantData.market_regime.score <= 30 ? (
                <Warning size={32} weight="duotone" style={{ color: 'var(--red)' }} />
              ) : (
                <Scales size={32} weight="duotone" style={{ color: 'var(--amber)' }} />
              )}
            </div>
            <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>
              {quantData.market_regime.score >= 70 ? 'Risk-On (Bull)' : quantData.market_regime.score <= 30 ? 'Risk-Off (Bear)' : 'Neutral Regime'}
            </h3>
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>
              Regime Score: <span style={{ color: 'var(--text)' }}>{quantData.market_regime.score}/100</span>
            </p>
            <p className="text-[11px] mt-1" style={{ color: 'var(--text-3)' }}>
              Breadth: {quantData.market_regime.breadth.toFixed(1)}% • VIX: {quantData.market_regime.vix.toFixed(1)}
            </p>
          </div>
        )}
      </div>

      {backtestStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-5">
          <div className="card p-4 flex flex-col justify-center" style={{ borderRadius: 'var(--radius-xl)' }}>
            <div className="text-[11px] mb-1 flex items-center gap-1" style={{ color: 'var(--text-3)' }}><TrendUp size={14} /> CAGR (Alpha Picks)</div>
            <div className="text-xl font-bold" style={{ color: backtestStats.cagr >= 0 ? 'var(--green)' : 'var(--red)' }}>
              {backtestStats.cagr > 0 ? '+' : ''}{backtestStats.cagr.toFixed(2)}%
            </div>
          </div>
          <div className="card p-4 flex flex-col justify-center" style={{ borderRadius: 'var(--radius-xl)' }}>
            <div className="text-[11px] mb-1 flex items-center gap-1" style={{ color: 'var(--text-3)' }}><ChartLineDown size={14} /> Ann. Volatility</div>
            <div className="text-xl font-bold" style={{ color: backtestStats.volatility <= 20 ? 'var(--green)' : 'var(--amber)' }}>
              {backtestStats.volatility.toFixed(1)}%
            </div>
          </div>
          <div className="card p-4 flex flex-col justify-center" style={{ borderRadius: 'var(--radius-xl)' }}>
            <div className="text-[11px] mb-1 flex items-center gap-1" style={{ color: 'var(--text-3)' }}><Target size={14} /> Sharpe Ratio</div>
            <div className="text-xl font-bold" style={{ color: backtestStats.sharpe >= 1 ? 'var(--green)' : 'var(--text)' }}>
              {backtestStats.sharpe.toFixed(2)}
            </div>
          </div>
          <div className="card p-4 flex flex-col justify-center" style={{ borderRadius: 'var(--radius-xl)' }}>
            <div className="text-[11px] mb-1 flex items-center gap-1" style={{ color: 'var(--text-3)' }}><Warning size={14} /> Max Drawdown</div>
            <div className="text-xl font-bold" style={{ color: 'var(--red)' }}>
              {backtestStats.max_drawdown.toFixed(2)}%
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        
        {/* Left Column: Backtest */}
        <div className="lg:col-span-2 space-y-5">
          <div className="card p-5" style={{ borderRadius: 'var(--radius-xl)' }}>
            <div className="flex items-center gap-2 mb-4">
              <ChartLineUp size={18} weight="duotone" style={{ color: 'var(--brand)' }} />
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Strategy Backtest (Top 10 Equal Weight)</h3>
            </div>
            <div style={{ height: 300, width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={quantData.backtest.chart} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="date" stroke="var(--text-3)" tick={{ fontSize: 10 }} tickMargin={10} />
                  <YAxis stroke="var(--text-3)" tick={{ fontSize: 10 }} domain={['auto', 'auto']} tickFormatter={(v) => typeof v === 'number' ? v.toFixed(1) : v} />
                  <Tooltip contentStyle={tooltipStyle(isDark)} />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                  <Line type="monotone" dataKey="portfolio" name="Alpha Picks" stroke="var(--brand)" strokeWidth={2} dot={false} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="benchmark" name="NIFTY 50" stroke="var(--text-3)" strokeWidth={2} dot={false} strokeDasharray="5 5" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Model Portfolios */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="card p-5" style={{ borderRadius: 'var(--radius-xl)' }}>
              <div className="flex items-center gap-2 mb-4">
                <Target size={18} weight="duotone" style={{ color: 'var(--brand)' }} />
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Max Sharpe Portfolio</h3>
              </div>
              <div className="space-y-3 max-h-60 overflow-y-auto scrollbar-none">
                {Object.entries(max_sharpe).map(([ticker, weight]) => (
                  <div key={ticker}>
                    <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--text-2)' }}>
                      <span className="font-medium">{ticker.replace('.NS', '')}</span>
                      <span>{(Number(weight) * 100).toFixed(1)}%</span>
                    </div>
                    <div className="h-1.5 rounded-full w-full overflow-hidden" style={{ background: 'var(--border)' }}>
                      <div className="h-full" style={{ width: `${Number(weight) * 100}%`, background: 'var(--brand)' }}></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card p-5" style={{ borderRadius: 'var(--radius-xl)' }}>
              <div className="flex items-center gap-2 mb-4">
                <Scales size={18} weight="duotone" style={{ color: 'var(--amber)' }} />
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Minimum Volatility Portfolio</h3>
              </div>
              <div className="space-y-3 max-h-60 overflow-y-auto scrollbar-none">
                {Object.entries(min_volatility).map(([ticker, weight]) => (
                  <div key={ticker}>
                    <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--text-2)' }}>
                      <span className="font-medium">{ticker.replace('.NS', '')}</span>
                      <span>{(Number(weight) * 100).toFixed(1)}%</span>
                    </div>
                    <div className="h-1.5 rounded-full w-full overflow-hidden" style={{ background: 'var(--border)' }}>
                      <div className="h-full" style={{ width: `${Number(weight) * 100}%`, background: 'var(--amber)' }}></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-5">
          {/* Factor Exposures */}
          <div className="card p-5" style={{ borderRadius: 'var(--radius-xl)' }}>
            <div className="flex items-center gap-2 mb-6">
              <Crosshair size={18} weight="duotone" style={{ color: 'var(--green)' }} />
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Portfolio Factor Exposure</h3>
            </div>
            <div style={{ height: 260, width: '100%', display: 'flex', justifyContent: 'center' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={radarData} layout="vertical" margin={{ top: 0, right: 10, left: 20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={true} vertical={false} />
                  <XAxis type="number" domain={[0, 100]} stroke="var(--text-3)" tick={{ fontSize: 10 }} />
                  <YAxis dataKey="subject" type="category" stroke="var(--text-3)" tick={{ fontSize: 11, fill: 'var(--text-2)' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle(isDark)} cursor={{ fill: 'var(--border)' }} />
                  <Bar dataKey="A" name="Portfolio Exposure" fill="var(--green)" radius={[0, 4, 4, 0]} barSize={24} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[11px] text-center mt-4 leading-relaxed" style={{ color: 'var(--text-3)' }}>
              Shows the aggregate exposure of the top picks to academic factors (percentile rank against the screened universe).
            </p>
          </div>

          {/* Sector Allocation */}
          {quantData.sector_allocation && (
            <div className="card p-5" style={{ borderRadius: 'var(--radius-xl)' }}>
              <div className="flex items-center gap-2 mb-4">
                <ChartPieSlice size={18} weight="duotone" style={{ color: 'var(--blue)' }} />
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Sector Allocation</h3>
              </div>
              <div style={{ height: 220, width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={Object.entries(quantData.sector_allocation).map(([name, value]) => ({ name, value }))}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
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
              <div className="flex flex-wrap gap-2 justify-center mt-2">
                {Object.entries(quantData.sector_allocation).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, val], i) => {
                  const colors = ['#0D9488', '#2563EB', '#7C3AED', '#DB2777', '#EA580C', '#65A30D', '#0891B2', '#4F46E5', '#C026D3', '#E11D48']
                  return (
                    <div key={name} className="flex items-center gap-1.5 text-[10px]" style={{ color: 'var(--text-2)' }}>
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: colors[i % colors.length] }}></div>
                      {name} ({val}%)
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Correlation Matrix */}
          {quantData.correlation_matrix && quantData.correlation_matrix.labels.length > 0 && (
            <div className="card p-5" style={{ borderRadius: 'var(--radius-xl)' }}>
              <div className="flex items-center gap-2 mb-4">
                <GridFour size={18} weight="duotone" style={{ color: 'var(--amber)' }} />
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Asset Correlation</h3>
              </div>
              <div className="overflow-x-auto scrollbar-none">
                <table className="w-full" style={{ borderSpacing: '2px', borderCollapse: 'separate' }}>
                  <thead>
                    <tr>
                      <th className="p-1 text-[10px] font-medium" style={{ color: 'var(--text-3)', width: 40 }}></th>
                      {quantData.correlation_matrix.labels.map(l => (
                        <th key={l} className="p-1 text-[9px] font-medium" style={{ color: 'var(--text-3)', height: 30, width: 24, textAlign: 'center' }}>
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
                          if (val === 1) {
                            bg = isDark ? '#1F2937' : '#F3F4F6'
                            color = 'var(--text-3)'
                          } else if (val > 0.5) {
                            bg = `rgba(16, 185, 129, ${val * 0.8})`
                            color = '#fff'
                          } else if (val > 0) {
                            bg = `rgba(16, 185, 129, ${val * 0.4})`
                            color = isDark ? '#fff' : '#000'
                          } else if (val < -0.5) {
                            bg = `rgba(239, 68, 68, ${Math.abs(val) * 0.8})`
                            color = '#fff'
                          } else if (val < 0) {
                            bg = `rgba(239, 68, 68, ${Math.abs(val) * 0.4})`
                            color = isDark ? '#fff' : '#000'
                          }
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
