import React, { useEffect, useRef, useState, useMemo, useEffectEvent } from 'react'
import {
  createChart,
  ColorType,
  PriceScaleMode,
  LineStyle,
  CrosshairMode,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
} from 'lightweight-charts'
import type {
  IChartApi,
  ISeriesApi,
  Time,
  CandlestickData,
  HistogramData,
  LineData,
} from 'lightweight-charts'

export interface ChartDataPoint {
  time: string
  open: number | null
  high: number | null
  low: number | null
  close: number | null
  volume: number | null
  sma50: number | null
  sma200: number | null
  rsi: number | null
  macd: number | null
  macd_signal: number | null
  macd_hist: number | null
  bb_upper: number | null
  bb_lower: number | null
  bb_mid: number | null
  bb_pctb: number | null
  supertrend: number | null
  supertrend_dir: number | null
}

interface TradingViewChartProps {
  data: ChartDataPoint[]
  ticker: string
  isDark?: boolean
  height?: number
}

export const TradingViewChart: React.FC<TradingViewChartProps> = ({
  data,
  ticker,
  isDark = true,
  height = 460,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const rsiContainerRef = useRef<HTMLDivElement>(null)
  const macdContainerRef = useRef<HTMLDivElement>(null)

  const dataByTime = useMemo(() => {
    const map = new Map<string, ChartDataPoint>()
    for (const d of data) {
      if (d && d.time) map.set(d.time, d)
    }
    return map
  }, [data])

  const lookupPoint = useEffectEvent((date: string) => dataByTime.get(date))

  // Chart instances
  const mainChartRef = useRef<IChartApi | null>(null)
  const rsiChartRef = useRef<IChartApi | null>(null)
  const macdChartRef = useRef<IChartApi | null>(null)

  // Series references
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const sma50SeriesRef = useRef<ISeriesApi<'Line'> | null>(null)
  const sma200SeriesRef = useRef<ISeriesApi<'Line'> | null>(null)
  const supertrendSeriesRef = useRef<ISeriesApi<'Line'> | null>(null)
  const bbUpperRef = useRef<ISeriesApi<'Line'> | null>(null)
  const bbLowerRef = useRef<ISeriesApi<'Line'> | null>(null)

  const rsiSeriesRef = useRef<ISeriesApi<'Line'> | null>(null)
  const macdLineRef = useRef<ISeriesApi<'Line'> | null>(null)
  const macdSignalRef = useRef<ISeriesApi<'Line'> | null>(null)
  const macdHistRef = useRef<ISeriesApi<'Histogram'> | null>(null)

  // State controls
  const [isLogScale, setIsLogScale] = useState(false)
  const [showSma50, setShowSma50] = useState(true)
  const [showSma200, setShowSma200] = useState(true)
  const [showSupertrend, setShowSupertrend] = useState(true)
  const [showBollinger, setShowBollinger] = useState(false)
  const [showRsi, setShowRsi] = useState(true)
  const [showMacd, setShowMacd] = useState(true)

  // Crosshair HUD state
  const [hudInfo, setHudInfo] = useState<{
    time?: string
    open?: number
    high?: number
    low?: number
    close?: number
    chgPct?: number
    volume?: number
    sma50?: number
    sma200?: number
    supertrend?: number
    rsi?: number
    macd?: number
    macdSignal?: number
    macdHist?: number
  }>({})

  // Theme colors calculation
  const textColor = isDark ? '#94a3b8' : '#475569'
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.06)'
  const crosshairColor = isDark ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)'

  // Dynamic Theme Update Effect (Zero Chart Re-creation, Instant Theme Shift)
  useEffect(() => {
    const layout = { textColor, background: { type: ColorType.Solid, color: 'transparent' } }
    const grid = { vertLines: { color: gridColor }, horzLines: { color: gridColor } }

    try {
      if (mainChartRef.current) {
        mainChartRef.current.applyOptions({
          layout,
          grid,
          rightPriceScale: { borderColor: gridColor },
          crosshair: { vertLine: { color: crosshairColor }, horzLine: { color: crosshairColor } },
        })
      }
      if (rsiChartRef.current) {
        rsiChartRef.current.applyOptions({ layout, grid, rightPriceScale: { borderColor: gridColor } })
      }
      if (macdChartRef.current) {
        macdChartRef.current.applyOptions({ layout, grid, rightPriceScale: { borderColor: gridColor } })
      }
    } catch {
      // Ignore if chart is in process of being unmounted
    }
  }, [isDark, textColor, gridColor, crosshairColor])

  const currentChartSettings = useEffectEvent(() => ({ textColor, gridColor, crosshairColor, isLogScale }))

  // Main Chart Lifecycle Effect
  useEffect(() => {
    if (!containerRef.current) return

    const { textColor, gridColor, crosshairColor, isLogScale } = currentChartSettings()
    let isSubscribed = true

    // 1. Create Main Chart
    const mainChart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: textColor,
        fontSize: 11,
        fontFamily: 'Inter, system-ui, sans-serif',
      },
      grid: {
        vertLines: { color: gridColor },
        horzLines: { color: gridColor },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: crosshairColor, width: 1, style: LineStyle.Dashed },
        horzLine: { color: crosshairColor, width: 1, style: LineStyle.Dashed },
      },
      rightPriceScale: {
        borderColor: gridColor,
        mode: isLogScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
        autoScale: true,
      },
      timeScale: {
        borderColor: gridColor,
        timeVisible: false,
        secondsVisible: false,
      },
    })
    mainChartRef.current = mainChart

    // Main Candlestick Series
    const candleSeries = mainChart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    })
    candleSeriesRef.current = candleSeries

    // Volume Series
    const volumeSeries = mainChart.addSeries(HistogramSeries, {
      color: '#3b82f6',
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    })
    mainChart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    })
    volumeSeriesRef.current = volumeSeries

    // Indicator Overlays
    const sma50Series = mainChart.addSeries(LineSeries, {
      color: '#3b82f6',
      lineWidth: 2,
      title: 'SMA 50',
    })
    sma50SeriesRef.current = sma50Series

    const sma200Series = mainChart.addSeries(LineSeries, {
      color: '#f59e0b',
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      title: 'SMA 200',
    })
    sma200SeriesRef.current = sma200Series

    const supertrendSeries = mainChart.addSeries(LineSeries, {
      color: '#06b6d4',
      lineWidth: 2,
      lineStyle: LineStyle.Dotted,
      title: 'Supertrend',
    })
    supertrendSeriesRef.current = supertrendSeries

    const bbUpper = mainChart.addSeries(LineSeries, {
      color: 'rgba(168, 85, 247, 0.6)',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      title: 'BB Upper',
    })
    bbUpperRef.current = bbUpper

    const bbLower = mainChart.addSeries(LineSeries, {
      color: 'rgba(168, 85, 247, 0.6)',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      title: 'BB Lower',
    })
    bbLowerRef.current = bbLower

    // 2. Create RSI Sub-Chart if enabled
    let rsiChart: IChartApi | null = null
    if (showRsi && rsiContainerRef.current) {
      rsiChart = createChart(rsiContainerRef.current, {
        width: rsiContainerRef.current.clientWidth,
        height: 120,
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: textColor,
          fontSize: 10,
          fontFamily: 'Inter, system-ui, sans-serif',
        },
        grid: { vertLines: { color: gridColor }, horzLines: { color: gridColor } },
        rightPriceScale: { borderColor: gridColor, scaleMargins: { top: 0.1, bottom: 0.1 } },
        timeScale: { visible: false },
      })
      rsiChartRef.current = rsiChart

      const rsiSeries = rsiChart.addSeries(LineSeries, {
        color: '#a855f7',
        lineWidth: 2,
        title: 'RSI(14)',
      })
      rsiSeriesRef.current = rsiSeries

      rsiSeries.createPriceLine({ price: 70, color: 'rgba(239, 68, 68, 0.6)', lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: '70 OB' })
      rsiSeries.createPriceLine({ price: 30, color: 'rgba(34, 197, 94, 0.6)', lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: '30 OS' })
    }

    // 3. Create MACD Sub-Chart if enabled
    let macdChart: IChartApi | null = null
    if (showMacd && macdContainerRef.current) {
      macdChart = createChart(macdContainerRef.current, {
        width: macdContainerRef.current.clientWidth,
        height: 130,
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: textColor,
          fontSize: 10,
          fontFamily: 'Inter, system-ui, sans-serif',
        },
        grid: { vertLines: { color: gridColor }, horzLines: { color: gridColor } },
        rightPriceScale: { borderColor: gridColor, scaleMargins: { top: 0.1, bottom: 0.1 } },
        timeScale: { borderColor: gridColor, visible: true },
      })
      macdChartRef.current = macdChart

      const macdHist = macdChart.addSeries(HistogramSeries, {
        color: '#22c55e',
        priceFormat: { type: 'volume' },
      })
      macdHistRef.current = macdHist

      const macdLine = macdChart.addSeries(LineSeries, {
        color: '#3b82f6',
        lineWidth: 2,
        title: 'MACD',
      })
      macdLineRef.current = macdLine

      const macdSignal = macdChart.addSeries(LineSeries, {
        color: '#f59e0b',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        title: 'Signal',
      })
      macdSignalRef.current = macdSignal
    }

    // Safe Time Scale Synchronizers
    const handleMainTimeChange = (range: any) => {
      if (!isSubscribed || !range) return
      try {
        if (rsiChartRef.current) rsiChartRef.current.timeScale().setVisibleLogicalRange(range)
      } catch {}
      try {
        if (macdChartRef.current) macdChartRef.current.timeScale().setVisibleLogicalRange(range)
      } catch {}
    }

    mainChart.timeScale().subscribeVisibleLogicalRangeChange(handleMainTimeChange)

    if (rsiChart) {
      rsiChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (!isSubscribed || !range) return
        try {
          if (mainChartRef.current) mainChartRef.current.timeScale().setVisibleLogicalRange(range)
        } catch {}
      })
    }

    if (macdChart) {
      macdChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (!isSubscribed || !range) return
        try {
          if (mainChartRef.current) mainChartRef.current.timeScale().setVisibleLogicalRange(range)
        } catch {}
      })
    }

    // Crosshair HUD listener with safety checks
    mainChart.subscribeCrosshairMove((param) => {
      if (!isSubscribed) return
      if (!param || !param.time || param.point === undefined || param.point.x < 0 || param.point.y < 0) {
        setHudInfo({})
        return
      }

      try {
        const rawDate = typeof param.time === 'string' ? param.time : ''
        const candleData = param.seriesData.get(candleSeries) as CandlestickData | undefined
        const volumeData = param.seriesData.get(volumeSeries) as HistogramData | undefined
        const sma50Data = param.seriesData.get(sma50Series) as LineData | undefined
        const sma200Data = param.seriesData.get(sma200Series) as LineData | undefined
        const supertrendData = param.seriesData.get(supertrendSeries) as LineData | undefined

        let open, high, low, close, chgPct
        if (candleData) {
          open = candleData.open
          high = candleData.high
          low = candleData.low
          close = candleData.close
          if (open > 0) chgPct = ((close - open) / open) * 100
        }

        const dataPoint = lookupPoint(rawDate)

        setHudInfo({
          time: rawDate,
          open,
          high,
          low,
          close,
          chgPct,
          volume: volumeData?.value,
          sma50: sma50Data?.value,
          sma200: sma200Data?.value,
          supertrend: supertrendData?.value,
          rsi: dataPoint?.rsi ?? undefined,
          macd: dataPoint?.macd ?? undefined,
          macdSignal: dataPoint?.macd_signal ?? undefined,
          macdHist: dataPoint?.macd_hist ?? undefined,
        })
      } catch {
        // Safe catch for transient disposal states
      }
    })

    // ResizeObserver with visibility restoration
    let prevWidth = 0
    const resizeObserver = new ResizeObserver((entries) => {
      if (!isSubscribed || !entries || entries.length === 0) return
      const newWidth = entries[0].contentRect.width
      if (newWidth > 0) {
        try {
          if (mainChartRef.current) mainChartRef.current.applyOptions({ width: newWidth })
          if (rsiChartRef.current && rsiContainerRef.current) rsiChartRef.current.applyOptions({ width: newWidth })
          if (macdChartRef.current && macdContainerRef.current) macdChartRef.current.applyOptions({ width: newWidth })

          if (prevWidth === 0 && mainChartRef.current) {
            mainChartRef.current.timeScale().fitContent()
          }
        } catch {}
        prevWidth = newWidth
      } else {
        prevWidth = 0
      }
    })

    // IntersectionObserver to auto-fit scale when switching back to visible tab
    const intersectionObserver = new IntersectionObserver((entries) => {
      if (!isSubscribed || !entries || entries.length === 0) return
      if (entries[0].isIntersecting && mainChartRef.current) {
        try {
          const containerWidth = containerRef.current?.clientWidth || 0
          if (containerWidth > 0) {
            mainChartRef.current.applyOptions({ width: containerWidth })
            if (rsiChartRef.current) rsiChartRef.current.applyOptions({ width: containerWidth })
            if (macdChartRef.current) macdChartRef.current.applyOptions({ width: containerWidth })
            mainChartRef.current.timeScale().fitContent()
          }
        } catch {}
      }
    })

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
      intersectionObserver.observe(containerRef.current)
    }

    return () => {
      isSubscribed = false
      resizeObserver.disconnect()
      intersectionObserver.disconnect()

      // Safe nullification and teardown
      const mc = mainChartRef.current
      const rc = rsiChartRef.current
      const mac = macdChartRef.current

      mainChartRef.current = null
      rsiChartRef.current = null
      macdChartRef.current = null

      candleSeriesRef.current = null
      volumeSeriesRef.current = null
      sma50SeriesRef.current = null
      sma200SeriesRef.current = null
      supertrendSeriesRef.current = null
      bbUpperRef.current = null
      bbLowerRef.current = null
      rsiSeriesRef.current = null
      macdLineRef.current = null
      macdSignalRef.current = null
      macdHistRef.current = null

      try { if (rc) rc.remove() } catch {}
      try { if (mac) mac.remove() } catch {}
      try { if (mc) mc.remove() } catch {}
    }
  }, [showRsi, showMacd, height])

  // Update Data on Series without re-instantiating Chart Canvas
  useEffect(() => {
    if (!data || data.length === 0 || !candleSeriesRef.current) return

    try {
      const validPoints = data.filter((d) => d.time && d.close !== null)

      const candleData: CandlestickData[] = validPoints.map((d) => ({
        time: d.time as Time,
        open: d.open ?? d.close!,
        high: d.high ?? d.close!,
        low: d.low ?? d.close!,
        close: d.close!,
      }))

      const volumeData: HistogramData[] = validPoints.map((d) => ({
        time: d.time as Time,
        value: d.volume ?? 0,
        color: (d.close ?? 0) >= (d.open ?? 0) ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)',
      }))

      candleSeriesRef.current.setData(candleData)
      if (volumeSeriesRef.current) volumeSeriesRef.current.setData(volumeData)

      if (sma50SeriesRef.current) {
        if (showSma50) {
          const sma50Data: LineData[] = validPoints
            .filter((d) => d.sma50 !== null)
            .map((d) => ({ time: d.time as Time, value: d.sma50! }))
          sma50SeriesRef.current.setData(sma50Data)
        } else {
          sma50SeriesRef.current.setData([])
        }
      }

      if (sma200SeriesRef.current) {
        if (showSma200) {
          const sma200Data: LineData[] = validPoints
            .filter((d) => d.sma200 !== null)
            .map((d) => ({ time: d.time as Time, value: d.sma200! }))
          sma200SeriesRef.current.setData(sma200Data)
        } else {
          sma200SeriesRef.current.setData([])
        }
      }

      if (supertrendSeriesRef.current) {
        if (showSupertrend) {
          const stData: LineData[] = validPoints
            .filter((d) => d.supertrend !== null)
            .map((d) => ({ time: d.time as Time, value: d.supertrend! }))
          supertrendSeriesRef.current.setData(stData)
        } else {
          supertrendSeriesRef.current.setData([])
        }
      }

      if (bbUpperRef.current && bbLowerRef.current) {
        if (showBollinger) {
          const upperData: LineData[] = validPoints
            .filter((d) => d.bb_upper !== null)
            .map((d) => ({ time: d.time as Time, value: d.bb_upper! }))
          const lowerData: LineData[] = validPoints
            .filter((d) => d.bb_lower !== null)
            .map((d) => ({ time: d.time as Time, value: d.bb_lower! }))
          bbUpperRef.current.setData(upperData)
          bbLowerRef.current.setData(lowerData)
        } else {
          bbUpperRef.current.setData([])
          bbLowerRef.current.setData([])
        }
      }

      if (rsiSeriesRef.current && showRsi) {
        const rsiData: LineData[] = validPoints
          .filter((d) => d.rsi !== null)
          .map((d) => ({ time: d.time as Time, value: d.rsi! }))
        rsiSeriesRef.current.setData(rsiData)
      }

      if (showMacd && macdLineRef.current && macdSignalRef.current && macdHistRef.current) {
        const macdData: LineData[] = validPoints
          .filter((d) => d.macd !== null)
          .map((d) => ({ time: d.time as Time, value: d.macd! }))

        const signalData: LineData[] = validPoints
          .filter((d) => d.macd_signal !== null)
          .map((d) => ({ time: d.time as Time, value: d.macd_signal! }))

        const histData: HistogramData[] = validPoints
          .filter((d) => d.macd_hist !== null)
          .map((d) => ({
            time: d.time as Time,
            value: d.macd_hist!,
            color: d.macd_hist! >= 0 ? 'rgba(34, 197, 94, 0.7)' : 'rgba(239, 68, 68, 0.7)',
          }))

        macdLineRef.current.setData(macdData)
        macdSignalRef.current.setData(signalData)
        macdHistRef.current.setData(histData)
      }

      if (mainChartRef.current) {
        mainChartRef.current.timeScale().fitContent()
      }
    } catch {
      // Safe catch
    }
  }, [height, data, showSma50, showSma200, showSupertrend, showBollinger, showRsi, showMacd])

  // Handle Logarithmic Toggle
  useEffect(() => {
    if (mainChartRef.current) {
      try {
        mainChartRef.current.priceScale('right').applyOptions({
          mode: isLogScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
        })
      } catch {}
    }
  }, [isLogScale])

  const formatNum = (val?: number, decimals = 2) => {
    if (val === undefined || val === null || isNaN(val)) return '-'
    return val.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  }

  const formatVol = (vol?: number) => {
    if (!vol) return '-'
    if (vol >= 1e7) return `${(vol / 1e7).toFixed(2)}Cr`
    if (vol >= 1e5) return `${(vol / 1e5).toFixed(2)}L`
    if (vol >= 1e3) return `${(vol / 1e3).toFixed(1)}k`
    return vol.toString()
  }

  return (
    <div className="flex flex-col w-full space-y-3">
      {/* Top Toolbar Controls */}
      <div
        className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 card rounded-xl text-xs"
        style={{ background: 'var(--glass-bg-subtle)', border: '0.5px solid var(--glass-border)' }}
      >
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-semibold text-sm tracking-tight" style={{ color: 'var(--text)' }}>
            {ticker.replace('.NS', '')}
          </span>

          <span className="h-4 w-px bg-white/10 mx-1" />

          {/* Scale Toggle */}
          <button
            onClick={() => setIsLogScale(!isLogScale)}
            className="btn-glass text-[11px] py-1 px-2.5"
          >
            {isLogScale ? 'Log Scale' : 'Linear Scale'}
          </button>

          <span className="h-4 w-px bg-white/10 mx-1" />

          {/* Indicator Checkbox Controls */}
          <label className="flex items-center gap-1.5 cursor-pointer text-xs select-none">
            <input
              type="checkbox"
              checked={showSma50}
              onChange={(e) => setShowSma50(e.target.checked)}
              className="accent-blue-500 rounded"
            />
            <span style={{ color: showSma50 ? '#3b82f6' : 'var(--text-3)' }}>SMA 50</span>
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer text-xs select-none">
            <input
              type="checkbox"
              checked={showSma200}
              onChange={(e) => setShowSma200(e.target.checked)}
              className="accent-amber-500 rounded"
            />
            <span style={{ color: showSma200 ? '#f59e0b' : 'var(--text-3)' }}>SMA 200</span>
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer text-xs select-none">
            <input
              type="checkbox"
              checked={showSupertrend}
              onChange={(e) => setShowSupertrend(e.target.checked)}
              className="accent-cyan-500 rounded"
            />
            <span style={{ color: showSupertrend ? '#06b6d4' : 'var(--text-3)' }}>Supertrend</span>
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer text-xs select-none">
            <input
              type="checkbox"
              checked={showBollinger}
              onChange={(e) => setShowBollinger(e.target.checked)}
              className="accent-purple-500 rounded"
            />
            <span style={{ color: showBollinger ? '#a855f7' : 'var(--text-3)' }}>Bollinger</span>
          </label>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 cursor-pointer text-xs select-none">
            <input
              type="checkbox"
              checked={showRsi}
              onChange={(e) => setShowRsi(e.target.checked)}
              className="accent-purple-500 rounded"
            />
            <span style={{ color: 'var(--text-2)' }}>RSI(14)</span>
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer text-xs select-none">
            <input
              type="checkbox"
              checked={showMacd}
              onChange={(e) => setShowMacd(e.target.checked)}
              className="accent-blue-500 rounded"
            />
            <span style={{ color: 'var(--text-2)' }}>MACD</span>
          </label>
        </div>
      </div>

      {/* Interactive Crosshair HUD Banner */}
      <div
        className="px-3 rounded-lg flex flex-nowrap items-center gap-x-3 text-[11px] font-mono glass-subtle h-[32px] min-h-[32px] max-h-[32px] overflow-x-auto scrollbar-none whitespace-nowrap shrink-0"
        style={{ color: 'var(--text-2)', border: '1px solid var(--glass-border)' }}
      >
        {hudInfo.time ? (
          <>
            <span className="font-sans text-xs font-medium shrink-0" style={{ color: 'var(--text)' }}>
              {hudInfo.time}
            </span>
            <span className="shrink-0">
              O: <strong style={{ color: 'var(--text)' }}>{formatNum(hudInfo.open)}</strong>
            </span>
            <span className="shrink-0">
              H: <strong style={{ color: 'var(--text)' }}>{formatNum(hudInfo.high)}</strong>
            </span>
            <span className="shrink-0">
              L: <strong style={{ color: 'var(--text)' }}>{formatNum(hudInfo.low)}</strong>
            </span>
            <span className="shrink-0">
              C: <strong style={{ color: 'var(--text)' }}>{formatNum(hudInfo.close)}</strong>
            </span>
            {hudInfo.chgPct !== undefined && (
              <span className={`shrink-0 ${hudInfo.chgPct >= 0 ? 'text-green-500 font-semibold' : 'text-red-500 font-semibold'}`}>
                ({hudInfo.chgPct >= 0 ? '+' : ''}
                {hudInfo.chgPct.toFixed(2)}%)
              </span>
            )}
            <span className="shrink-0">
              Vol: <strong style={{ color: 'var(--text)' }}>{formatVol(hudInfo.volume)}</strong>
            </span>

            {showSma50 && hudInfo.sma50 && (
              <span className="text-blue-400 shrink-0">
                SMA50: <strong>{formatNum(hudInfo.sma50)}</strong>
              </span>
            )}
            {showSma200 && hudInfo.sma200 && (
              <span className="text-amber-400 shrink-0">
                SMA200: <strong>{formatNum(hudInfo.sma200)}</strong>
              </span>
            )}
            {showSupertrend && hudInfo.supertrend && (
              <span className="text-cyan-400 shrink-0">
                ST: <strong>{formatNum(hudInfo.supertrend)}</strong>
              </span>
            )}
            {showRsi && hudInfo.rsi && (
              <span className="text-purple-400 shrink-0">
                RSI: <strong>{formatNum(hudInfo.rsi, 1)}</strong>
              </span>
            )}
          </>
        ) : (
          <span style={{ color: 'var(--text-3)' }} className="font-sans shrink-0">
            Hover over the chart to inspect prices and indicators
          </span>
        )}
      </div>

      {/* Main Canvas Chart Container */}
      <div className="relative w-full overflow-hidden card p-1" style={{ borderRadius: 'var(--radius-xl)' }}>
        <div ref={containerRef} className="w-full" style={{ height }} />

        {/* RSI Sub-Chart Container */}
        {showRsi && (
          <div className="mt-2 pt-2 border-t" style={{ borderColor: 'var(--glass-border)' }}>
            <div className="px-2 text-[10px] font-semibold text-purple-400 mb-1">RSI (14) Relative Strength</div>
            <div ref={rsiContainerRef} className="w-full" style={{ height: 120 }} />
          </div>
        )}

        {/* MACD Sub-Chart Container */}
        {showMacd && (
          <div className="mt-2 pt-2 border-t" style={{ borderColor: 'var(--glass-border)' }}>
            <div className="px-2 text-[10px] font-semibold text-blue-400 mb-1">MACD (12, 26, 9)</div>
            <div ref={macdContainerRef} className="w-full" style={{ height: 130 }} />
          </div>
        )}
      </div>
    </div>
  )
}
