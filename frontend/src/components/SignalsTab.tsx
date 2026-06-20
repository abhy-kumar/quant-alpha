import { useMemo } from 'react'
import type { DashboardData } from '../types'

interface Props {
  topPicks: DashboardData[]
  horizon: 'short'|'long'
  setHorizon: (h: 'short'|'long') => void
  onSelect: (t: string) => void
}

function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider" style={{color:'var(--text-3)'}}>{label}</span>
      <span className="text-[13px] font-mono font-medium" style={{color: color||'var(--text)'}}>{value}</span>
    </div>
  )
}

function ScoreDot({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  const color = pct >= 70 ? 'var(--green)' : pct >= 40 ? 'var(--brand)' : 'var(--red)'
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] w-14 shrink-0" style={{color:'var(--text-3)'}}>{label}</span>
      <div className="flex-1 h-1 rounded-full overflow-hidden" style={{background:'var(--border)'}}>
        <div className="h-full rounded-full" style={{width:`${pct}%`,background:color}} />
      </div>
      <span className="text-[11px] font-mono w-8 text-right" style={{color:'var(--text)'}}>{value.toFixed(1)}</span>
    </div>
  )
}

function SignalBadge({ label, bullish }: { label: string; bullish: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium"
      style={{background: bullish?'var(--green-bg)':'var(--red-bg)', color: bullish?'var(--green)':'var(--red)'}}>
      {bullish?'↑':'↓'} {label}
    </span>
  )
}

