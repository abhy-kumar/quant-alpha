import type { DashboardData } from '../types'
import { num, colorCode } from './shared'

interface Props {
  topPicks: DashboardData[]
  horizon: 'short'|'long'
  setHorizon: (h: 'short'|'long') => void
  onSelect: (t: string) => void
}

export default function SignalsTab({ topPicks, horizon, setHorizon, onSelect }: Props) {
  return (
    <div>
      {/* Controls */}
      <div className="flex items-center justify-between mb-4">
        <div className="inline-flex rounded-lg p-0.5" style={{background:'var(--border)'}}>
          {(['short','long'] as const).map(h => (
            <button key={h} onClick={()=>setHorizon(h)} className="px-4 py-1.5 text-[13px] font-medium rounded-md transition-all"
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
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] font-semibold" style={{color:'var(--text)'}}>{s.Ticker.replace('.NS','')}</span>
                    </div>
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
                  <td className={`py-3 px-3 text-right font-mono text-[13px] font-medium hidden lg:table-cell ${colorCode(s.Momentum_12M)}`}
                    style={{color: colorCode(s.Momentum_12M)?undefined:undefined}}>
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
    </div>
  )
}
