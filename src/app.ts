import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Bindings } from './types'
import { authMiddleware } from './lib/auth'
import { D1LikeClient, createDbClient } from './lib/db'
import { r2Adapter } from './lib/storage'
import authRoute from './routes/auth'
import settingsRoute from './routes/settings'
import customersRoute from './routes/customers'
import purchasesRoute from './routes/purchases'
import invoicesRoute from './routes/invoices'

const libsqlClient = createDbClient()
const db = new D1LikeClient(libsqlClient)

const bindings: Bindings = {
  DB: db as any,
  R2: r2Adapter,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? '',
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
}

const app = new Hono<{ Bindings: Bindings }>().basePath('/api')

app.use('*', async (c, next) => {
  c.env = bindings
  return next()
})

app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}))

app.route('/auth', authRoute)
app.use('/auth/change-password', authMiddleware)
app.use('/settings/*', authMiddleware)
app.use('/customers/*', authMiddleware)
app.use('/purchases/*', authMiddleware)
app.use('/invoices/*', authMiddleware)

app.route('/settings', settingsRoute)
app.route('/customers', customersRoute)
app.route('/purchases', purchasesRoute)
app.route('/invoices', invoicesRoute)

// Vercel Node.js serverless function handler
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // Node.js IncomingMessage → Web Request に変換
  const url = `https://${req.headers.host || 'localhost'}${req.url}`
  const method = req.method || 'GET'
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (value) {
      if (Array.isArray(value)) {
        value.forEach(v => headers.append(key, v))
      } else {
        headers.set(key, value)
      }
    }
  }

  let body: BodyInit | null = null
  if (method !== 'GET' && method !== 'HEAD') {
    body = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = []
      req.on('data', (chunk: Buffer) => chunks.push(chunk))
      req.on('end', () => resolve(Buffer.concat(chunks)))
      req.on('error', reject)
    })
  }

  const request = new Request(url, {
    method,
    headers,
    body: body && (body as Buffer).length > 0 ? body : null,
  })

  const response = await app.fetch(request)

  res.statusCode = response.status
  response.headers.forEach((value, key) => {
    res.setHeader(key, value)
  })

  const responseBody = await response.arrayBuffer()
  res.end(Buffer.from(responseBody))
}
