import { useState, useEffect } from 'react'
import axios from 'axios'
import type { ChartCandle } from '../types'

export function useChartData(selectedTicker: string) {
  const [chartPeriod, setChartPeriod] = useState('1y')
  const [chartInterval, setChartInterval] = useState('1d')
  const [chartData, setChartData] = useState<ChartCandle[]>([])
  const [chartLoading, setChartLoading] = useState(false)

  useEffect(() => {
    if (!selectedTicker) return
    let isCancelled = false
    setChartLoading(true)

    axios
      .get(
        `/api/chart?ticker=${encodeURIComponent(
          selectedTicker
        )}&period=${chartPeriod}&interval=${chartInterval}`
      )
      .then(res => {
        if (!isCancelled) {
          setChartData(res.data.status === 'ok' ? res.data.data : [])
        }
      })
      .catch(() => {
        if (!isCancelled) setChartData([])
      })
      .finally(() => {
        if (!isCancelled) setChartLoading(false)
      })

    return () => {
      isCancelled = true
    }
  }, [selectedTicker, chartPeriod, chartInterval])

  return {
    chartPeriod,
    setChartPeriod,
    chartInterval,
    setChartInterval,
    chartData,
    chartLoading,
  }
}
