import { useEffect, useState } from 'react'
import axios from 'axios'
import { Activity, Database, ServerCrash, CheckCircle2, BarChart2 } from 'lucide-react'

// Interfaces matching the Python backend
interface DashboardData {
  Ticker: string
  Sector: string
  LTP: number
  Prev_Close: number
  RSI: number
  MACD_Hist: number
  BB_Pos: number
  Tech_Score: number
  Fund_Score: number
  Conviction: string
  Scan_Time: string
}

interface Diagnostics {
  database: { status: string; message: string; type: string }
  scans: { ok: number; failed: number }
}

const API_BASE = 'http://localhost:8000/api'

export default function App() {
  const [data, setData] = useState<DashboardData[]>([])
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [dashRes, diagRes] = await Promise.all([
          axios.get(`${API_BASE}/dashboard`),
          axios.get(`${API_BASE}/diagnostics`)
        ])
        
        if (dashRes.data.status === 'ok') {
          setData(dashRes.data.data)
        }
        setDiagnostics(diagRes.data)
      } catch (err) {
        console.error("Failed to fetch data:", err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-border py-6 px-10 flex justify-between items-center">
        <div>
          <h1 className="font-display text-2xl uppercase tracking-wider">
            Quantitative <span className="text-brand">Alpha</span>
          </h1>
          <p className="font-mono text-xs text-sub tracking-widest mt-1">
            Alpha Research & Investment Club | FMS Delhi
          </p>
        </div>
        <div className="flex gap-4">
          <button className="border border-btn-border px-6 py-2 font-mono text-xs hover:bg-btn-hover transition-colors uppercase tracking-widest text-primary">
            Run Scan
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow p-10 max-w-7xl mx-auto w-full">
        {loading ? (
          <div className="flex items-center justify-center h-64 font-mono text-muted text-sm uppercase">
            Fetching telemetry...
          </div>
        ) : (
          <div className="space-y-12">
            
            <section>
              <h2 className="font-display text-4xl mb-2 uppercase tracking-wide">
                Data Stays In.<br />
                <span className="text-brand">Value Comes Out.</span>
              </h2>
              <p className="font-mono text-muted text-sm max-w-2xl mt-4">
                Decisions on live signals, executed inside your environment. 
                Securities ranked by composite technical score across momentum and trend signals.
              </p>
            </section>

            {/* Grid of outcomes (mimicking Ninebar) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border border-border bg-card">
              
              {data.slice(0, 3).map((stock, i) => (
                <div key={stock.Ticker} className="p-8 border-b md:border-b-0 md:border-r border-border last:border-r-0">
                  <div className="font-mono text-[10px] text-sub uppercase tracking-widest mb-6">
                    Pick 0{i + 1}
                  </div>
                  <h3 className="font-display text-3xl mb-1">{stock.Ticker}<span className="text-brand">.</span></h3>
                  <div className="font-mono text-xs text-brand tracking-widest mb-6 uppercase">
                    {stock.Sector || 'Equities'}
                  </div>
                  
                  <div className="space-y-4 font-mono text-sm">
                    <div className="flex justify-between border-b border-border pb-2">
                      <span className="text-muted">Tech Score</span>
                      <span className={stock.Tech_Score > 0 ? 'text-green-500' : 'text-red-500'}>
                        {stock.Tech_Score.toFixed(1)}
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-border pb-2">
                      <span className="text-muted">RSI</span>
                      <span>{stock.RSI.toFixed(1)}</span>
                    </div>
                    <div className="flex justify-between border-b border-border pb-2">
                      <span className="text-muted">Conviction</span>
                      <span className="text-primary">{stock.Conviction}</span>
                    </div>
                  </div>
                  
                  <div className="mt-8 flex items-end h-8 gap-1 opacity-50">
                    <div className="w-1 bg-muted h-full"></div>
                    <div className="w-1 bg-muted h-4/5"></div>
                    <div className="w-1 bg-muted h-3/5"></div>
                    <div className="w-1 bg-muted h-full"></div>
                    <div className="w-1 bg-brand h-2/5"></div>
                  </div>
                </div>
              ))}

            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-12 py-12 px-10">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-12">
          
          <div>
            <h4 className="font-display text-lg mb-4 uppercase">System Diagnostics</h4>
            {diagnostics && (
              <div className="space-y-2 font-mono text-xs text-muted">
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-2"><Database size={14} /> Database</span>
                  <span className={diagnostics.database.status === 'ok' ? 'text-green-500' : 'text-red-500'}>
                    {diagnostics.database.type}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-2"><Activity size={14} /> Scans</span>
                  <span><span className="text-green-500">{diagnostics.scans.ok} OK</span> / {diagnostics.scans.failed} Failed</span>
                </div>
              </div>
            )}
          </div>

          <div>
            <h4 className="font-display text-lg mb-4 uppercase">Disclaimer</h4>
            <p className="font-mono text-xs text-sub leading-relaxed">
              This platform is for educational purposes only and does not constitute financial advice. 
              The models and signals provided are experimental. Always consult a certified financial advisor before making investment decisions. 
              Alpha Research and Investment Club, FMS Delhi is not responsible for any trading losses incurred.
            </p>
          </div>

          <div className="text-right">
             <h4 className="font-display text-lg mb-4 uppercase">Project Eura</h4>
             <p className="font-mono text-xs text-muted">Alpha Research and Investment Club<br/>FMS Delhi</p>
             <p className="font-mono text-[10px] text-sub mt-4 tracking-widest uppercase">Made with &hearts; by Abhishek Kumar</p>
          </div>

        </div>
      </footer>
    </div>
  )
}