export default function SignalsTab({ topPicks, horizon, setHorizon, onSelect }: Props) {
  const avgScore = useMemo(() => {
    if (!topPicks.length) return 0
    const scoreKey = horizon === 'long' ? 'Composite_Score_Fund' : horizon === 'short' ? 'Composite_Score_Tech' : 'Composite_Score'
    return topPicks.reduce((sum, p) => sum + (Number(p[scoreKey as keyof DashboardData]) || Number(p.Composite_Score) || 0), 0) / topPicks.length
  }, [topPicks, horizon])

  const sectorBreakdown = useMemo(() => {
    const counts: Record<string, number> = {}
    topPicks.forEach(p => { const s = p.Sector || 'Unknown'; counts[s] = (counts[s] || 0) + 1 })
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [topPicks])

  const bullishCount = useMemo(() => {
    const threshold = horizon === 'long' ? 7.5 : 7
    return topPicks.filter(p => {
      const score = horizon === 'long' 
        ? Number(p.Composite_Score_Fund) || Number(p.Composite_Score) || 0
        : Number(p.Composite_Score) || 0
      return score >= threshold
    }).length
  }, [topPicks, horizon])

  const avgMomentum = useMemo(() => {
    const vals = topPicks.map(p => (Number(p.Momentum_12M) || 0) * 100).filter(v => v !== 0)
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
  }, [topPicks])

  const avgVol = useMemo(() => {
    const vals = topPicks.map(p => Number(p.Vol_60D) || 0).filter(v => v !== 0)
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
  }, [topPicks])

  return (
    <div className="space-y-4">
      {/* Controls + Summary row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="inline-flex p-0.5" style={{background:'var(--border)'}}>
          {(['short','long'] as const).map(h => (
            <button key={h} onClick={()=>setHorizon(h)}
              className="w-[110px] py-1.5 text-[13px] font-medium transition-all text-center"
              style={{background:horizon===h?'var(--surface)':'transparent',color:horizon===h?'var(--text)':'var(--text-3)',boxShadow:horizon===h?'0 1px 3px rgba(0,0,0,0.08)':'none'}}>
              {h==='short'?'Short Term':'Long Term'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4 text-[12px]" style={{color:'var(--text-3)'}}>
          <span>Avg Score <span className="font-mono font-medium" style={{color: avgScore >= 7 ? 'var(--green)' : 'var(--text)'}}>{avgScore.toFixed(1)}</span></span>
          <span className="w-px h-3" style={{background:'var(--border)'}}/>
          <span>Bullish <span className="font-mono font-medium" style={{color:'var(--green)'}}>{bullishCount}/{topPicks.length}</span></span>
          <span className="w-px h-3 hidden sm:block" style={{background:'var(--border)'}}/>
          <span className="hidden sm:inline">Avg Mom <span className="font-mono font-medium" style={{color: avgMomentum >= 0 ? 'var(--green)' : 'var(--red)'}}>{avgMomentum >= 0 ? '+' : ''}{avgMomentum.toFixed(1)}%</span></span>
          <span className="hidden sm:inline">Avg Vol <span className="font-mono font-medium" style={{color:'var(--text)'}}>{avgVol.toFixed(1)}%</span></span>
        </div>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {topPicks.map((s, i) => {
          const change = Number(s['1d_Chg_%'])||0
          const price = Number(s.Price)||0
          const composite = horizon === 'long' 
            ? Number(s.Composite_Score_Fund) || Number(s.Composite_Score) || 0
            : horizon === 'short'
            ? Number(s.Composite_Score_Tech) || Number(s.Composite_Score) || 0
            : Number(s.Composite_Score) || 0
          const techScore = Number(s.Tech_Score)||0
          const fundScore = Number(s.Fund_Score)||0
          const researchScore = Number(s.Research_Score)||0
          const rsi = Number(s.RSI_Value)||0
          const pe = s['P/E'] ? Number(s['P/E']) : null
          const mcap = s['Market_Cap_B'] ? Number(s['Market_Cap_B']) : null
          const roe = s['ROE_%'] ? Number(s['ROE_%']) : null
          const high52 = s['52W_High'] ? Number(s['52W_High']) : null
          const stSignal = s.ST_Signal || ''
          const macdVal = Number(s.MACD_Value)||0
          const momentum = Number(s.Momentum_12M)||0
          const vol = Number(s.Vol_60D)||0
          const piotroski = Number(s.Piotroski_F)||0
          const debtEq = s['Debt_to_Equity'] ? Number(s['Debt_to_Equity']) : null
          const sharpe = s['Sharpe'] ? Number(s['Sharpe']) : null
          const maxDD = s['Max_Drawdown_%'] ? Number(s['Max_Drawdown_%']) : null
          const bullCount = s['Bull_Count'] ?? null
          const bearCount = s['Bear_Count'] ?? null

          const priceVsHigh = high52 ? ((price / high52) * 100) : null

          return (
            <div key={s.Ticker} onClick={()=>onSelect(s.Ticker)}
              className="p-3.5 cursor-pointer transition-colors"
              style={{background:'var(--surface)',border:'1px solid var(--border)'}}>
              {/* Header */}
              <div className="flex items-start justify-between mb-1.5">
                <div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-base font-bold" style={{color:'var(--text)'}}>{s.Ticker.replace('.NS','')}</span>
                    <span className="text-[10px] font-medium" style={{color:'var(--text-3)'}}>#{i+1}</span>
                  </div>
                  <span className="text-[10px]" style={{color:'var(--text-3)'}}>{s.Sector||'Equities'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-lg font-mono font-bold" style={{color:composite>=7?'var(--green)':composite>=4?'var(--brand)':'var(--red)'}}>
                    {composite.toFixed(1)}
                  </span>
                  <span className="px-1.5 py-0.5 text-[9px] font-medium"
                    style={s.Conviction==='Strong Buy'?{background:'var(--green-bg)',color:'var(--green)'}:s.Conviction==='Buy'?{background:'rgba(30,96,145,0.08)',color:'var(--blue)'}:{background:'var(--bg)',color:'var(--text-2)'}}>
                    {s.Conviction||'\u2014'}
                  </span>
                </div>
              </div>

              {/* Price + change */}
              <div className="flex items-baseline gap-2 mb-2.5">
                <span className="text-sm font-mono font-medium" style={{color:'var(--text)'}}>
                  {'\u20B9'}{price.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}
                </span>
                <span className="text-[11px] font-mono font-medium" style={{color:change>=0?'var(--green)':'var(--red)'}}>
                  {change>0?'+':''}{change.toFixed(2)}%
                </span>
              </div>

              {/* Sub-scores row */}
              <div className="grid grid-cols-3 gap-2 mb-2.5 py-2" style={{borderTop:'1px solid var(--border)',borderBottom:'1px solid var(--border)'}}>
                <div className="text-center">
                  <span className="text-[9px] uppercase tracking-wider block" style={{color:'var(--text-3)'}}>Tech</span>
                  <span className="text-[13px] font-mono font-medium" style={{color: techScore >= 0.5 ? 'var(--green)' : techScore < 0 ? 'var(--red)' : 'var(--text)'}}>{techScore.toFixed(1)}</span>
                </div>
                <div className="text-center">
                  <span className="text-[9px] uppercase tracking-wider block" style={{color:'var(--text-3)'}}>Fund</span>
                  <span className="text-[13px] font-mono font-medium" style={{color: fundScore >= 5 ? 'var(--green)' : 'var(--text)'}}>{fundScore.toFixed(1)}</span>
                </div>
                <div className="text-center">
                  <span className="text-[9px] uppercase tracking-wider block" style={{color:'var(--text-3)'}}>Research</span>
                  <span className="text-[13px] font-mono font-medium" style={{color: researchScore >= 7 ? 'var(--green)' : researchScore < 4 ? 'var(--red)' : 'var(--text)'}}>{researchScore.toFixed(1)}</span>
                </div>
              </div>

              {/* Key metrics grid */}
              <div className="grid grid-cols-3 gap-x-2 gap-y-1.5 mb-2.5">
                <Metric label="P/E" value={pe!==null?pe.toFixed(1):'\u2014'} />
                <Metric label="Mkt Cap" value={mcap!==null?`\u20B9${mcap.toFixed(0)}Cr`:'\u2014'} />
                <Metric label="ROE" value={roe!==null?`${roe.toFixed(1)}%`:'\u2014'} />
                <Metric label="D/E" value={debtEq!==null?debtEq.toFixed(2):'\u2014'} />
                <Metric label="Sharpe" value={sharpe!==null?sharpe.toFixed(2):'\u2014'} color={sharpe!==null?(sharpe>1?'var(--green)':sharpe<0?'var(--red)':'var(--text)'):'var(--text)'} />
                <Metric label="Beta" value={s.Beta!=null?Number(s.Beta).toFixed(2):'\u2014'} color={s.Beta!=null?(Number(s.Beta)<0.8?'var(--green)':Number(s.Beta)>1.2?'var(--red)':'var(--text)'):'var(--text)'} />
              </div>

              {/* Bull/Bear + 52W range */}
              <div className="flex items-center gap-3 mb-2.5 text-[11px]">
                {bullCount !== null && (
                  <div className="flex items-center gap-1">
                    <span style={{color:'var(--text-3)'}}>Bull</span>
                    <span className="font-mono font-medium" style={{color:'var(--green)'}}>{bullCount}</span>
                    <span style={{color:'var(--text-3)'}}>/</span>
                    <span className="font-mono font-medium" style={{color:'var(--red)'}}>{bearCount ?? '-'}</span>
                  </div>
                )}
                {priceVsHigh !== null && (
                  <div className="flex-1">
                    <div className="flex justify-between mb-0.5" style={{color:'var(--text-3)'}}>
                      <span>52W Range</span>
                      <span className="font-mono" style={{color: priceVsHigh > 90 ? 'var(--green)' : 'var(--text)'}}>{priceVsHigh.toFixed(0)}%</span>
                    </div>
                    <div className="relative h-1.5 rounded-full" style={{background:'var(--border)'}}>
                      <div className="absolute h-1.5 rounded-full" style={{left:0,width:`${priceVsHigh}%`,background: priceVsHigh > 90 ? 'var(--green)' : priceVsHigh > 50 ? 'var(--brand)' : 'var(--amber)'}} />
                      <div className="absolute w-1.5 h-1.5 rounded-full border-2 border-white" style={{left:`${priceVsHigh}%`,top:'-1px',transform:'translateX(-50%)',background:'var(--text)'}} />
                    </div>
                  </div>
                )}
              </div>

              {/* Signals */}
              <div className="flex flex-wrap gap-1 mb-2.5">
                {rsi > 0 && <SignalBadge label={`RSI ${rsi.toFixed(0)}`} bullish={rsi < 70} />}
                {stSignal && <SignalBadge label={stSignal} bullish={stSignal==='Buy'||stSignal==='Long'} />}
                {macdVal > 0 && <SignalBadge label="MACD +" bullish={true} />}
                {macdVal < 0 && <SignalBadge label="MACD \u2212" bullish={false} />}
                {momentum > 0.1 && <SignalBadge label="Mom +" bullish={true} />}
                {momentum < -0.1 && <SignalBadge label="Mom \u2212" bullish={false} />}
              </div>

              {/* Compact scores */}
              <div className="space-y-1.5" style={{borderTop:'1px solid var(--border)',paddingTop:'8px'}}>
                <ScoreDot label="Piotroski" value={piotroski} max={9} />
                <ScoreDot label="12M Mom" value={Math.abs(momentum)*100} max={200} />
                <ScoreDot label="Value" value={Number(s.Value_Score)||0} max={10} />
                <ScoreDot label="Vol 60D" value={vol} max={60} />
              </div>
            </div>
          )
        })}
      </div>

      {/* Sector breakdown */}
      {sectorBreakdown.length > 0 && (
        <div className="p-4" style={{background:'var(--surface)',border:'1px solid var(--border)'}}>
          <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{color:'var(--text-2)'}}>Sector Breakdown</h3>
          <div className="flex flex-wrap gap-3">
            {sectorBreakdown.map(([sector, count]) => (
              <div key={sector} className="flex items-center gap-2 text-[12px]">
                <span className="w-2 h-2 rounded-full" style={{background:'var(--brand)'}} />
                <span style={{color:'var(--text-2)'}}>{sector}</span>
                <span className="font-mono font-medium" style={{color:'var(--text)'}}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
