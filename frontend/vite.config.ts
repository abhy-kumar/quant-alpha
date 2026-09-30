import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import chartHandler from './api/chart.ts'
import liveDataHandler from './api/live_data.ts'
import loginHandler from './api/login.ts'
import dataHandler from './api/data.ts'
function apiPlugin(): Plugin {
  const handlers = { '/api/chart': chartHandler, '/api/live_data': liveDataHandler, '/api/login': loginHandler, '/api/data': dataHandler }
  return {
    name: 'server-api-and-private-data',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = new URL(req.url || '/', 'http://localhost').pathname
        const handler = handlers[pathname as keyof typeof handlers]
        if (handler) await handler(req, res)
        else if (/^\/(market_data|quant_data|score_history|strategy_history)\.json$|^\/backtest_runs\//.test(pathname)) { res.statusCode = 404; res.end() }
        else next()
      })
    },
    async closeBundle() {
      for (const name of ['market_data.json', 'quant_data.json', 'score_history.json', 'strategy_history.json', 'backtest_runs'])
        await rm(resolve('dist', name), { force: true, recursive: true })
    },
  }
}
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'AUTH_')
  for (const name of ['AUTH_EMAIL', 'AUTH_PASSWORD', 'AUTH_SESSION_SECRET']) if (env[name]) process.env[name] = env[name]
  return { plugins: [react(), apiPlugin()], build: { minify: 'terser' }, resolve: { alias: { lodash: 'lodash-es' } } }
})
