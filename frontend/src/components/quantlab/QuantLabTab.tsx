import { useEffect, useState, useMemo, useCallback } from 'react'
import type { QuantData, BacktestBundle, BacktestRunMeta, BacktestRunFull, DashboardData, StrategyRuleConfig, StrategyBacktestResult, StrategyHistory } from '../../types'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, BarChart, Bar, PieChart, Pie, Cell, ReferenceLine } from 'recharts'
import { Flask, Target, Crosshair, TrendUp, ChartLineDown, ShieldCheck, Warning, ChartPieSlice, GridFour, ArrowsLeftRight, BookOpen, Lightning, ChartBar, Prohibit, CheckCircle, Info, ClockCounterClockwise, ArrowClockwise, DownloadSimple } from '@phosphor-icons/react'
import { SegmentedControl, InfoTooltip, GlassCard, GlassCardHeader, GlassCardContent, GlassCardFooter } from '../common/shared'
import { exportToCSV } from '../../utils/exportUtils'
import { getRechartsTooltipStyle } from '../../utils/chartThemes'
import { STRATEGY_PRESETS, filterUniverse, simulateStrategy } from '../../utils/strategyEngine'
import { MonteCarloChart } from './MonteCarloChart'
import { ModelPortfoliosCard } from './ModelPortfoliosCard'
import { EfficientFrontierCard } from './EfficientFrontierCard'
import { ScenarioStressCard } from './ScenarioStressCard'
import { FactorICMonitorCard } from './FactorICMonitorCard'
import { CorrelationHeatmapCard } from './CorrelationHeatmapCard'
import { StrategyBuilderDrawer } from './StrategyBuilderDrawer'
import { StrategyTearSheet } from './StrategyTearSheet'

interface Props {
  isDark: boolean
  scanUpdated?: string
  onSelect: (ticker: string) => void
}

async function loadStrategyHistory(signal: AbortSignal): Promise<StrategyHistory | null> {
  const indexResponse = await fetch('/api/data?resource=strategies', { signal })
  if (!indexResponse.ok) return null
  const index = await indexResponse.json() as { pages: number }
  const history: StrategyHistory = { dates: [], benchmark: [], prices: {}, factors: {} }
  // Bounded pages stay below the server response limit and avoid a burst of requests.
  for (let page = 0; page < index.pages; page++) {
    const response = await fetch(`/api/data?resource=strategies&page=${page}`, { signal })
    if (!response.ok) return null
    const part = await response.json() as StrategyHistory
    history.dates.push(...part.dates)
    history.benchmark.push(...part.benchmark)
    Object.assign(history.prices, part.prices)
    Object.assign(history.factors, part.factors)
  }
  return history
}

// Recompute backtest stats from a windowed slice of chart data
function computeStats(chart: { date: string; portfolio: number; benchmark: number }[]) {
  if (chart.length < 2) return null
  const first = chart[0].portfolio
  const last = chart[chart.length - 1].portfolio
  const days = Math.max(
    (new Date(chart[chart.length - 1].date).getTime() - new Date(chart[0].date).getTime()) / 86400000,
    1
  )
  const years = Math.max(days / 365.25, 0.01)
  const totalRet = (last / first) - 1
  const cagr = Math.pow(1 + totalRet, 1 / years) - 1

  const dailyReturns = chart.slice(1).map((d, i) => d.portfolio / chart[i].portfolio - 1)
  const benchReturns = chart.slice(1).map((d, i) => d.benchmark / chart[i].benchmark - 1)
  const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length
  const variance = dailyReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1,dailyReturns.length-1)
  const annVol = Math.sqrt(variance * 252)
  const sharpe = annVol > 0 ? (mean * 252 - 0.065) / annVol : 0

  let peak = chart[0].portfolio
  let maxDd = 0
  for (const pt of chart) {
    if (pt.portfolio > peak) peak = pt.portfolio
    const dd = (pt.portfolio / peak) - 1
    if (dd < maxDd) maxDd = dd
  }

  const excess = dailyReturns.map((r,i) => r-benchReturns[i])
  const excessMean = excess.reduce((a,b) => a+b,0)/excess.length
  const trackingErr = Math.sqrt(excess.reduce((sum,r) => sum+(r-excessMean)**2,0)/Math.max(1,excess.length-1)*252)
  const infoRatio = trackingErr > 0 ? excessMean*252/trackingErr : 0
  const winRate = dailyReturns.filter(r => r > 0).length / dailyReturns.length * 100

  return {
    total_return: +(totalRet * 100).toFixed(2),
    cagr: +(cagr * 100).toFixed(2),
    volatility: +(annVol * 100).toFixed(2),
    sharpe: +sharpe.toFixed(2),
    max_drawdown: +(maxDd * 100).toFixed(2),
    info_ratio: +infoRatio.toFixed(2),
    win_rate: +winRate.toFixed(1),
  }
}

