import React, { useMemo } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Target, Warning, ChartLineUp } from '@phosphor-icons/react'
import { InfoTooltip } from '../common/shared'

interface MonteCarloChartProps {
  cagr: number
  volatility: number
  isDark: boolean
}

function seededRandom(initial: number) {
  let seed = initial
  return () => { seed = (1664525 * seed + 1013904223) >>> 0; return (seed+1)/4294967297 }
}

export const MonteCarloChart: React.FC<MonteCarloChartProps> = ({ cagr, volatility, isDark }) => {
  const simulationData = useMemo(() => {
    // Fixed seed keeps render calculations pure and scenario comparisons repeatable.
    const random = seededRandom(42)
    const days = 252
    const numSimulations = 500
    const dt = 1 / 252
    const mu = cagr / 100
    const sigma = volatility / 100
    const initialValue = 100

    const paths: number[][] = []
    for (let sim = 0; sim < numSimulations; sim++) {
      const path = [initialValue]
      let current = initialValue
      for (let day = 1; day <= days; day++) {
        // Box-Muller transform for Gaussian random numbers
        const u1 = random() || 1e-10
        const u2 = random() || 1e-10
        const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2)
        const shock = sigma * Math.sqrt(dt) * z
        const drift = (mu - 0.5 * sigma * sigma) * dt
        current = current * Math.exp(drift + shock)
        path.push(current)
      }
      paths.push(path)
    }

    const chartPoints = []
    for (let day = 0; day <= days; day += 5) {
      const dayValues = paths.map(p => p[day]).sort((a, b) => a - b)
      const p5 = dayValues[Math.floor(numSimulations * 0.05)]
      const p50 = dayValues[Math.floor(numSimulations * 0.50)]
      const p95 = dayValues[Math.floor(numSimulations * 0.95)]
      chartPoints.push({
        day: `T+${day}d`,
        p5: Number(p5.toFixed(1)),
        p50: Number(p50.toFixed(1)),
        p95: Number(p95.toFixed(1)),
      })
    }
    return chartPoints
  }, [cagr, volatility])

  const finalP5 = simulationData[simulationData.length - 1]?.p5 || 100
  const finalP50 = simulationData[simulationData.length - 1]?.p50 || 100
  const finalP95 = simulationData[simulationData.length - 1]?.p95 || 100

  const crisisScenarios = [
    { name: '2008 Financial Crisis', shock: -34.5, recovery: '18 Months', impact: 'Severe Credit Freeze' },
    { name: '2020 Covid Liquidity Shock', shock: -26.2, recovery: '5 Months', impact: 'Rapid V-Shape Recovery' },
    { name: '2022 Inflation Rate Hikes', shock: -18.4, recovery: '12 Months', impact: 'Valuation Multiple Compression' },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="card p-3">
          <div className="flex items-center gap-1.5 text-xs text-[var(--text-3)] mb-1">
            <Warning size={14} className="text-[var(--red)]" /> 5th Percentile (Bear Case)
            <InfoTooltip id="mc.p5" />
          </div>
          <div className="text-base font-bold font-mono text-[var(--red)]">
            {finalP5 >= 100 ? '+' : ''}{(finalP5 - 100).toFixed(1)}% <span className="text-[11px] text-[var(--text-3)]">({finalP5.toFixed(1)})</span>
          </div>
        </div>

        <div className="card p-3">
          <div className="flex items-center gap-1.5 text-xs text-[var(--text-3)] mb-1">
            <Target size={14} className="text-[var(--brand)]" /> 50th Percentile (Expected)
            <InfoTooltip id="mc.p50" />
          </div>
          <div className="text-base font-bold font-mono text-[var(--brand)]">
            +{ (finalP50 - 100).toFixed(1) }% <span className="text-[11px] text-[var(--text-3)]">({finalP50.toFixed(1)})</span>
          </div>
        </div>

        <div className="card p-3">
          <div className="flex items-center gap-1.5 text-xs text-[var(--text-3)] mb-1">
            <ChartLineUp size={14} className="text-[var(--green)]" /> 95th Percentile (Bull Case)
            <InfoTooltip id="mc.p95" />
          </div>
          <div className="text-base font-bold font-mono text-[var(--green)]">
            +{ (finalP95 - 100).toFixed(1) }% <span className="text-[11px] text-[var(--text-3)]">({finalP95.toFixed(1)})</span>
          </div>
        </div>
      </div>

      {/* Fan Chart */}
      <div style={{ width: '100%', height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={simulationData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="p95Grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--green)" stopOpacity={0.25} />
                <stop offset="95%" stopColor="var(--green)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="p50Grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--brand)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--brand)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" />
            <XAxis dataKey="day" stroke="var(--border)" tick={{ fill: 'var(--text-3)', fontSize: 10 }} />
            <YAxis stroke="var(--border)" tick={{ fill: 'var(--text-3)', fontSize: 10 }} domain={['auto', 'auto']} />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                const d = payload[0].payload
                return (
                  <div
                    style={{
                      background: isDark ? '#09090b' : '#ffffff',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      padding: '8px 12px',
                      fontSize: '11px',
                    }}
                  >
                    <p className="font-semibold mb-1" style={{ color: 'var(--text)' }}>{label}</p>
                    <p style={{ color: 'var(--green)' }}>95th %ile: <strong>{d.p95}</strong></p>
                    <p style={{ color: 'var(--brand)' }}>50th %ile: <strong>{d.p50}</strong></p>
                    <p style={{ color: 'var(--red)' }}>5th %ile: <strong>{d.p5}</strong></p>
                  </div>
                )
              }}
            />
            <Area type="monotone" dataKey="p95" stroke="var(--green)" fill="url(#p95Grad)" strokeWidth={2} name="95th %ile" />
            <Area type="monotone" dataKey="p50" stroke="var(--brand)" fill="url(#p50Grad)" strokeWidth={2} name="50th %ile (Median)" />
            <Area type="monotone" dataKey="p5" stroke="var(--red)" fill="none" strokeWidth={1.5} strokeDasharray="3 3" name="5th %ile" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Historical Crisis Stress Testing Matrix */}
      <div className="pt-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider mb-2 text-[var(--brand)]">
          Historical Macro Crisis Stress Tests
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          {crisisScenarios.map(sc => (
            <div key={sc.name} className="p-3 card">
              <div className="font-semibold text-[var(--text)] mb-1">{sc.name}</div>
              <div className="flex justify-between items-center text-[11px] mb-1">
                <span className="text-[var(--text-3)]">Drawdown Shock:</span>
                <span className="font-mono font-bold text-[var(--red)]">{sc.shock}%</span>
              </div>
              <div className="flex justify-between items-center text-[11px] mb-1">
                <span className="text-[var(--text-3)]">Est. Recovery:</span>
                <span className="font-mono font-medium text-[var(--text-2)]">{sc.recovery}</span>
              </div>
              <div className="text-[10px] text-[var(--text-3)] italic mt-1 pt-1" style={{ borderTop: '1px solid var(--border)' }}>
                {sc.impact}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
