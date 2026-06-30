import { useEffect, useState, useMemo } from 'react'
import type { QuantData } from '../types'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts'
import { Flask, ChartLineUp, Target, Scales } from '@phosphor-icons/react'

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

  if (loading) {
    return <div className="p-8 text-center" style={{ color: 'var(--text-3)' }}>Loading Quant Lab...</div>
  }

  if (!quantData || !quantData.backtest || quantData.backtest.length === 0) {
    return (
      <div className="p-8 text-center card" style={{ borderRadius: 'var(--radius-xl)' }}>
        <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text)' }}>Quant Lab Initialization</h3>
        <p style={{ color: 'var(--text-2)' }}>Insufficient history to run portfolio optimizations or backtests. Run the scanner for a few more days to collect data.</p>
      </div>
    )
  }

  const { max_sharpe, min_volatility } = quantData.model_portfolios

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="p-6 sm:p-8 card" style={{ borderRadius: 'var(--radius-xl)' }}>
        <div className="flex items-start gap-4 mb-2">
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
                <LineChart data={quantData.backtest} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="date" stroke="var(--text-3)" tick={{ fontSize: 10 }} tickMargin={10} />
                  <YAxis stroke="var(--text-3)" tick={{ fontSize: 10 }} domain={['auto', 'auto']} tickFormatter={(v) => v.toFixed(1)} />
                  <RechartsTooltip contentStyle={tooltipStyle(isDark)} />
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

        {/* Right Column: Factor Exposures */}
        <div className="card p-5" style={{ borderRadius: 'var(--radius-xl)' }}>
          <div className="flex items-center gap-2 mb-6">
            <Radar size={18} weight="duotone" style={{ color: 'var(--green)' }} />
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Portfolio Factor Exposure</h3>
          </div>
          <div style={{ height: 260, width: '100%', display: 'flex', justifyContent: 'center' }}>
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                <PolarGrid stroke="var(--border)" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: 'var(--text-2)', fontSize: 11 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                <RechartsTooltip contentStyle={tooltipStyle(isDark)} />
                <Radar name="Portfolio" dataKey="A" stroke="var(--green)" fill="var(--green)" fillOpacity={0.4} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[11px] text-center mt-4 leading-relaxed" style={{ color: 'var(--text-3)' }}>
            Shows the aggregate exposure of the top picks to academic factors (percentile rank against the screened universe).
          </p>
        </div>
      </div>
    </div>
  )
}
