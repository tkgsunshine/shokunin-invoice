import { handle } from '@hono/node-server/vercel'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Bindings } from '../src/types'
import { authMiddleware } from '../src/lib/auth'
import { D1LikeClient, createDbClient } from '../src/lib/db'
import { r2Adapter } from '../src/lib/storage'
import authRoute from '../src/routes/auth'
import settingsRoute from '../src/routes/settings'
import customersRoute from '../src/routes/customers'
import purchasesRoute from '../src/routes/purchases'
import invoicesRoute from '../src/routes/invoices'

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

export default handle(app)
