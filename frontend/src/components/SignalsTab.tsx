import type { DashboardData } from '../types'

interface Props {
  topPicks: DashboardData[]
  horizon: 'short'|'long'
  setHorizon: (h: 'short'|'long') => void
  onSelect: (t: string) => void
}

function ScoreBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  const color = pct >= 70 ? 'var(--green)' : pct >= 40 ? 'var(--brand)' : 'var(--red)'
  return (
    <div className="flex items-center gap-3">
      <span className="text-[12px] w-20 shrink-0" style={{color:'var(--text-3)'}}>{label}</span>
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{background:'var(--border)'}}>
        <div className="h-full rounded-full" style={{width:`${pct}%`,background:color}} />
      </div>
      <span className="text-[12px] font-mono w-10 text-right" style={{color:'var(--text)'}}>{value.toFixed(1)}</span>
    </div>
  )
}

function MiniChart({ stock }: { stock: DashboardData }) {
  const vals = [
    Number(stock.Tech_Score)||0,
    Number(stock.Fund_Score)||0,
    Number(stock.Research_Score)||0,
    Math.max(0,Math.min(10,((Number(stock.Momentum_12M)||0)+0.3)*12)),
    (Number(stock.Piotroski_F)||0)*(10/9),
  ]
  const w = 200, h = 60, pad = 4
  const max = 10, min = 0
  const pts = vals.map((v,i) => {
    const x = pad + (i/(vals.length-1))*(w-2*pad)
    const y = h - pad - ((v-min)/(max-min))*(h-2*pad)
    return `${x},${y}`
  }).join(' ')
  const area = `${pad},${h-pad} ${pts} ${w-pad},${h-pad}`
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-12 mt-3">
      <polygon points={area} fill="var(--green)" fillOpacity="0.08" />
      <polyline points={pts} fill="none" stroke="var(--green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {vals.map((v,i) => {
        const x = pad + (i/(vals.length-1))*(w-2*pad)
        const y = h - pad - ((v-min)/(max-min))*(h-2*pad)
        return <circle key={i} cx={x} cy={y} r="3" fill="var(--surface)" stroke="var(--green)" strokeWidth="2" />
      })}
    </svg>
  )
}

export default function SignalsTab({ topPicks, horizon, setHorizon, onSelect }: Props) {
  return (
    <div>
      {/* Controls */}
      <div className="mb-5">
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {topPicks.map((s, i) => {
          const change = Number(s['1d_Chg_%'])||0
          const price = Number(s.Price)||0
          const composite = Number(s.Composite_Score)||0
          return (
            <div key={s.Ticker} onClick={()=>onSelect(s.Ticker)}
              className="p-5 cursor-pointer transition-all hover:-translate-y-0.5"
              style={{background:'var(--surface)',border:'1px solid var(--border)'}}>
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold" style={{color:'var(--text)'}}>{s.Ticker.replace('.NS','')}</span>
                    <span className="text-[11px] font-medium" style={{color:'var(--text-3)'}}>#{i+1}</span>
                  </div>
                  <span className="text-[12px]" style={{color:'var(--text-3)'}}>{s.Sector||'Equities'}</span>
                </div>
                <span className="px-2 py-0.5 text-[11px] font-medium rounded-md"
                  style={s.Conviction==='Strong Buy'?{background:'var(--green-bg)',color:'var(--green)'}:s.Conviction==='Buy'?{background:'rgba(30,96,145,0.08)',color:'#2563EB'}:{background:'var(--bg)',color:'var(--text-2)'}}>
                  {s.Conviction||'\u2014'}
                </span>
              </div>

              {/* Price + change */}
              <div className="flex items-baseline gap-3 mb-4">
                <span className="text-lg font-mono font-medium" style={{color:'var(--text)'}}>
                  {'\u20B9'}{price.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}
                </span>
                <span className="text-sm font-mono font-medium" style={{color:change>=0?'var(--green)':'var(--red)'}}>
                  {change>0?'+':''}{change.toFixed(2)}%
                </span>
                <span className="ml-auto text-2xl font-mono font-bold" style={{color:composite>=7?'var(--green)':composite>=4?'var(--brand)':'var(--red)'}}>
                  {composite.toFixed(1)}
                </span>
              </div>

              {/* Metrics */}
              <div className="space-y-2" style={{borderTop:'1px solid var(--border)',paddingTop:'12px'}}>
                <ScoreBar label="Piotroski" value={Number(s.Piotroski_F)||0} max={9} />
                <ScoreBar label="12M Mom" value={Math.abs(Number(s.Momentum_12M)||0)*100} max={200} />
                <ScoreBar label="ROE" value={Number(s['ROE_%'])||0} max={60} />
                <ScoreBar label="Vol 60D" value={Number(s.Vol_60D)||0} max={60} />
              </div>

              {/* Mini radar chart */}
              <MiniChart stock={s} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
