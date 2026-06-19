import type { DashboardData } from '../types'
import { num, colorCode } from './shared'

interface Props {
  topPicks: DashboardData[]
  horizon: 'short'|'long'
  setHorizon: (h: 'short'|'long') => void
  onSelect: (t: string) => void
}

function KeyMetric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] uppercase tracking-wider" style={{color:'var(--text-3)'}}>{label}</span>
      <span className="text-[15px] font-semibold font-mono mt-0.5" style={{color:'var(--text)'}}>{value}</span>
      {sub && <span className="text-[11px] mt-0.5" style={{color:'var(--text-3)'}}>{sub}</span>}
    </div>
  )
}

export default function SignalsTab({ topPicks, horizon, setHorizon, onSelect }: Props) {
  const avgScore = topPicks.length ? (topPicks.reduce((s,p)=>s+Number(p.Composite_Score||0),0)/topPicks.length).toFixed(1) : '0'
  const avgMomentum = topPicks.length ? (topPicks.reduce((s,p)=>s+Number(p.Momentum_12M||0),0)/topPicks.length*100).toFixed(1) : '0'
  const avgPiotroski = topPicks.length ? (topPicks.reduce((s,p)=>s+Number(p.Piotroski_F||0),0)/topPicks.length).toFixed(1) : '0'
  const sectors = [...new Set(topPicks.map(p=>p.Sector).filter(Boolean))]

  return (
    <div>
      {/* Controls */}
      <div className="flex items-center justify-between mb-4">
        <div className="inline-flex rounded-lg p-0.5" style={{background:'var(--border)'}}>
          {(['short','long'] as const).map(h => (
            <button key={h} onClick={()=>setHorizon(h)} className="px-4 py-1.5 text-[13px] font-medium rounded-md transition-all min-w-[100px] text-center"
              style={{background:horizon===h?'var(--surface)':'transparent',color:horizon===h?'var(--text)':'var(--text-3)',boxShadow:horizon===h?'0 1px 3px rgba(0,0,0,0.08)':'none'}}>
              {h==='short'?'Short Term':'Long Term'}
            </button>
          ))}
        </div>
        <span className="text-[12px]" style={{color:'var(--text-3)'}}>Top 3 picks</span>
      </div>

      {/* Table */}
      <div className="rounded-xl overflow-hidden" style={{background:'var(--surface)',border:'1px solid var(--border)'}}>
        <table className="w-full text-left">
          <thead>
            <tr style={{borderBottom:'1px solid var(--border)'}}>
              <th className="py-2.5 px-3 text-[11px] font-medium uppercase tracking-wider" style={{color:'var(--text-3)'}}>#</th>
              <th className="py-2.5 px-3 text-[11px] font-medium uppercase tracking-wider" style={{color:'var(--text-3)'}}>Stock</th>
              <th className="py-2.5 px-3 text-[11px] font-medium uppercase tracking-wider text-right" style={{color:'var(--text-3)'}}>Price</th>
              <th className="py-2.5 px-3 text-[11px] font-medium uppercase tracking-wider text-right" style={{color:'var(--text-3)'}}>1D</th>
              <th className="py-2.5 px-3 text-[11px] font-medium uppercase tracking-wider text-right" style={{color:'var(--text-3)'}}>Score</th>
              <th className="py-2.5 px-3 text-[11px] font-medium uppercase tracking-wider" style={{color:'var(--text-3)'}}>Conviction</th>
              <th className="py-2.5 px-3 text-[11px] font-medium uppercase tracking-wider hidden md:table-cell" style={{color:'var(--text-3)'}}>Sector</th>
              <th className="py-2.5 px-3 text-[11px] font-medium uppercase tracking-wider text-right hidden lg:table-cell" style={{color:'var(--text-3)'}}>Piotroski</th>
              <th className="py-2.5 px-3 text-[11px] font-medium uppercase tracking-wider text-right hidden lg:table-cell" style={{color:'var(--text-3)'}}>12M Mom</th>
              <th className="py-2.5 px-3 text-[11px] font-medium uppercase tracking-wider text-right hidden xl:table-cell" style={{color:'var(--text-3)'}}>ROE</th>
              <th className="py-2.5 px-3 text-[11px] font-medium uppercase tracking-wider text-right hidden xl:table-cell" style={{color:'var(--text-3)'}}>Vol 60D</th>
            </tr>
          </thead>
          <tbody>
            {topPicks.map((s, i) => {
              const change = Number(s['1d_Chg_%'])||0
              const price = Number(s.Price)||0
              return (
                <tr key={s.Ticker} onClick={()=>onSelect(s.Ticker)} className="cursor-pointer transition-colors"
                  style={{borderBottom:'1px solid var(--border)'}}
                  onMouseEnter={e=>e.currentTarget.style.background='var(--bg)'}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <td className="py-3 px-3 text-[13px] font-medium" style={{color:'var(--text-3)'}}>{i+1}</td>
                  <td className="py-3 px-3">
                    <span className="text-[15px] font-semibold" style={{color:'var(--text)'}}>{s.Ticker.replace('.NS','')}</span>
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-[13px]" style={{color:'var(--text)'}}>
                    {'\u20B9'}{price.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}
                  </td>
                  <td className={`py-3 px-3 text-right font-mono text-[13px] font-medium ${colorCode(change)}`}>
                    {change>0?'+':''}{change.toFixed(2)}%
                  </td>
                  <td className="py-3 px-3 text-right">
                    <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-[13px] font-mono font-bold"
                      style={{
                        background: Number(s.Composite_Score)>=7?'var(--green-bg)':Number(s.Composite_Score)>=4?'rgba(30,63,104,0.06)':'var(--red-bg)',
                        color: Number(s.Composite_Score)>=7?'var(--green)':Number(s.Composite_Score)>=4?'var(--brand)':'var(--red)',
                      }}>
                      {Number(s.Composite_Score||0).toFixed(1)}
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    <span className="inline-block px-2 py-0.5 text-[11px] font-medium rounded-md"
                      style={
                        s.Conviction==='Strong Buy'?{background:'var(--green-bg)',color:'var(--green)'}:
                        s.Conviction==='Buy'?{background:'rgba(30,96,145,0.08)',color:'#2563EB'}:
                        {background:'var(--bg)',color:'var(--text-2)'}
                      }>
                      {s.Conviction||'\u2014'}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-[13px] hidden md:table-cell" style={{color:'var(--text-2)'}}>{s.Sector||'\u2014'}</td>
                  <td className="py-3 px-3 text-right font-mono text-[13px] hidden lg:table-cell"
                    style={{color: Number(s.Piotroski_F)>=7?'var(--green)':Number(s.Piotroski_F)<=3?'var(--red)':'var(--text)'}}>
                    {s.Piotroski_F??'\u2014'}<span style={{color:'var(--text-3)'}}>/9</span>
                  </td>
                  <td className={`py-3 px-3 text-right font-mono text-[13px] font-medium hidden lg:table-cell ${colorCode(s.Momentum_12M)}`}>
                    {s.Momentum_12M!=null?`${(s.Momentum_12M*100).toFixed(1)}%`:'\u2014'}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-[13px] hidden xl:table-cell" style={{color:'var(--text)'}}>
                    {num(s['ROE_%'])}%
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-[13px] hidden xl:table-cell"
                    style={{color: Number(s.Vol_60D)<25?'var(--green)':Number(s.Vol_60D)>40?'var(--red)':'var(--text)'}}>
                    {num(s.Vol_60D)}%
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Summary stats below table */}
      <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl" style={{background:'var(--surface)',border:'1px solid var(--border)'}}>
        <KeyMetric label="Avg Score" value={`${avgScore}/10`} sub="Composite" />
        <KeyMetric label="Avg Momentum" value={`${avgMomentum}%`} sub="12-month" />
        <KeyMetric label="Avg Piotroski" value={`${avgPiotroski}/9`} sub="Quality" />
        <KeyMetric label="Sectors" value={sectors.join(', ')} sub={`${sectors.length} represented`} />
      </div>

      {/* Signal breakdown for each pick */}
      <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
        {topPicks.map((s, i) => (
          <div key={s.Ticker} className="p-4 rounded-xl" style={{background:'var(--surface)',border:'1px solid var(--border)'}}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[13px] font-semibold" style={{color:'var(--text)'}}>{s.Ticker.replace('.NS','')}</span>
              <span className="text-[11px] font-mono" style={{color:'var(--text-3)'}}>#{i+1}</span>
            </div>
            <div className="space-y-2">
              {[
                {l:'Tech',v:Number(s.Tech_Score)||0,min:-1,max:1},
                {l:'Fund',v:Number(s.Fund_Score)||0,min:0,max:10},
                {l:'Research',v:Number(s.Research_Score)||0,min:0,max:10},
                {l:'Momentum',v:Math.min(10,Math.max(0,((Number(s.Momentum_12M)||0)+0.3)*12)),min:0,max:10},
                {l:'Piotroski',v:Number(s.Piotroski_F)||0,min:0,max:9},
              ].map(m => {
                const pct = Math.max(0,Math.min(100,((m.v-m.min)/(m.max-m.min))*100))
                return (
                  <div key={m.l} className="flex items-center gap-2">
                    <span className="text-[11px] w-16 shrink-0" style={{color:'var(--text-3)'}}>{m.l}</span>
                    <div className="flex-1 h-1 rounded-full overflow-hidden" style={{background:'var(--border)'}}>
                      <div className="h-full rounded-full" style={{width:`${pct}%`,background:pct>=70?'var(--green)':pct>=40?'var(--brand)':'var(--red)'}} />
                    </div>
                    <span className="text-[11px] font-mono w-8 text-right" style={{color:'var(--text-2)'}}>{m.v.toFixed(1)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
