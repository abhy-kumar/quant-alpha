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
  return (
    <div>
      {/* Controls */}
      <div className="mb-4">
        <div className="inline-flex p-0.5" style={{background:'var(--border)'}}>
          {(['short','long'] as const).map(h => (
            <button key={h} onClick={()=>setHorizon(h)}
              className="w-[110px] py-1.5 text-[13px] font-medium transition-all text-center"
              style={{background:horizon===h?'var(--surface)':'transparent',color:horizon===h?'var(--text)':'var(--text-3)',boxShadow:horizon===h?'0 1px 3px rgba(0,0,0,0.08)':'none'}}>
              {h==='short'?'Short Term':'Long Term'}
            </button>
          ))}
        </div>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {topPicks.map((s, i) => {
          const change = Number(s['1d_Chg_%'])||0
          const price = Number(s.Price)||0
          const composite = Number(s.Composite_Score)||0
          const rsi = Number(s.RSI_Value)||0
          const pe = s['P/E'] ? Number(s['P/E']) : null
          const mcap = s['Market_Cap_B'] ? Number(s['Market_Cap_B']) : null
          const roe = s['ROE_%'] ? Number(s['ROE_%']) : null
          const divY = s['Div_Yield_%'] ? Number(s['Div_Yield_%']) : null
          const high52 = s['52W_High'] ? Number(s['52W_High']) : null
          const stSignal = s.ST_Signal || ''
          const macdVal = Number(s.MACD_Value)||0
          const momentum = Number(s.Momentum_12M)||0
          const vol = Number(s.Vol_60D)||0
          const piotroski = Number(s.Piotroski_F)||0
          const debtEq = s['Debt_to_Equity'] ? Number(s['Debt_to_Equity']) : null

          const priceVsHigh = high52 ? ((price / high52) * 100).toFixed(0) : null

          return (
            <div key={s.Ticker} onClick={()=>onSelect(s.Ticker)}
              className="p-4 cursor-pointer transition-colors"
              style={{background:'var(--surface)',border:'1px solid var(--border)'}}>
              {/* Header */}
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-bold" style={{color:'var(--text)'}}>{s.Ticker.replace('.NS','')}</span>
                    <span className="text-[10px] font-medium" style={{color:'var(--text-3)'}}>#{i+1}</span>
                  </div>
                  <span className="text-[11px]" style={{color:'var(--text-3)'}}>{s.Sector||'Equities'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-mono font-bold" style={{color:composite>=7?'var(--green)':composite>=4?'var(--brand)':'var(--red)'}}>
                    {composite.toFixed(1)}
                  </span>
                  <span className="px-1.5 py-0.5 text-[10px] font-medium"
                    style={s.Conviction==='Strong Buy'?{background:'var(--green-bg)',color:'var(--green)'}:s.Conviction==='Buy'?{background:'rgba(30,96,145,0.08)',color:'var(--blue)'}:{background:'var(--bg)',color:'var(--text-2)'}}>
                    {s.Conviction||'\u2014'}
                  </span>
                </div>
              </div>

              {/* Price + change */}
              <div className="flex items-baseline gap-2 mb-3">
                <span className="text-base font-mono font-medium" style={{color:'var(--text)'}}>
                  {'\u20B9'}{price.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}
                </span>
                <span className="text-xs font-mono font-medium" style={{color:change>=0?'var(--green)':'var(--red)'}}>
                  {change>0?'+':''}{change.toFixed(2)}%
                </span>
              </div>

              {/* Key metrics grid */}
              <div className="grid grid-cols-3 gap-x-3 gap-y-2 mb-3" style={{borderTop:'1px solid var(--border)',paddingTop:'10px'}}>
                <Metric label="P/E" value={pe!==null?pe.toFixed(1):'\u2014'} />
                <Metric label="Mkt Cap" value={mcap!==null?`\u20B9${mcap.toFixed(0)}B`:'\u2014'} />
                <Metric label="ROE" value={roe!==null?`${roe.toFixed(1)}%`:'\u2014'} />
                <Metric label="Div Yield" value={divY!==null?`${divY.toFixed(2)}%`:'\u2014'} />
                <Metric label="D/E" value={debtEq!==null?debtEq.toFixed(2):'\u2014'} />
                <Metric label="52W" value={priceVsHigh!==null?`${priceVsHigh}% of H`:'\u2014'} color={priceVsHigh&&Number(priceVsHigh)>90?'var(--green)':'var(--text)'} />
              </div>

              {/* Signals */}
              <div className="flex flex-wrap gap-1 mb-3">
                {rsi > 0 && <SignalBadge label={`RSI ${rsi.toFixed(0)}`} bullish={rsi < 70} />}
                {stSignal && <SignalBadge label={stSignal} bullish={stSignal==='Buy'||stSignal==='Long'} />}
                {macdVal > 0 && <SignalBadge label="MACD +" bullish={true} />}
                {macdVal < 0 && <SignalBadge label="MACD \u2212" bullish={false} />}
                {momentum > 0.1 && <SignalBadge label="Mom +" bullish={true} />}
              </div>

              {/* Compact scores */}
              <div className="space-y-1.5" style={{borderTop:'1px solid var(--border)',paddingTop:'8px'}}>
                <ScoreDot label="Piotroski" value={piotroski} max={9} />
                <ScoreDot label="12M Mom" value={Math.abs(momentum)*100} max={200} />
                <ScoreDot label="Vol 60D" value={vol} max={60} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
