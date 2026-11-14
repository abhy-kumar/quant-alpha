import type { IncomingMessage, ServerResponse } from 'node:http'
import { authenticated, configured, cookie, equal, newSession } from '../server/auth.js'
const attempts = new Map<string, { count: number; until: number }>()
// "null" (sandboxed frames) and other unparsable origins are rejected, not thrown.
function originHost(origin: string) { try { return new URL(origin).host } catch { return null } }
// Behind Vercel every socket belongs to the proxy, so one bucket would let a single
// visitor lock everyone out. Vercel overwrites these headers; elsewhere they are
// client-controlled and ignored.
function clientAddress(req: IncomingMessage) {
  const header = (name: string) => { const value = req.headers[name]; return (Array.isArray(value) ? value[0] : value)?.split(',')[0].trim() }
  const forwarded = process.env.VERCEL ? header('x-real-ip') || header('x-forwarded-for') : undefined
  return (forwarded || req.socket.remoteAddress || 'unknown').slice(0, 64)
}
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  const send = (status: number, data: object) => { res.statusCode = status; res.end(JSON.stringify(data)) }
  if (req.method === 'GET') return send(200, { authenticated: authenticated(req) })
  if (req.method !== 'POST' && req.method !== 'DELETE') return send(405, { error: 'Method not allowed' })
  if (req.headers.origin && originHost(req.headers.origin) !== req.headers.host) return send(403, { error: 'Invalid origin' })
  if (req.method === 'DELETE') { res.setHeader('Set-Cookie', cookie('', 0)); return send(200, { success: true }) }
  if (!configured()) return send(503, { error: 'Shared login has not been configured' })
  const address = clientAddress(req)
  const now = Date.now()
  for (const [ip, attempt] of attempts) if (attempt.until < now) attempts.delete(ip)
  const attempt = attempts.get(address) || { count: 0, until: now + 60_000 }
  attempt.count++
  attempts.set(address, attempt)
  if (attempt.count > 10) return send(429, { error: 'Please wait a minute before trying again' })
  try {
    let parsed: unknown = (req as IncomingMessage & { body?: unknown }).body
    if (parsed === undefined) {
      let raw = ''
      for await (const chunk of req) { raw += chunk; if (raw.length > 2048) return send(413, { error: 'Request too large' }) }
      parsed = JSON.parse(raw || '{}')
    } else if (typeof parsed === 'string') parsed = JSON.parse(parsed)
    const { email, password } = parsed as { email?: unknown; password?: unknown }
    if (typeof email !== 'string' || typeof password !== 'string') return send(400, { error: 'Email and password are required' })
    const validEmail = equal(email, process.env.AUTH_EMAIL!)
    const validPassword = equal(password, process.env.AUTH_PASSWORD!)
    if (!validEmail || !validPassword) return send(401, { error: 'Invalid credentials' })
    res.setHeader('Set-Cookie', cookie(newSession()))
    return send(200, { success: true })
  } catch { return send(400, { error: 'Invalid request body' }) }
}
