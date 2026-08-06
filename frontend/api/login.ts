/// <reference types="node" />
import type { IncomingMessage, ServerResponse } from 'http'

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  )

  if (req.method === 'OPTIONS') {
    res.statusCode = 200
    res.end()
    return
  }

  if (req.method !== 'POST') {
    res.statusCode = 405
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Method not allowed' }))
    return
  }

  try {
    const body = await new Promise<string>((resolve, reject) => {
      let data = ''
      req.on('data', chunk => (data += chunk))
      req.on('end', () => resolve(data))
      req.on('error', reject)
    })

    const { email, password } = JSON.parse(body || '{}')

    const expectedEmail = process.env.AUTH_EMAIL || 'alpha@fms.edu'
    const expectedPassword = process.env.AUTH_PASSWORD || 'alphakishakti'

    if (email === expectedEmail && password === expectedPassword) {
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ status: 'ok', success: true, token: 'qa_session_valid' }))
    } else {
      res.statusCode = 401
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ status: 'error', error: 'Invalid credentials' }))
    }
  } catch (error) {
    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ status: 'error', error: 'Invalid request body' }))
  }
}