function QuantLabTabInner({ isDark, scanUpdated, onSelect }: Props) {
  const [history, setHistory] = useState<StrategyHistory | null>(null)
  const [quantError, setQuantError] = useState('')
  const [quantData, setQuantData] = useState<QuantData | null>(null)
  const [loading, setLoading] = useState(true)
  const [backtestModel, setBacktestModel] = useState<'short' | 'long'>('short')
  const [backtestHorizon, setBacktestHorizon] = useState<'1y' | '6m'>('1y')
  const [showHoldings, setShowHoldings] = useState(false)

  // - Strategy Sandbox State -
  const [activeLabView, setActiveLabView]     = useState<'standard' | 'sandbox'>('standard')
  const [marketStocks, setMarketStocks]       = useState<DashboardData[]>([])
  const [strategyConfig, setStrategyConfig]   = useState<StrategyRuleConfig>(STRATEGY_PRESETS.momentum)
  const [activePreset, setActivePreset]       = useState<string | null>('momentum')

  // - Backtest archive state -
  const [cachedRuns, setCachedRuns]           = useState<BacktestRunMeta[]>([])
  const [runsLoading, setRunsLoading]         = useState(false)
  const [selectedSlug, setSelectedSlug]       = useState<string | null>(null)
  const [selectedRunData, setSelectedRunData] = useState<BacktestRunFull | null>(null)
  const [runDataLoading, setRunDataLoading]   = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    loadStrategyHistory(controller.signal).then(setHistory).catch(() => { if (!controller.signal.aborted) setHistory(null) })
    fetch('/api/data?resource=quant')
      .then(r => r.json())
      .then(d => {
        if (d.error) { setQuantError(d.error); setLoading(false); return }
        setQuantError('')
        setQuantData(d)
        setLoading(false)
      })
      .catch(e => {
        console.error('Failed to load quant data', e)
        setLoading(false)
      })

    fetch('/api/data?resource=market')
      .then(r => r.json())
      .then(d => {
        if (d?.data && Array.isArray(d.data)) {
          setMarketStocks(d.data)
        }
      })
      .catch(() => {})
    return () => controller.abort()
  }, [scanUpdated])

  // Load cached custom backtest index
  const loadRunIndex = useCallback((silent = false) => {
    if (!silent) setRunsLoading(true)
    fetch('/api/data?resource=runs')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.runs) setCachedRuns(d.runs)
      })
      .catch(() => {})
      .finally(() => { if (!silent) setRunsLoading(false) })
  }, [])

  useEffect(() => { loadRunIndex() }, [loadRunIndex])

  // Load full data for a selected run
  const loadRunData = useCallback((slug: string) => {
    setRunDataLoading(true)
    setSelectedSlug(slug)
    setSelectedRunData(null)
    fetch(`/api/data?resource=run&slug=${encodeURIComponent(slug)}`)
      .then(r => r.json())
      .then(d => setSelectedRunData(d.error ? null : d))
      .catch(() => setSelectedRunData(null))
      .finally(() => setRunDataLoading(false))
  }, [])

  // Chart data for the selected run
  const selectedChart = useMemo(() => {
    if (!selectedRunData?.chart?.length) return []
    const base = selectedRunData.chart[0]
    return selectedRunData.chart.map(d => ({
      ...d,
      portfolio: +((d.portfolio / base.portfolio) * 100).toFixed(2),
      benchmark: +((d.benchmark / base.benchmark) * 100).toFixed(2),
    }))
  }, [selectedRunData])

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

  // - Active dataset resolution -
  // Priority: walk-forward OHLCV backtests (1Y/6M) >> legacy factor_history backtests
  const activeBacktest: BacktestBundle | undefined = useMemo(() => {
    if (!quantData) return undefined
    if (backtestModel === 'short') {
      return backtestHorizon === '1y'
        ? (quantData.backtest_short_1y ?? quantData.backtest)
        : (quantData.backtest_short_6m ?? quantData.backtest)
    } else {
      return backtestHorizon === '1y'
        ? (quantData.backtest_long_1y  ?? quantData.backtest_long ?? quantData.backtest)
        : (quantData.backtest_long_6m  ?? quantData.backtest_long ?? quantData.backtest)
    }
  }, [quantData, backtestModel, backtestHorizon])

  const allChartData = useMemo(() => activeBacktest?.chart ?? [], [activeBacktest])
  const holdings     = activeBacktest?.holdings ?? []

  // Rebase to 100 from start
  const windowedChart = useMemo(() => {
    if (!allChartData.length) return []
    const basePort  = allChartData[0].portfolio
    const baseBench = allChartData[0].benchmark
    return allChartData.map(d => ({
      ...d,
      portfolio: +((d.portfolio / basePort)  * 100).toFixed(2),
      benchmark: +((d.benchmark / baseBench) * 100).toFixed(2),
    }))
  }, [allChartData])

  const computedStats = useMemo(() => computeStats(allChartData), [allChartData])
  const backtestStats = computedStats

  // - Horizon comparison data (all 4 combos) -
  const horizonComparison = useMemo(() => {
    if (!quantData) return null
    const get = (key: keyof QuantData): BacktestBundle | undefined => {
      const v = quantData[key]
      if (!v || typeof v !== 'object' || !('chart' in v)) return undefined
      return v as BacktestBundle
    }
    return {
      short_1y: computeStats(get('backtest_short_1y')?.chart ?? []),
      short_6m: computeStats(get('backtest_short_6m')?.chart ?? []),
      long_1y:  computeStats(get('backtest_long_1y')?.chart  ?? []),
      long_6m:  computeStats(get('backtest_long_6m')?.chart  ?? []),
    }
  }, [quantData])

  const efficientFrontierPoints = quantData?.efficient_frontier ?? []

  // - Strategy Sandbox Calculation Memos -
  const handleSelectPreset = useCallback((presetKey: string) => {
    if (STRATEGY_PRESETS[presetKey]) {
      setActivePreset(presetKey)
      setStrategyConfig(STRATEGY_PRESETS[presetKey])
    }
  }, [])

  const handleConfigChange = useCallback((newCfg: StrategyRuleConfig) => {
    setActivePreset(null)
    setStrategyConfig(newCfg)
  }, [])

  const filteredMatches = useMemo(() => {
    return filterUniverse(marketStocks, strategyConfig)
  }, [marketStocks, strategyConfig])

  const sandboxResult: StrategyBacktestResult = useMemo(() => {
    return simulateStrategy(history, strategyConfig)
  }, [history, strategyConfig])

  // Generate monthly return matrix from active backtest chart data
  const monthlyReturnsMatrix = useMemo(() => {
    if (!activeBacktest?.chart?.length) return []
    const chart = activeBacktest.chart
    const byYearMonth: Record<string, number[]> = {}
    
    for (let i = 1; i < chart.length; i++) {
      const dateStr = chart[i].date
      const yearMonth = dateStr.substring(0, 7)
      const ret = (chart[i].portfolio / chart[i - 1].portfolio) - 1
      if (!byYearMonth[yearMonth]) byYearMonth[yearMonth] = []
      byYearMonth[yearMonth].push(ret)
    }
    
    const yearsSet = new Set<string>()
    const monthlyData: Record<string, Record<number, number>> = {}
    
    Object.entries(byYearMonth).forEach(([ym, rets]) => {
      const [year, monthStr] = ym.split('-')
      const month = parseInt(monthStr, 10)
      const compRet = rets.reduce((acc, r) => acc * (1 + r), 1) - 1
      yearsSet.add(year)
      if (!monthlyData[year]) monthlyData[year] = {}
      monthlyData[year][month] = compRet * 100
    })
    
    return Array.from(yearsSet).sort().reverse().map(year => ({
      year,
      months: monthlyData[year] || {},
      total: Object.values(monthlyData[year] || {}).reduce((acc, r) => acc + r, 0)
    }))
  }, [activeBacktest])

  // Custom tooltip that also shows holdings for the hovered date
  const renderBacktestTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    const holding = holdings.find(h => label >= h.from && label < h.to)
    return (
      <div style={{ ...getRechartsTooltipStyle(isDark), minWidth: 180 }}>
        <p className="text-[12px] font-medium mb-1" style={{ color: 'var(--text-3)' }}>{label}</p>
        {payload.map((p: any) => (
          <p key={p.dataKey} className="text-xs" style={{ color: p.color }}>
            {p.name}: <strong>{typeof p.value === 'number' ? p.value.toFixed(2) : p.value}</strong>
          </p>
        ))}
        {holding && holding.tickers.length > 0 && (
          <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
            <p className="text-[12px] font-medium mb-1" style={{ color: 'var(--text-3)' }}>Holdings</p>
            <div className="flex flex-wrap gap-1">
              {holding.tickers.map(t => (
                <span key={t} className="text-[12px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'var(--brand-soft)', color: 'var(--brand-light)' }}>
                  {t.replace('.NS', '')}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  if (loading) {
    return <div className="p-8 text-center" style={{ color: 'var(--text-3)' }}>Loading Quant Lab...</div>
  }

  // Show loading state if walk-forward backtests are absent (new run needed)
  const hasWfData = quantData?.backtest_short_1y || quantData?.backtest_short_6m ||
    quantData?.backtest_long_1y || quantData?.backtest_long_6m

  if (!quantData || (!quantData.backtest?.chart?.length && !hasWfData)) {
    return (
      <div className="p-8 text-center card" style={{ borderRadius: 'var(--radius-lg)' }}>
        <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text)' }}>Awaiting Scan History</h3>
        <p style={{ color: 'var(--text-2)' }}>{quantError || 'Recorded history is required for backtesting and portfolio optimization.'}</p>
      </div>
    )
  }

  const max_sharpe = quantData.model_portfolios?.max_sharpe || {}
  const min_volatility = quantData.model_portfolios?.min_volatility || {}
  const risk_parity = quantData.model_portfolios?.risk_parity || {}

  return (
    <div className="space-y-5">
      {/* Top View Mode Switcher: Standard Models vs Interactive Strategy Sandbox */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)]">
        <div className="flex items-center gap-2.5 px-1">
          <Flask size={20} weight="regular" className="text-[var(--brand)]" />
          <div>
            <span className="text-xs font-semibold block" style={{ color: 'var(--text)' }}>
              Quantitative Studio
            </span>
            <span className="text-[12px] block" style={{ color: 'var(--text-3)' }}>
              {activeLabView === 'standard' ? 'Model portfolios, factor performance, and market conditions' : 'Build and test a strategy with your own rules'}
            </span>
          </div>
        </div>
        <SegmentedControl
          value={activeLabView}
          onChange={(v: any) => setActiveLabView(v)}
          options={[
            { key: 'standard', label: 'Models & factors' },
            { key: 'sandbox', label: 'Strategy builder' },
          ]}
        />
      </div>

      {activeLabView === 'sandbox' ? (
        <div className="space-y-5">
          <StrategyBuilderDrawer
            config={strategyConfig}
            onChange={handleConfigChange}
            activePreset={activePreset}
            onSelectPreset={handleSelectPreset}
            matchingCount={filteredMatches.length}
            totalUniverseCount={marketStocks.length || 560}
          />
          <StrategyTearSheet
            result={sandboxResult}
            isDark={isDark}
            onSelectTicker={onSelect}
          />
        </div>
      ) : (
        <>
          {/* Header row: description + regime */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <GlassCard className="lg:col-span-2">
              <GlassCardHeader
                icon={Flask}
                title="Quant Lab Overview"
                badge={<span className="typo-caption text-[var(--text-3)]">Last calculated: {quantData.last_updated}</span>}
              />
              <GlassCardContent className="p-5 flex items-start gap-4">
                <p className="typo-body leading-relaxed" style={{ color: 'var(--text-2)' }}>
                  Backtest historical models, optimize portfolio allocations using Markowitz mean-variance theory, and monitor factor tilts across market regimes.
                </p>
              </GlassCardContent>
            </GlassCard>

        {quantData.market_regime && (
          <GlassCard>
            <GlassCardHeader
              icon={ShieldCheck}
              iconColor={quantData.market_regime.score >= 4 ? 'var(--green)' : quantData.market_regime.score <= 1 ? 'var(--red)' : 'var(--amber)'}
              title="Market Regime"
              tooltipId="quant.regime"
            />
            <GlassCardContent className="p-5 flex flex-col items-center text-center gap-2">
              <div className="typo-h2 font-semibold" style={{ color: 'var(--text)' }}>
                {quantData.market_regime.score >= 4 ? 'Risk-On (Bull)' : quantData.market_regime.score <= 1 ? 'Risk-Off (Bear)' : 'Neutral Regime'}
              </div>
              <div className="grid grid-cols-3 gap-3 w-full mt-1">
                <div>
                  <div className="typo-eyebrow flex items-center justify-center gap-0.5">Score<InfoTooltip id="quant.regime" /></div>
                  <div className="typo-num-sm font-semibold mt-0.5" style={{ color: 'var(--text)' }}>{quantData.market_regime.score}/5</div>
                </div>
                <div>
                  <div className="typo-eyebrow flex items-center justify-center gap-0.5">Breadth<InfoTooltip id="quant.breadth" /></div>
                  <div className="typo-num-sm font-semibold mt-0.5" style={{ color: 'var(--text)' }}>{quantData.market_regime.breadth.toFixed(1)}%</div>
                </div>
                <div>
                  <div className="typo-eyebrow flex items-center justify-center gap-0.5">VIX<InfoTooltip id="quant.vix" /></div>
                  <div className="typo-num-sm font-semibold mt-0.5" style={{ color: 'var(--text)' }}>{quantData.market_regime.vix.toFixed(1)}</div>
                </div>
              </div>
            </GlassCardContent>
          </GlassCard>
        )}
      </div>

      {/* Stat cards */}
      {backtestStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-5">
          {[
            { icon: <TrendUp size={14} />, label: backtestModel === 'long' ? `CAGR (Long ${backtestHorizon.toUpperCase()})` : `CAGR (Short ${backtestHorizon.toUpperCase()})`, tooltipId: 'quant.cagr', value: `${backtestStats.cagr >= 0 ? '+' : ''}${backtestStats.cagr.toFixed(2)}%`, color: backtestStats.cagr >= 0 ? 'var(--green)' : 'var(--red)' },
            { icon: <ChartLineDown size={14} />, label: 'Ann. Volatility', tooltipId: 'quant.volatility', value: `${backtestStats.volatility.toFixed(1)}%`, color: backtestStats.volatility <= 20 ? 'var(--green)' : 'var(--amber)' },
            { icon: <Target size={14} />, label: 'Sharpe Ratio', tooltipId: 'quant.sharpe', value: backtestStats.sharpe.toFixed(2), color: backtestStats.sharpe >= 1 ? 'var(--green)' : 'var(--text)' },
            { icon: <Warning size={14} />, label: 'Max Drawdown', tooltipId: 'quant.maxdd', value: `${backtestStats.max_drawdown.toFixed(2)}%`, color: 'var(--red)' },
          ].map(stat => (
            <div key={stat.label} className="card card-hover overflow-hidden">
              <div className="section-band flex items-center gap-1.5">
                {stat.icon}<span className="typo-caption font-semibold" style={{ color: 'var(--text-2)' }}>{stat.label}</span><InfoTooltip id={stat.tooltipId} />
              </div>
              <div className="p-4 typo-display font-semibold" style={{ color: stat.color }}>{stat.value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Left: Backtest + Portfolios */}
        <div className="lg:col-span-2 space-y-5">

          {/* Backtest chart */}
          <GlassCard>
            <GlassCardHeader
              icon={TrendUp}
              title="Strategy Backtest | Top 10 Equal Weight"
              tooltipId="quant.backtest"
              action={
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                  <SegmentedControl
                    options={[
                      { key: 'short', label: 'Short-Term' },
                      { key: 'long',  label: 'Long-Term (1M to 6M)' },
                    ]}
                    value={backtestModel}
                    onChange={(v) => setBacktestModel(v as 'short' | 'long')}
                  />
                  <SegmentedControl
                    options={[
                      { key: '1y', label: '1 Year' },
                      { key: '6m', label: '6 Months' },
                    ]}
                    value={backtestHorizon}
                    onChange={(v) => setBacktestHorizon(v as '1y' | '6m')}
                  />
                  <button
                    onClick={() => {
                      if (windowedChart && windowedChart.length > 0) {
                        exportToCSV(
                          `QuantAlpha_Backtest_${backtestModel}_${backtestHorizon}_${new Date().toISOString().slice(0, 10)}.csv`,
                          windowedChart.map(pt => ({
                            Date: pt.date,
                            Portfolio_Index: pt.portfolio,
                            Benchmark_Index: pt.benchmark,
                          }))
                        )
                      }
                    }}
                    className="btn-glass"
                    title="Export equity curve data to CSV"
                  >
                    <DownloadSimple size={13} />
                    <span className="hidden sm:inline">Export CSV</span>
                  </button>
                </div>
              }
            />
            <GlassCardContent className="p-5 space-y-4">
            {!activeBacktest?.chart?.length && (
              <div className="px-5 py-2 text-[12px]" style={{ background: 'var(--amber-bg)', borderBottom: '1px solid var(--glass-border)', color: 'var(--amber)' }}>
                {activeBacktest?.error || 'Walk-forward backtest data is not yet available for this model.'}
              </div>
            )}
            <div className="p-5" style={{ height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={windowedChart} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="date" stroke="var(--border)" tick={{ fill: 'var(--text-3)', fontSize: 12, fontFamily: 'var(--font-ui)' }} tickMargin={10} minTickGap={30} />
                  <YAxis stroke="var(--border)" tick={{ fill: 'var(--text-3)', fontSize: 12, fontFamily: 'var(--font-ui)' }} domain={['auto', 'auto']} tickFormatter={(v) => typeof v === 'number' ? v.toFixed(1) : v} />
                  <Tooltip content={renderBacktestTooltip} />
                  <Legend verticalAlign="top" height={30} align="right" wrapperStyle={{ fontFamily: 'var(--font-ui)', fontSize: '12px', color: 'var(--text-3)' }} />
                  <ReferenceLine y={100} stroke="var(--border)" strokeDasharray="4 4" />
                  <Line type="monotone" dataKey="portfolio" name={backtestModel === 'long' ? 'Long Horizon Picks' : 'Alpha Picks'} stroke={backtestModel === 'long' ? 'var(--green)' : 'var(--brand)'} strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
                  <Line type="monotone" dataKey="benchmark" name="NIFTY 50" stroke="var(--text-3)" strokeWidth={1.5} dot={false} strokeDasharray="5 5" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Holdings Log toggle */}
            {holdings.length > 0 && (
              <div style={{ borderTop: '1px solid var(--glass-border)' }}>
                <button
                  onClick={() => setShowHoldings(h => !h)}
                  className="w-full px-5 py-2.5 text-[12px] font-medium flex items-center justify-between transition-colors"
                  style={{ color: 'var(--text-3)', background: 'transparent' }}
                >
                  <span className="typo-caption">Holdings Log (Rebalance History)</span>
                  <span style={{ color: 'var(--text-4)' }}>{showHoldings ? '▲ Hide' : '▼ Show'}</span>
                </button>
                {showHoldings && (
                  <div className="px-5 pb-4 overflow-x-auto scrollbar-none">
                    <table className="w-full text-[12px]" style={{ borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                          <th className="typo-table-head py-2 pr-4 text-left whitespace-nowrap">From</th>
                          <th className="typo-table-head py-2 pr-4 text-left whitespace-nowrap">To</th>
                          <th className="typo-table-head py-2 text-left">Top-10 Holdings (Equal Weight)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...holdings].reverse().map(h => (
                          <tr key={h.from} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td className="py-2 pr-4 font-mono whitespace-nowrap" style={{ color: 'var(--text-2)' }}>{h.from}</td>
                            <td className="py-2 pr-4 font-mono whitespace-nowrap" style={{ color: 'var(--text-2)' }}>{h.to}</td>
                            <td className="py-2">
                              <div className="flex flex-wrap gap-1">
                                {h.tickers.map(t => (
                                  <button
                                    key={t}
                                    onClick={() => onSelect(t)}
                                    className="ticker-chip--link text-[12px] px-1.5 py-0.5 rounded font-medium transition-opacity"
                                    style={{ background: 'var(--brand-soft)', color: 'var(--brand-light)', border: 'none', cursor: 'pointer' }}
                                  >
                                    {t.replace('.NS', '')}
                                  </button>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Horizon Comparison Table */}
            {horizonComparison && (
              <div style={{ borderTop: '1px solid var(--glass-border)' }}>
                <div className="section-band flex items-center gap-2">
                  <ArrowsLeftRight size={14} style={{ color: 'var(--brand)' }} />
                  <span className="typo-h3">Horizon Comparison</span>
                  <InfoTooltip id="quant.horizon-comparison" />
                </div>
                <div className="px-5 pb-5 overflow-x-auto scrollbar-none">
                  <table className="w-full text-[12px]" style={{ borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <th className="typo-table-head py-2 pr-5 text-left">Model</th>
                        <th className="typo-table-head py-2 pr-4 text-right whitespace-nowrap">1Y CAGR</th>
                        <th className="typo-table-head py-2 pr-4 text-right whitespace-nowrap">1Y Sharpe</th>
                        <th className="typo-table-head py-2 pr-4 text-right whitespace-nowrap">1Y MaxDD</th>
                        <th className="typo-table-head py-2 pr-4 text-right whitespace-nowrap">6M CAGR</th>
                        <th className="typo-table-head py-2 pr-4 text-right whitespace-nowrap">6M Sharpe</th>
                        <th className="typo-table-head py-2 text-right whitespace-nowrap">6M MaxDD</th>
                      </tr>
                    </thead>
                    <tbody>
                      {([
                        { label: 'Short-term (Alpha)', s1y: horizonComparison.short_1y, s6m: horizonComparison.short_6m, accent: 'var(--brand)' },
                        { label: 'Long Horizon', s1y: horizonComparison.long_1y, s6m: horizonComparison.long_6m, accent: 'var(--green)' },
                      ] as const).map(row => (
                        <tr key={row.label} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td className="py-2.5 pr-5 font-medium" style={{ color: row.accent }}>{row.label}</td>
                          {/* 1Y */}
                          {['cagr', 'sharpe', 'max_drawdown'].map((metric) => {
                            const val = row.s1y ? (row.s1y as any)[metric] : null
                            const isCAGR = metric === 'cagr'
                            const isMDD  = metric === 'max_drawdown'
                            const color  = val == null ? 'var(--text-3)' : isCAGR ? (val >= 0 ? 'var(--green)' : 'var(--red)') : isMDD ? 'var(--red)' : val >= 1 ? 'var(--green)' : 'var(--text)'
                            return (
                              <td key={metric} className="py-2.5 pr-4 text-right font-medium" style={{ color }}>
                                {val == null ? 'N/A' : isCAGR ? `${val >= 0 ? '+' : ''}${val.toFixed(2)}%` : isMDD ? `${val.toFixed(2)}%` : val.toFixed(2)}
                              </td>
                            )
                          })}
                          {/* 6M */}
                          {['cagr', 'sharpe', 'max_drawdown'].map((metric) => {
                            const val = row.s6m ? (row.s6m as any)[metric] : null
                            const isCAGR = metric === 'cagr'
                            const isMDD  = metric === 'max_drawdown'
                            const color  = val == null ? 'var(--text-3)' : isCAGR ? (val >= 0 ? 'var(--green)' : 'var(--red)') : isMDD ? 'var(--red)' : val >= 1 ? 'var(--green)' : 'var(--text)'
                            return (
                              <td key={metric} className="py-2.5 pr-4 text-right font-medium" style={{ color }}>
                                {val == null ? 'N/A' : isCAGR ? `${val >= 0 ? '+' : ''}${val.toFixed(2)}%` : isMDD ? `${val.toFixed(2)}%` : val.toFixed(2)}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Monthly Returns Tear-Sheet Matrix */}
            {monthlyReturnsMatrix.length > 0 && (
              <div style={{ borderTop: '1px solid var(--glass-border)' }}>
                <div className="section-band flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <GridFour size={14} style={{ color: 'var(--blue)' }} />
                    <span className="typo-h3">Monthly strategy returns (%)</span>
                  </div>
                  <span className="text-[12px] font-mono" style={{ color: 'var(--text-3)' }}>Walk-Forward Performance</span>
                </div>
                <div className="px-5 pb-5 overflow-x-auto scrollbar-none">
                  <table className="w-full text-[12px] text-center" style={{ borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <th className="py-2 pr-3 text-left typo-table-head">Year</th>
                        {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map(m => (
                          <th key={m} className="py-2 px-1 typo-table-head text-center">{m}</th>
                        ))}
                        <th className="py-2 pl-3 text-right typo-table-head">YTD</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyReturnsMatrix.map(r => (
                        <tr key={r.year} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td className="py-2 pr-3 text-left font-mono font-semibold" style={{ color: 'var(--text)' }}>{r.year}</td>
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => {
                            const val = r.months[m]
                            const bg = val == null ? 'transparent' : val > 0 ? `rgba(16, 185, 129, ${Math.min(0.4, Math.abs(val) / 25)})` : `rgba(239, 68, 68, ${Math.min(0.4, Math.abs(val) / 25)})`
                            const color = val == null ? 'var(--text-3)' : val > 0 ? 'var(--green)' : 'var(--red)'
                            return (
                              <td key={m} className="py-2 px-1 font-mono font-medium rounded" style={{ background: bg, color }}>
                                {val == null ? 'N/A' : `${val >= 0 ? '+' : ''}${val.toFixed(1)}`}
                              </td>
                            )
                          })}
                          <td className="py-2 pl-3 text-right font-mono font-semibold" style={{ color: r.total >= 0 ? 'var(--green)' : 'var(--red)' }}>
                            {r.total >= 0 ? '+' : ''}{r.total.toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            </GlassCardContent>
          </GlassCard>

          {/* Model Portfolios */}
          <ModelPortfoliosCard
            maxSharpe={max_sharpe}
            minVolatility={min_volatility}
            riskParity={risk_parity}
            onSelectTicker={onSelect}
          />

          {/* Markowitz Efficient Frontier */}
          <EfficientFrontierCard points={efficientFrontierPoints} isDark={isDark} />

          {/* Monte Carlo Simulation */}
          <GlassCard>
            <GlassCardHeader
              icon={Lightning}
              title="Monte Carlo Simulation"
              badge={<span className="text-[12px]  font-mono px-2 py-0.5 rounded" style={{ background: 'var(--brand-soft)', color: 'var(--brand-light)' }}>1,000 Paths</span>}
            />
            <GlassCardContent className="p-5">
              <MonteCarloChart cagr={backtestStats?.cagr || 15} volatility={backtestStats?.volatility || 18} isDark={isDark} />
            </GlassCardContent>
          </GlassCard>

          {/* Macro Scenario Stress-Testing */}
          <ScenarioStressCard scenarios={quantData.scenario_stress_tests || []} />
        </div>

        {/* Right column */}
        <div className="space-y-5">

          {/* Factor Exposures */}
          <GlassCard>
            <GlassCardHeader
              icon={Crosshair}
              iconColor="var(--green)"
              title="Portfolio Factor Exposure"
              tooltipId="quant.factor.value"
            />
            <GlassCardContent className="p-5" style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={radarData} layout="vertical" margin={{ top: 0, right: 10, left: 20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" horizontal={false} vertical={true} />
                  <XAxis type="number" domain={[0, 100]} stroke="var(--border)" tick={{ fill: 'var(--text-3)', fontSize: 12, fontFamily: 'var(--font-ui)' }} />
                  <YAxis dataKey="subject" type="category" stroke="var(--border)" tick={{ fontSize: 12, fill: 'var(--text-2)', fontFamily: 'var(--font-ui)' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={getRechartsTooltipStyle(isDark)} cursor={{ fill: 'var(--surface-2)' }} />
                  <Bar dataKey="A" name="Exposure" fill="var(--green)" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </GlassCardContent>
            <GlassCardFooter className="typo-caption text-center px-4 pb-4 leading-relaxed text-[var(--text-3)] border-none">
              Percentile rank of top picks against screened universe.
            </GlassCardFooter>
          </GlassCard>

          {/* Sector Allocation */}
          {quantData.sector_allocation && (
            <GlassCard>
              <GlassCardHeader
                icon={ChartPieSlice}
                iconColor="var(--blue)"
                title="Sector Allocation"
                tooltipId="quant.sector"
              />
              <GlassCardContent className="px-5 pt-3" style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={Object.entries(quantData.sector_allocation).map(([name, value]) => ({ name, value }))}
                      cx="50%" cy="50%"
                      innerRadius={55} outerRadius={75}
                      paddingAngle={2} dataKey="value"
                    >
                      {Object.entries(quantData.sector_allocation).map((_entry, index) => {
                        const colors = ['var(--chart-teal)', 'var(--chart-blue)', 'var(--chart-purple)', 'var(--chart-pink)', 'var(--chart-orange)', 'var(--green)', 'var(--chart-teal)', 'var(--chart-indigo)', 'var(--chart-purple)', 'var(--chart-pink)']
                        return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                      })}
                    </Pie>
                    <Tooltip contentStyle={getRechartsTooltipStyle(isDark)} formatter={(value: any) => `${Number(value).toFixed(1)}%`} />
                  </PieChart>
                </ResponsiveContainer>
              </GlassCardContent>
              <GlassCardFooter className="flex flex-wrap gap-x-3 gap-y-1.5 justify-center px-4 pb-4 border-none">
                {Object.entries(quantData.sector_allocation).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, val], i) => {
                  const colors = ['var(--chart-teal)', 'var(--chart-blue)', 'var(--chart-purple)', 'var(--chart-pink)', 'var(--chart-orange)', 'var(--green)', 'var(--chart-teal)', 'var(--chart-indigo)', 'var(--chart-purple)', 'var(--chart-pink)']
                  return (
                    <div key={name} className="flex items-center gap-1.5 typo-caption" style={{ color: 'var(--text-2)' }}>
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: colors[i % colors.length] }} />
                      {name} ({val}%)
                    </div>
                  )
                })}
              </GlassCardFooter>
            </GlassCard>
          )}

          {/* Correlation Matrix */}
          {quantData.correlation_matrix && quantData.correlation_matrix.labels.length > 0 && (
            <CorrelationHeatmapCard
              correlationMatrix={quantData.correlation_matrix}
              isDark={isDark}
              onSelectTicker={onSelect}
            />
          )}

          {/* Factor Information Coefficient (IC) Monitor */}
          <FactorICMonitorCard factorIcs={quantData.factor_ic_monitor || []} />

          </div>
        </div>

        

      {/* ===============================================================
          BACKTEST ARCHIVE  (auto-updated every Saturday by scheduler)
      =============================================================== */}
      <div className="card card-hover overflow-hidden">

        {/* Header */}
        <div className="section-band flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-1.5 shrink-0" style={{ background: 'var(--green-bg)', borderRadius: 'var(--radius)' }}>
              <ClockCounterClockwise size={16} weight="regular" style={{ color: 'var(--green)' }} />
            </div>
            <div>
              <span className="typo-h2">Backtest Archive</span>
              <p className="typo-caption mt-0.5" style={{ color: 'var(--text-3)' }}>
                Auto-updated every Saturday | {cachedRuns.length} snapshot{cachedRuns.length !== 1 ? 's' : ''} stored
              </p>
            </div>
          </div>
          <button
            onClick={() => loadRunIndex()}
            className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg transition-all"
            style={{ background: 'var(--glass-bg-subtle)', border: '1px solid var(--glass-border)', color: 'var(--text-3)', cursor: 'pointer' }}
          >
            <ArrowClockwise size={12} className={runsLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* Archive table / empty state */}
        {cachedRuns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-6">
            <div className="p-4 rounded-full mb-4" style={{ background: 'var(--glass-bg-subtle)' }}>
              <ClockCounterClockwise size={24} style={{ color: 'var(--text-4)' }} />
            </div>
            <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-2)' }}>No backtest snapshots yet</p>
            <p className="text-[12px] max-w-sm leading-relaxed" style={{ color: 'var(--text-3)' }}>
              The scheduler runs automatically every Saturday at 8 AM IST and stores a dated snapshot here.
              The first results will appear after the next Saturday.
            </p>
          </div>
        ) : (
          <div className="p-4">
            {/* Group by date: show each date as a row of 4 model/horizon chips */}
            {(() => {
              const byDate = new Map<string, BacktestRunMeta[]>()
              for (const run of [...cachedRuns].sort((a, b) => b.as_of_date.localeCompare(a.as_of_date))) {
                const arr = byDate.get(run.as_of_date) ?? []
                arr.push(run)
                byDate.set(run.as_of_date, arr)
              }
              return Array.from(byDate.entries()).map(([date, runs]) => (
                <div key={date} className="mb-3">
                  <p className="text-[12px] font-mono font-semibold mb-2 px-1" style={{ color: 'var(--text-3)' }}>
                    {date}
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(['short-1y', 'short-6m', 'long-1y', 'long-6m'] as const).map(key => {
                      const [model, horizon] = key.split('-') as ['short' | 'long', '1y' | '6m']
                      const run = runs.find(r => r.model === model && r.horizon === horizon)
                      const slug = `${model}-${horizon}-${date}`
                      const isSelected = selectedSlug === slug
                      const modelColor = model === 'short' ? 'var(--brand)' : 'var(--green)'
                      const modelBg    = model === 'short' ? 'var(--brand-soft)' : 'var(--green-bg)'
                      const cagr  = run?.stats?.cagr
                      const sharpe = run?.stats?.sharpe
                      return (
                        <button
                          key={key}
                          onClick={() => run && (isSelected ? setSelectedSlug(null) : loadRunData(slug))}
                          disabled={!run}
                          className="rounded-xl px-3 py-3 text-left transition-all"
                          style={{
                            background: isSelected ? 'var(--glass-bg-subtle)' : 'var(--glass-bg)',
                            border: `1px solid ${isSelected ? 'var(--glass-border-strong)' : 'var(--glass-border)'}`,
                            cursor: run ? 'pointer' : 'default',
                            opacity: run ? 1 : 0.35,
                          }}
                        >
                          <div className="flex items-center gap-1.5 mb-2">
                            <span className="text-[12px] px-1.5 py-0.5 rounded font-medium" style={{ background: modelBg, color: modelColor }}>
                              {model === 'short' ? 'Short' : 'Long'}
                            </span>
                            <span className="text-[12px] font-mono font-semibold" style={{ color: 'var(--text-3)' }}>
                              {horizon.toUpperCase()}
                            </span>
                          </div>
                          {run ? (
                            <>
                              <p className="text-sm font-semibold tabular-nums leading-tight" style={{ color: typeof cagr === 'number' && cagr >= 0 ? 'var(--green)' : 'var(--red)' }}>
                                {typeof cagr === 'number' ? `${cagr >= 0 ? '+' : ''}${cagr.toFixed(1)}%` : 'N/A'}
                              </p>
                              <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-3)' }}>
                                CAGR / Sharpe {typeof sharpe === 'number' ? sharpe.toFixed(2) : 'N/A'}
                              </p>
                            </>
                          ) : (
                            <p className="text-[12px]" style={{ color: 'var(--text-4)' }}>Pending</p>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))
            })()}
          </div>
        )}

        {/* Expanded selected run chart */}
        {selectedSlug && (
          <div style={{ borderTop: '1px solid var(--glass-border)' }}>
            <div className="px-5 py-3 flex items-center gap-2 text-xs font-medium" style={{ color: 'var(--text-2)', borderBottom: '1px solid var(--glass-border)' }}>
              <TrendUp size={13} style={{ color: 'var(--green)' }} />
              Run Detail: <span className="font-mono" style={{ color: 'var(--text-3)' }}>{selectedSlug}</span>
            </div>

            {runDataLoading ? (
              <div className="p-8 text-center text-[12px]" style={{ color: 'var(--text-3)' }}>Loading run data…</div>
            ) : selectedRunData ? (
              <div className="p-5 space-y-4">
                {/* Stat chips */}
                <div className="flex flex-wrap gap-3">
                  {([
                    { label: 'CAGR', val: selectedRunData.stats?.cagr, fmt: (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`, color: (v: number) => v >= 0 ? 'var(--green)' : 'var(--red)' },
                    { label: 'Total Return', val: selectedRunData.stats?.total_return, fmt: (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`, color: (v: number) => v >= 0 ? 'var(--green)' : 'var(--red)' },
                    { label: 'Sharpe', val: selectedRunData.stats?.sharpe, fmt: (v: number) => v.toFixed(2), color: (v: number) => v >= 1 ? 'var(--green)' : v >= 0.5 ? 'var(--amber)' : 'var(--text-2)' },
                    { label: 'Volatility', val: selectedRunData.stats?.volatility, fmt: (v: number) => `${v.toFixed(1)}%`, color: () => 'var(--text-2)' },
                    { label: 'Max Drawdown', val: selectedRunData.stats?.max_drawdown, fmt: (v: number) => `${v.toFixed(1)}%`, color: () => 'var(--red)' },
                    { label: 'Info Ratio', val: selectedRunData.stats?.info_ratio, fmt: (v: number) => v.toFixed(2), color: (v: number) => v >= 0.5 ? 'var(--green)' : 'var(--text-2)' },
                  ] as const).map(stat => (
                    typeof stat.val === 'number' && (
                      <div key={stat.label} className="px-3 py-2 rounded-lg" style={{ background: 'var(--glass-bg-subtle)', border: '1px solid var(--glass-border)' }}>
                        <p className="text-[12px]" style={{ color: 'var(--text-3)' }}>{stat.label}</p>
                        <p className="text-sm font-semibold tabular-nums" style={{ color: stat.color(stat.val) }}>{stat.fmt(stat.val)}</p>
                      </div>
                    )
                  ))}
                </div>
                {/* Chart */}
                {selectedChart.length > 0 && (
                  <div style={{ height: 260 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={selectedChart} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                        <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
                        <XAxis dataKey="date" stroke="var(--border)" tick={{ fill: 'var(--text-3)', fontSize: 12, fontFamily: 'var(--font-ui)' }} tickMargin={8} minTickGap={30} />
                        <YAxis stroke="var(--border)" tick={{ fill: 'var(--text-3)', fontSize: 12, fontFamily: 'var(--font-ui)' }} domain={['auto', 'auto']} tickFormatter={v => typeof v === 'number' ? v.toFixed(0) : v} />
                        <Tooltip contentStyle={getRechartsTooltipStyle(isDark)} />
                        <Legend verticalAlign="top" height={28} align="right" wrapperStyle={{ fontSize: '12px', color: 'var(--text-3)', fontFamily: 'var(--font-ui)' }} />
                        <ReferenceLine y={100} stroke="var(--border)" strokeDasharray="4 4" />
                        <Line type="monotone" dataKey="portfolio" name={selectedRunData.model === 'long' ? 'Long Horizon' : 'Alpha Picks'} stroke={selectedRunData.model === 'long' ? 'var(--green)' : 'var(--brand)'} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                        <Line type="monotone" dataKey="benchmark" name="NIFTY 50" stroke="var(--text-3)" strokeWidth={1.5} dot={false} strokeDasharray="5 5" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* ===============================================================
          BACKTEST METHODOLOGY AND RESULTS
          Full-width section at the bottom of Quant Lab
      =============================================================== */}
      <div className="card card-hover overflow-hidden">

        {/* Header */}
        <div className="section-band flex items-center gap-3">
          <div className="p-1.5 shrink-0" style={{ background: 'var(--brand-soft)', borderRadius: 'var(--radius)' }}>
            <BookOpen size={16} weight="regular" style={{ color: 'var(--brand)' }} />
          </div>
          <div>
            <span className="typo-h2">Walk-Forward Backtest Methodology</span>
            <p className="typo-caption mt-0.5" style={{ color: 'var(--text-3)' }}>Historical price strategies and earlier model snapshots. These results do not validate the current five-factor ranking.</p>
          </div>
        </div>

        <div className="p-6 space-y-8">

          {/* - Results Summary grid - */}
          {horizonComparison && (
            <div>
              <p className="section-label mb-3">Backtest Results | Top-10 Equal-Weight Portfolio vs NIFTY 50</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {([
                  {
                    key: 'short', label: 'Short-term Model', subtitle: 'Tech + Momentum signals',
                    color: 'var(--brand)', bg: 'var(--brand-soft)',
                    s1y: horizonComparison.short_1y, s6m: horizonComparison.short_6m,
                  },
                  {
                    key: 'long', label: 'Long-term Model', subtitle: 'Momentum + Low-Vol factors',
                    color: 'var(--green)', bg: 'var(--green-bg)',
                    s1y: horizonComparison.long_1y, s6m: horizonComparison.long_6m,
                  },
                ] as const).map(model => (
                  <div key={model.key} className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--glass-border)', background: 'var(--glass-bg-subtle)' }}>
                    {/* Model header */}
                    <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid var(--glass-border)' }}>
                      <div className="w-2 h-2 rounded-full" style={{ background: model.color }} />
                      <div>
                        <span className="text-xs font-semibold" style={{ color: model.color }}>{model.label}</span>
                        <span className="text-[12px] ml-2" style={{ color: 'var(--text-3)' }}>{model.subtitle}</span>
                      </div>
                    </div>
                    {/* 1Y / 6M columns */}
                    <div className="grid grid-cols-2 divide-x" style={{ borderColor: 'var(--glass-border)' }}>
                      {([{ label: '1 Year', stats: model.s1y }, { label: '6 Months', stats: model.s6m }] as const).map(col => (
                        <div key={col.label} className="p-4">
                          <p className="text-[12px] font-semibold mb-3  tracking-normal" style={{ color: 'var(--text-3)' }}>{col.label}</p>
                          {col.stats ? (
                            <div className="space-y-2.5">
                              {([
                                { label: 'CAGR', value: col.stats.cagr, fmt: (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`, color: col.stats.cagr >= 0 ? 'var(--green)' : 'var(--red)' },
                                { label: 'Total Return', value: col.stats.total_return, fmt: (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`, color: col.stats.total_return >= 0 ? 'var(--green)' : 'var(--red)' },
                                { label: 'Sharpe Ratio', value: col.stats.sharpe, fmt: (v: number) => v.toFixed(2), color: col.stats.sharpe >= 1 ? 'var(--green)' : col.stats.sharpe >= 0.5 ? 'var(--amber)' : 'var(--text-2)' },
                                { label: 'Ann. Volatility', value: col.stats.volatility, fmt: (v: number) => `${v.toFixed(1)}%`, color: 'var(--text-2)' },
                                { label: 'Max Drawdown', value: col.stats.max_drawdown, fmt: (v: number) => `${v.toFixed(1)}%`, color: 'var(--red)' },
                                { label: 'Info. Ratio', value: col.stats.info_ratio, fmt: (v: number) => v.toFixed(2), color: col.stats.info_ratio >= 0.5 ? 'var(--green)' : 'var(--text-2)' },
                                { label: 'Daily Win Rate', value: col.stats.win_rate, fmt: (v: number) => `${v.toFixed(1)}%`, color: col.stats.win_rate >= 52 ? 'var(--green)' : 'var(--text-2)' },
                              ] as const).map(row => (
                                <div key={row.label} className="flex items-center justify-between">
                                  <span className="text-[12px]" style={{ color: 'var(--text-3)' }}>{row.label}</span>
                                  <span className="text-[12px] font-semibold tabular-nums" style={{ color: row.color }}>{row.fmt(row.value)}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[12px]" style={{ color: 'var(--text-4)' }}>No data</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Benchmark note */}
              <p className="text-[12px] mt-3 flex items-start gap-1.5" style={{ color: 'var(--text-3)' }}>
                <Info size={12} className="shrink-0 mt-0.5" />
                Benchmark is NIFTY 50 (^NSEI) from the same period. Nifty data coverage may be partial, so benchmark returns are indicative.
                All returns are gross of transaction costs and taxes.
              </p>
            </div>
          )}

          {/* - Divider */}
          <div style={{ height: 1, background: 'var(--glass-border)' }} />

          {/* - Approach - */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

            <div className="space-y-5">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Lightning size={14} weight="regular" style={{ color: 'var(--brand)' }} />
                  <p className="text-xs font-semibold" style={{ color: 'var(--text)' }}>Why Walk-Forward?</p>
                </div>
                <p className="text-[12px] leading-relaxed" style={{ color: 'var(--text-2)' }}>
                  The scanner has only been running since June 2026, so <code className="text-[12px] px-1 py-0.5 rounded" style={{ background: 'var(--surface-3)', color: 'var(--text)' }}>factor_history</code> has just ~25 scan dates, which is insufficient for long-term backtesting.
                  Instead, we replay the scoring engine on <strong style={{ color: 'var(--text)' }}>2 full years</strong> of daily OHLCV data
                  (Jun 2024 → Jul 2026, 519 trading days, 561 tickers), simulating exactly what the model would have said at each historical rebalance date.
                </p>
                <p className="text-[12px] leading-relaxed mt-2" style={{ color: 'var(--text-2)' }}>
                  This is a <strong style={{ color: 'var(--text)' }}>point-in-time, look-ahead-free</strong> test: at each rebalance date, only data
                  available up to that date is used to score stocks. No future information leaks in.
                </p>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <ChartBar size={14} weight="regular" style={{ color: 'var(--green)' }} />
                  <p className="text-xs font-semibold" style={{ color: 'var(--text)' }}>Protocol</p>
                </div>
                <div className="space-y-2">
                  {([
                    { label: 'Rebalance frequency', value: 'Every 20 trading days (~monthly)' },
                    { label: 'Portfolio size', value: 'Top-10 stocks, equal-weight' },
                    { label: 'Selection rule', value: 'Rank all tickers by composite score, take top 10' },
                    { label: 'Universe', value: '~560 NSE-listed stocks in OHLCV database' },
                    { label: '1-Year window', value: 'Simulates last 252 trading days of history' },
                    { label: '6-Month window', value: 'Simulates last 126 trading days of history' },
                    { label: 'Benchmark', value: 'NIFTY 50 (^NSEI) daily returns' },
                    { label: 'Costs', value: 'None modelled (gross returns)' },
                  ] as const).map(row => (
                    <div key={row.label} className="flex items-start gap-2 text-[12px]">
                      <span className="shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full" style={{ background: 'var(--brand)', marginTop: 5 }} />
                      <span style={{ color: 'var(--text-3)' }}>{row.label}:</span>
                      <span className="font-medium" style={{ color: 'var(--text-2)' }}>{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-5">

              {/* Short-term signals */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: 'var(--brand)' }} />
                  <p className="text-xs font-semibold" style={{ color: 'var(--text)' }}>Short-term Model Signals</p>
                  <span className="text-[12px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'var(--brand-soft)', color: 'var(--brand-light)' }}>50% Tech + 50% Momentum</span>
                </div>
                <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--glass-border)' }}>
                  <table className="w-full text-[12px]" style={{ borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'var(--glass-bg-subtle)' }}>
                        <th className="px-3 py-2 text-left font-medium" style={{ color: 'var(--text-3)', borderBottom: '1px solid var(--glass-border)' }}>Signal</th>
                        <th className="px-3 py-2 text-left font-medium" style={{ color: 'var(--text-3)', borderBottom: '1px solid var(--glass-border)' }}>Weight</th>
                        <th className="px-3 py-2 text-left font-medium" style={{ color: 'var(--text-3)', borderBottom: '1px solid var(--glass-border)' }}>Academic basis</th>
                      </tr>
                    </thead>
                    <tbody>
                      {([
                        ['Supertrend (10×3)', '2.0×', 'Trend-following filter'],
                        ['Price vs SMA-200', '2.0×', 'Long-term trend (Faber 2007)'],
                        ['SMA-50 vs SMA-200', '2.0×', 'Golden/Death cross'],
                        ['ADX + ±DI', '2.0×', 'Directional strength'],
                        ['Ichimoku Cloud', '1.5×', 'Kumo breakout filter'],
                        ['MACD crossover', '1.0×', 'Momentum oscillator'],
                        ['RSI (regime-aware)', '1.0×', 'Overbought/oversold'],
                        ['VPT vs EMA-20', '1.0×', 'Volume-price confirmation'],
                        ['Price vs SMA-50', '1.0×', 'Medium-term trend'],
                        ['Momentum 1m/3m/6m/12m', 'Cross-sectional z', 'Jegadeesh & Titman (1993)'],
                      ] as const).map(([sig, wt, basis], i) => (
                        <tr key={sig} style={{ borderBottom: i < 9 ? '1px solid var(--glass-border)' : 'none', background: i % 2 === 0 ? 'transparent' : 'var(--glass-bg-subtle)' }}>
                          <td className="px-3 py-1.5 font-medium" style={{ color: 'var(--text)' }}>{sig}</td>
                          <td className="px-3 py-1.5" style={{ color: 'var(--brand-light)' }}>{wt}</td>
                          <td className="px-3 py-1.5" style={{ color: 'var(--text-3)' }}>{basis}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Long-term signals */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: 'var(--green)' }} />
                  <p className="text-xs font-semibold" style={{ color: 'var(--text)' }}>Long-term Model Signals</p>
                  <span className="text-[12px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'var(--green-bg)', color: 'var(--green)' }}>Cross-sectional percentile rank</span>
                </div>
                <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--glass-border)' }}>
                  <table className="w-full text-[12px]" style={{ borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'var(--glass-bg-subtle)' }}>
                        <th className="px-3 py-2 text-left font-medium" style={{ color: 'var(--text-3)', borderBottom: '1px solid var(--glass-border)' }}>Factor</th>
                        <th className="px-3 py-2 text-left font-medium" style={{ color: 'var(--text-3)', borderBottom: '1px solid var(--glass-border)' }}>Weight</th>
                        <th className="px-3 py-2 text-left font-medium" style={{ color: 'var(--text-3)', borderBottom: '1px solid var(--glass-border)' }}>Academic basis</th>
                      </tr>
                    </thead>
                    <tbody>
                      {([
                        ['12-1m Momentum (JT)', '40%', 'Jegadeesh & Titman (1993)'],
                        ['6m Momentum (skip 1m)', '30%', 'Intermediate momentum'],
                        ['Low Volatility (63d)', '20%', 'Baker, Bradley & Wurgler (2011)'],
                        ['RSI mean-reversion', '10%', 'Overbought penalty gate'],
                      ] as const).map(([factor, wt, basis], i) => (
                        <tr key={factor} style={{ borderBottom: i < 3 ? '1px solid var(--glass-border)' : 'none', background: i % 2 === 0 ? 'transparent' : 'var(--glass-bg-subtle)' }}>
                          <td className="px-3 py-1.5 font-medium" style={{ color: 'var(--text)' }}>{factor}</td>
                          <td className="px-3 py-1.5 font-semibold" style={{ color: 'var(--green)' }}>{wt}</td>
                          <td className="px-3 py-1.5" style={{ color: 'var(--text-3)' }}>{basis}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          </div>

          {/* - Divider */}
          <div style={{ height: 1, background: 'var(--glass-border)' }} />

          {/* - What's included vs not - */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle size={14} weight="regular" style={{ color: 'var(--green)' }} />
                <p className="text-xs font-semibold" style={{ color: 'var(--text)' }}>What this backtest includes</p>
              </div>
              <ul className="space-y-1.5">
                {[
                  'Full 2-year price history from daily_ohlcv (Jun 2024 to Jul 2026)',
                  'Monthly rebalance, equal-weight top-10 portfolio',
                  'Point-in-time scoring without look-ahead bias',
                  'NIFTY 50 as the daily benchmark',
                  'CAGR, Sharpe, Info. Ratio, Max Drawdown, Win Rate',
                  'Cross-sectional momentum z-score normalisation',
                  'Regime-aware RSI thresholds in the tech score',
                  'Volume confirmation via VPT signal',
                ].map(item => (
                  <li key={item} className="flex items-start gap-2 text-[12px]" style={{ color: 'var(--text-2)' }}>
                    <span className="shrink-0 font-mono text-[12px] font-semibold" style={{ color: 'var(--green)', marginTop: 1 }}>[+]</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-3">
                <Prohibit size={14} weight="regular" style={{ color: 'var(--amber)' }} />
                <p className="text-xs font-semibold" style={{ color: 'var(--text)' }}>Known limitations</p>
              </div>
              <ul className="space-y-1.5">
                {[
                  'Fundamental data (P/E, ROE, D/E) not available at historical dates: both models are price-signal based in the replay',
                  'Transaction costs, brokerage, STT, and slippage are not deducted, so live returns will be lower',
                  'Universe is fixed to current ~560 tickers (delisted stocks excluded)',
                  'NIFTY 50 benchmark data may be partial; benchmark returns are indicative only',
                  'Small universe rebalances (< 10 valid stocks) fall back to previous holdings',
                  'Results are in-sample for the price data window; out-of-sample performance is unknown',
                ].map(item => (
                  <li key={item} className="flex items-start gap-2 text-[12px]" style={{ color: 'var(--text-2)' }}>
                    <span className="shrink-0 font-mono text-[12px] font-semibold" style={{ color: 'var(--amber)', marginTop: 1 }}>[-]</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* - Academic references - */}
          <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: 20 }}>
            <p className="section-label mb-3">Methodology &amp; References</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {([
                { ref: 'Jegadeesh & Titman (1993)', detail: 'Returns to Buying Winners and Selling Losers (12-1 cross-sectional momentum).' },
                { ref: 'Fama & French (1992, 1993)', detail: 'Three-factor model: Market, SMB, HML. Foundation for value and size factor weights.' },
                { ref: 'Fama & French (2015)', detail: 'Five-factor model: adds RMW (profitability) and CMA (investment), underpinning Fund Score.' },
                { ref: 'Baker, Bradley & Wurgler (2011)', detail: 'Benchmarks as limits to arbitrage and the low-volatility anomaly.' },
                { ref: 'Frazzini & Pedersen (2014)', detail: 'Betting Against Beta and risk-adjusted returns of low-beta stocks.' },
                { ref: 'Faber (2007)', detail: 'A Quantitative Approach to Tactical Asset Allocation (SMA-200 trend filter).' },
                { ref: 'Novy-Marx (2013)', detail: 'The Other Side of Value: gross profitability as an accounting predictor.' },
                { ref: 'Bernard & Thomas (1989)', detail: 'Post-Earnings Announcement Drift (PEAD/SUE) and earnings surprise momentum.' },
                { ref: 'Piotroski (2000)', detail: 'Value Investing: The Use of Historical Financial Statement Information (F-Score).' },
              ] as const).map(({ ref, detail }) => (
                <div key={ref} className="p-3 rounded-lg" style={{ background: 'var(--glass-bg-subtle)', border: '1px solid var(--glass-border)' }}>
                  <p className="text-[12px] font-semibold mb-1" style={{ color: 'var(--text)' }}>{ref}</p>
                  <p className="text-[12px] leading-relaxed" style={{ color: 'var(--text-3)' }}>{detail}</p>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
      </>
      )}

    </div>
  )
}

import { memo } from 'react'
export default memo(QuantLabTabInner)
