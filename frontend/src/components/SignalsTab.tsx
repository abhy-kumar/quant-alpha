import { useMemo } from 'react'
import type { DashboardData } from '../types'
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer, Tooltip } from 'recharts'
import { scoreBar } from './shared'

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

function SignalBadge({ label, bullish }: { label: string; bullish: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium"
      style={{background: bullish?'var(--green-bg)':'var(--red-bg)', color: bullish?'var(--green)':'var(--red)'}}>
      {bullish?'\u2191':'\u2193'} {label}
    </span>
  )
}

function ScoreRadar({ s }: { s: DashboardData }) {
  const techRaw = Number(s.Tech_Score) || 0
  const fundRaw = Number(s.Fund_Score) || 0
  const researchRaw = Number(s.Research_Score) || 0
  const piotroski = Number(s.Piotroski_F) || 0
  const momentum = (Number(s.Momentum_12M) || 0) * 100
  const value = Number(s.Value_Score) || 0
  const vol = Number(s.Vol_60D) || 0

  const data = [
    { axis: 'Tech', value: Math.max(0, Math.min(10, (techRaw + 1) * 5)), raw: techRaw.toFixed(1) },
    { axis: 'Fund', value: Math.max(0, Math.min(10, fundRaw)), raw: fundRaw.toFixed(1) },
    { axis: 'Research', value: Math.max(0, Math.min(10, researchRaw)), raw: researchRaw.toFixed(1) },
    { axis: 'Quality', value: Math.max(0, Math.min(10, (piotroski / 9) * 10)), raw: `${piotroski}/9` },
    { axis: 'Mom', value: Math.max(0, Math.min(10, ((momentum + 100) / 200) * 10)), raw: `${momentum >= 0 ? '+' : ''}${momentum.toFixed(1)}%` },
    { axis: 'Value', value: Math.max(0, Math.min(10, value)), raw: value.toFixed(1) },
    { axis: 'Low Vol', value: Math.max(0, Math.min(10, ((60 - vol) / 60) * 10)), raw: `${vol.toFixed(1)}%` },
  ]

  const renderTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null
    const d = payload[0].payload
    return (
      <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--radius)',padding:'4px 8px',fontSize:11}}>
        <span style={{color:'var(--text-2)'}}>{d.axis}: </span>
        <span style={{color:'var(--text)',fontWeight:600}}>{d.raw}</span>
      </div>
    )
  }

  return (
    <div style={{width:'100%',height:200}}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} cx="50%" cy="50%" outerRadius="70%">
          <PolarGrid stroke="var(--border)" />
          <PolarAngleAxis
            dataKey="axis"
            tick={{fontSize:9, fill:'var(--text-3)'}}
            tickLine={false}
          />
          <Tooltip content={renderTooltip} />
          <Radar
            dataKey="value"
            stroke="var(--brand)"
            fill="var(--brand)"
            fillOpacity={0.2}
            strokeWidth={1.5}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
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

  const neutralCount = useMemo(() => topPicks.length - bullishCount, [topPicks, bullishCount])

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
        <div className="inline-flex" style={{ background: 'var(--surface-2)',
          border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 2 }}>
          {(['short', 'long'] as const).map(h => (
            <button key={h} onClick={() => setHorizon(h)} style={{
              padding: '5px 20px', fontSize: 12, fontWeight: 500,
              borderRadius: 'calc(var(--radius) - 2px)',
              background: horizon === h ? 'var(--surface)' : 'transparent',
              color: horizon === h ? 'var(--text)' : 'var(--text-3)',
              boxShadow: horizon === h ? 'var(--shadow-sm)' : 'none',
              transition: 'all var(--dur-base) var(--ease-out)',
              cursor: 'pointer', border: 'none',
            }}>
              {h === 'short' ? 'Short-Term' : 'Long-Term'}
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
          const rsi = Number(s.RSI_Value)||0
          const pe = s['P/E'] ? Number(s['P/E']) : null
          const mcap = s['Market_Cap_B'] ? Number(s['Market_Cap_B']) : null
          const roe = s['ROE_%'] ? Number(s['ROE_%']) : null
          const high52 = s['52W_High'] ? Number(s['52W_High']) : null
          const stSignal = s.ST_Signal || ''
          const macdVal = Number(s.MACD_Value)||0
          const momentum = Number(s.Momentum_12M)||0
          const debtEq = s['Debt_to_Equity'] ? Number(s['Debt_to_Equity']) : null
          const sharpe = s['Sharpe'] ? Number(s['Sharpe']) : null
          const bullCount = s['Bull_Count'] ?? null
          const bearCount = s['Bear_Count'] ?? null

          const priceVsHigh = high52 ? ((price / high52) * 100) : null

          const cardBorderLeft = composite >= 7 ? 'var(--green)' : composite >= 4 ? 'var(--brand)' : 'var(--red)'

          return (
            <div key={s.Ticker} onClick={()=>onSelect(s.Ticker)}
              role="button" tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && onSelect(s.Ticker)}
              className="card card-hover cursor-pointer p-4"
              style={{ borderLeft: `3px solid ${cardBorderLeft}` }}>
              {/* Header */}
              <div className="flex items-start justify-between mb-1.5">
                <div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-base font-bold" style={{color:'var(--text)'}}>{s.Ticker.replace('.NS','')}</span>
                    <span className="text-[10px] font-medium" style={{color:'var(--text-3)'}}>#{i+1}</span>
                  </div>
                  {s.Long_Name && (
                    <span style={{ fontSize: 11, color: 'var(--text-3)', overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160, display: 'block' }}>
                      {s.Long_Name.replace(' Limited', ' Ltd').replace(' Industries', ' Ind.')}
                    </span>
                  )}
                  {!s.Long_Name && <span className="text-[10px]" style={{color:'var(--text-3)'}}>{s.Sector||'Equities'}</span>}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span style={{
                    fontFamily: "'DM Serif Display', serif",
                    fontSize: 36, lineHeight: 1,
                    color: composite >= 7 ? 'var(--green)' : composite >= 4 ? 'var(--brand)' : 'var(--red)',
                  }}>
                    {composite.toFixed(1)}
                  </span>
                  {s.Conviction && (
                    <span className={`badge ${s.Conviction === 'Strong Buy' ? 'badge-strong-buy' : s.Conviction === 'Buy' ? 'badge-buy' : s.Conviction === 'Caution' ? 'badge-caution' : s.Conviction === 'Avoid' ? 'badge-avoid' : 'badge-hold'}`}>
                      {s.Conviction}
                    </span>
                  )}
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

              {/* Sub-score bars */}
              <div className="mb-3 space-y-1.5">
                {scoreBar('Technical', (Number(s.Tech_Score) + 1) * 5, 0, 10)}
                {scoreBar('Fundamental', Number(s.Fund_Score) || 0, 0, 10)}
                {scoreBar('Research', Number(s.Research_Score) || 0, 0, 10)}
              </div>

              {/* Key metrics grid */}
              <div className="grid grid-cols-3 gap-x-2 gap-y-1.5 mb-2.5">
                <Metric label="P/E" value={pe!==null?(pe<0?'Loss':pe.toFixed(1)):'\u2014'} />
                <Metric label="Mkt Cap" value={mcap!==null?`\u20B9${mcap.toLocaleString('en-IN')}Cr`:'\u2014'} />
                <Metric label="ROE" value={roe!==null?`${roe.toFixed(1)}%`:'\u2014'} />
                <Metric label="ROCE" value={s['ROCE_%']!=null?`${Number(s['ROCE_%']).toFixed(1)}%`:'\u2014'} />
                <Metric label="Div Yld" value={s['Div_Yield_%']!=null?`${Number(s['Div_Yield_%']).toFixed(2)}%`:'\u2014'} />
                <Metric label="Promoter" value={s['Promoter_Holding_%']!=null?`${Number(s['Promoter_Holding_%']).toFixed(1)}%`:'\u2014'} color={s['Promoter_Pledging_%']!=null&&Number(s['Promoter_Pledging_%'])>20?'var(--red)':'var(--text)'} />
                <Metric label="D/E" value={debtEq!==null?debtEq.toFixed(2):'\u2014'} />
                <Metric label="Sharpe" value={sharpe!==null?sharpe.toFixed(2):'\u2014'} color={sharpe!==null?(sharpe>1?'var(--green)':sharpe<0?'var(--red)':'var(--text)'):'var(--text)'} />
                <Metric label="Beta" value={s.Beta!=null?Number(s.Beta).toFixed(2):'\u2014'} color={s.Beta!=null?(Number(s.Beta)<0.8?'var(--green)':Number(s.Beta)>1.2?'var(--red)':'var(--text)'):'var(--text)'} />
              </div>

              {/* Bull/Bear + 52W range */}
              <div className="flex items-center gap-3 mb-2.5 text-[11px]">
                {bullCount !== null && (
                  <div className="flex items-center gap-1 shrink-0" style={{minWidth:'90px'}}>
                    <span style={{color:'var(--text-3)'}}>Bull</span>
                    <span className="font-mono font-medium" style={{color:'var(--green)'}}>{bullCount}</span>
                    <span style={{color:'var(--text-3)'}}>/</span>
                    <span className="font-mono font-medium" style={{color:'var(--text-2)'}}>{neutralCount}</span>
                    <span style={{color:'var(--text-3)'}}>/</span>
                    <span className="font-mono font-medium" style={{color:'var(--red)'}}>{bearCount ?? '-'}</span>
                  </div>
                )}
                {priceVsHigh !== null && (
                  <div className="flex-1 min-w-0">
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
                {rsi > 0 && <SignalBadge label={`RSI(14) ${rsi.toFixed(0)}`} bullish={rsi < 70} />}
                {stSignal && <SignalBadge label={stSignal} bullish={stSignal==='Buy'||stSignal==='Long'} />}
                {macdVal > 0 && <SignalBadge label="MACD +" bullish={true} />}
                {macdVal < 0 && <SignalBadge label={'MACD \u2212'} bullish={false} />}
                {momentum > 0.1 && <SignalBadge label="Mom +" bullish={true} />}
                {momentum < -0.1 && <SignalBadge label={'Mom \u2212'} bullish={false} />}
              </div>

              {/* Radar chart */}
              <div style={{borderTop:'1px solid var(--border)',paddingTop:'8px'}}>
                <ScoreRadar s={s} />
              </div>
            </div>
          )
        })}
      </div>

      {/* Sector breakdown */}
      {sectorBreakdown.length > 0 && (
        <div className="card p-4" style={{ background: 'var(--surface-2)' }}>
          <h3 className="section-label mb-3">Sector Breakdown</h3>
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
