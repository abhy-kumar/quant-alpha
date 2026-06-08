// @ts-nocheck
import { fetchChartData } from '../lib/fetchChartData'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version',
  )

  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  try {
    const ticker = req.query.ticker
    const period = req.query.period || '1mo'
    const interval = req.query.interval || '1d'

    if (!ticker) {
      return res.status(400).json({ error: 'Ticker is required' })
    }

    const data = await fetchChartData(ticker, period, interval)

    return res.status(200).json({
      status: 'ok',
      data,
    })
  } catch (error) {
    console.error('Yahoo Finance Error:', error)
    return res.status(500).json({ error: 'Failed to fetch chart data' })
  }
}
