import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { fetchChartData } from './api/lib/fetchChartData'

function chartApiDevPlugin(): Plugin {
  return {
    name: 'chart-api-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/chart')) {
          next()
          return
        }

        if (req.method === 'OPTIONS') {
          res.statusCode = 200
          res.end()
          return
        }

        if (req.method !== 'GET') {
          next()
          return
        }

        try {
          const url = new URL(req.url, 'http://localhost')
          const ticker = url.searchParams.get('ticker')
          const period = url.searchParams.get('period') || '1mo'
          const interval = url.searchParams.get('interval') || '1d'

          if (!ticker) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Ticker is required' }))
            return
          }

          const data = await fetchChartData(ticker, period, interval)
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ status: 'ok', data }))
        } catch (error) {
          console.error('Chart API dev error:', error)
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Failed to fetch chart data' }))
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), chartApiDevPlugin()],
})
