import { useMemo } from 'react'
import type { DashboardData } from '../types'
import { scoreBar } from './shared'

function ConvictionDots({ conviction }: { conviction: string }) {
  const levels: Record<string, number> = { 'Strong Buy': 5, 'Buy': 4, 'Hold': 3, 'Caution': 2, 'Avoid': 1 }
  const level = levels[conviction] ?? 3
  const colorClass = level <= 2 ? 'avoid' : level === 3 ? 'caution' : ''
  return (
    <div className="conviction-dots">
      {[1,2,3,4,5].map(i => (
        <span key={i} className={`dot ${i <= level ? `filled ${colorClass}` : ''}`}/>
      ))}
      <span style={{ fontSize:10, color:'var(--text-3)', marginLeft:3 }}>{conviction}</span>
    </div>
  )
}

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

  const axes = [
    { label: 'Tech', value: Math.max(0, Math.min(10, (techRaw + 1) * 5)), raw: techRaw.toFixed(1) },
    { label: 'Fund', value: Math.max(0, Math.min(10, fundRaw)), raw: fundRaw.toFixed(1) },
    { label: 'Research', value: Math.max(0, Math.min(10, researchRaw)), raw: researchRaw.toFixed(1) },
    { label: 'Quality', value: Math.max(0, Math.min(10, (piotroski / 9) * 10)), raw: `${piotroski}/9` },
    { label: 'Mom', value: Math.max(0, Math.min(10, ((momentum + 100) / 200) * 10)), raw: `${momentum >= 0 ? '+' : ''}${momentum.toFixed(1)}%` },
    { label: 'Value', value: Math.max(0, Math.min(10, value)), raw: value.toFixed(1) },
    { label: 'Vol', value: Math.max(0, Math.min(10, ((60 - vol) / 60) * 10)), raw: `${vol.toFixed(1)}%` },
  ]

  const cx = 100, cy = 100, r = 70, n = axes.length
  const toXY = (i: number, val: number) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2
    const dist = (val / 10) * r
    return { x: cx + dist * Math.cos(angle), y: cy + dist * Math.sin(angle) }
  }

  const gridLevels = [2, 4, 6, 8, 10]
  const dataPoints = axes.map((a, i) => toXY(i, a.value))
  const dataPath = dataPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + 'Z'

  return (
    <div style={{ width: '100%', height: 200 }}>
      <svg viewBox="0 0 200 200" width="100%" height="100%">
        {/* Grid rings */}
        {gridLevels.map(level => {
          const pts = Array.from({ length: n }, (_, i) => toXY(i, level))
          const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + 'Z'
          return <path key={level} d={d} fill="none" stroke="var(--border)" strokeWidth={0.5} />
        })}
        {/* Axis lines */}
        {axes.map((_, i) => {
          const end = toXY(i, 10)
          return <line key={i} x1={cx} y1={cy} x2={end.x} y2={end.y} stroke="var(--border)" strokeWidth={0.5} />
        })}
        {/* Data shape */}
        <path d={dataPath} fill="var(--brand)" fillOpacity={0.15} stroke="var(--brand)" strokeWidth={1.5} />
        {/* Data dots */}
        {dataPoints.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={2.5} fill="var(--brand)" />
        ))}
        {/* Labels */}
        {axes.map((a, i) => {
          const lbl = toXY(i, 12)
          return (
            <text key={i} x={lbl.x} y={lbl.y} textAnchor="middle" dominantBaseline="middle"
              fontSize={8} fill="var(--text-3)" fontWeight={500}>
              {a.label}
            </text>
          )
        })}
      </svg>
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

          return (
            <div key={s.Ticker} onClick={()=>onSelect(s.Ticker)}
              role="button" tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && onSelect(s.Ticker)}
              className="card card-hover cursor-pointer p-4">
              {/* Header: ticker + category */}
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-base font-bold" style={{color:'var(--text)'}}>{s.Ticker.replace('.NS','')}</span>
                    <span className="text-[10px] font-medium" style={{color:'var(--text-3)'}}>#{i+1}</span>
                  </div>
                  <span style={{ fontSize:10, color:'var(--text-3)' }}>
                    {s.Sector || 'Equities'} {s.Long_Name ? `\u00B7 ${s.Long_Name.replace(' Limited', ' Ltd').replace(' Industries', ' Ind.')}` : ''}
                  </span>
                </div>
                {s.Conviction && <ConvictionDots conviction={s.Conviction} />}
              </div>

              {/* Price — hero element */}
              <div className="flex items-baseline gap-2 mb-1">
                <span className="font-mono" style={{fontSize:24, lineHeight:1, fontWeight:700, letterSpacing:'-0.02em', color:'var(--text)'}}>
                  {'\u20B9'}{price.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}
                </span>
                <span className="font-mono" style={{fontSize:13, fontWeight:600, color: change>=0?'var(--green)':'var(--red)'}}>
                  {change>0?'\u25B2':'\u25BC'} {change>0?'+':''}{change.toFixed(2)}%
                </span>
              </div>

              {/* Score */}
              <div className="flex items-center gap-2 mb-3">
                <span className="font-mono" style={{
                  fontSize: 20, lineHeight: 1, fontWeight: 700, letterSpacing: '-0.02em',
                  color: composite >= 7 ? 'var(--green)' : composite >= 4 ? 'var(--brand)' : 'var(--red)',
                }}>
                  {composite.toFixed(1)}
                </span>
                <span style={{ fontSize:10, color:'var(--text-3)' }}>composite</span>
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
