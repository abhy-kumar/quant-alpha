import { createHmac, timingSafeEqual, createHash } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
export const sessionName = 'qa_session'
export const sessionSeconds = 8 * 60 * 60
function key() {
  if (!process.env.AUTH_EMAIL || !process.env.AUTH_PASSWORD) return null
  return process.env.AUTH_SESSION_SECRET || createHash('sha256').update(`quant-alpha/session/v3:${process.env.AUTH_PASSWORD}`).digest('hex')
}
function sign(payload: string) { return createHmac('sha256', key()!).update(payload).digest('base64url') }
export function equal(a: string, b: string) {
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest())
}
export function configured() { return Boolean(key()) }
export function newSession() {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + sessionSeconds })).toString('base64url')
  return `${payload}.${sign(payload)}`
}
export function authenticated(req: IncomingMessage) {
  if (!configured()) return false
  const token = req.headers.cookie?.split(';').map(c => c.trim()).find(c => c.startsWith(`${sessionName}=`))?.slice(sessionName.length + 1)
  if (!token || token.length > 512) return false
  const [payload, signature, extra] = token.split('.')
  if (!payload || !signature || extra || !equal(signature, sign(payload))) return false
  try { return JSON.parse(Buffer.from(payload, 'base64url').toString()).exp > Date.now() / 1000 } catch { return false }
}
export function cookie(value: string, age = sessionSeconds) {
  return `${sessionName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${process.env.VERCEL || process.env.NODE_ENV === 'production' ? '; Secure' : ''}`
}
