import type { IncomingMessage, ServerResponse } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { authenticated } from '../server/auth.js'
// Function bundles preserve the frontend directory when deployed from this repo.
const dataDirectory = fileURLToPath(new URL('../public/', import.meta.url))
let strategyCache: { mtime: number; data: { dates: string[]; benchmark: number[]; prices: Record<string, unknown>; factors: Record<string, unknown>; methodology?: string } } | null = null
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'private, no-store')
  res.setHeader('Vary', 'Cookie')
  const send = (status: number, data: unknown) => { res.statusCode = status; res.end(JSON.stringify(data)) }
  if (req.method !== 'GET') return send(405, { error: 'Method not allowed' })
  const url = new URL(req.url || '/', 'http://localhost')
  const resource = url.searchParams.get('resource')
  const files: Record<string, string> = { market: 'market_data.json', quant: 'quant_data.json', scores: 'score_history.json', strategies: 'strategy_history.json', runs: 'backtest_runs/index.json' }
  let file = resource ? files[resource] : undefined
  if (resource === 'run') {
    const slug = url.searchParams.get('slug') || ''
    if (!/^(short|long)-(1y|6m)-\d{4}-\d{2}-\d{2}$/.test(slug)) return send(400, { error: 'Invalid run' })
    file = `backtest_runs/${slug}.json`
  }
  if (!file) return send(400, { error: 'Unknown resource' })
  const loggedIn = authenticated(req)
  if (resource !== 'market' && !loggedIn) return send(401, { error: 'Please sign in' })
  try {
    if (resource === 'strategies') {
      const fullPath = resolve(dataDirectory, file)
      const mtime = (await stat(fullPath)).mtimeMs
      if (!strategyCache || strategyCache.mtime !== mtime) strategyCache = { mtime, data: JSON.parse(await readFile(fullPath, 'utf8')) }
      const history = strategyCache.data
      const pages = Math.ceil(history.dates.length / 10)
      const rawPage = url.searchParams.get('page')
      if (rawPage === null) return send(200, { pages, methodology: history.methodology })
      const page = Number(rawPage)
      if (!/^\d+$/.test(rawPage) || !Number.isInteger(page) || page < 0 || page >= pages) return send(400, { error: 'Invalid history page' })
      const dates = history.dates.slice(page * 10, (page+1) * 10)
      const last = dates[dates.length-1]
      const first = dates[0]
      const priorDates = Object.keys(history.factors).filter(d => d < first).sort()
      const prior = priorDates[priorDates.length - 1]
      const factors = Object.fromEntries(Object.entries(history.factors).filter(([date]) => (date >= first && date <= last) || date === prior))
      return send(200, { dates, benchmark: history.benchmark.slice(page*10,(page+1)*10),
        prices: Object.fromEntries(dates.map(date => [date,history.prices[date]])), factors })
    }
    const data = JSON.parse(await readFile(resolve(dataDirectory, file), 'utf8'))
    if (resource === 'market' && !loggedIn) {
      for (const stock of data.data || []) for (const field of Object.keys(stock)) {
        if (/Score|Conviction|ML_|Red_Flag|ATR_(Stop|Target|Chandelier)/i.test(field)) stock[field] = null
      }
      delete data.sector_summary
      delete data.outcome_accuracy
    }
    if (resource === 'quant' && data.data_version !== 3) return send(503, { error: 'Research data is being regenerated' })
    if (resource === 'run' && data.version !== 3) return send(410, { error: 'Legacy run invalidated; regenerate this run' })
    if (resource === 'runs') data.runs = (data.runs || []).filter((r: { version?: number }) => r.version === 3)
    return send(200, data)
  } catch (error) {
    console.error('Unable to read bundled research data', { resource, file, error })
    return send(503, { error: 'Data is temporarily unavailable' })
  }
}
