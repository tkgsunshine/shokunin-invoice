import { Hono } from 'hono'
import { renderer } from './renderer'
import { serveStatic } from 'hono/cloudflare-workers'
import type { Bindings } from './lib/types'
import { requireAuth } from './lib/middleware'
import authRoutes from './routes/auth'
import settingsRoutes from './routes/settings'
import customersRoutes from './routes/customers'
import purchasesRoutes from './routes/purchases'
import invoicesRoutes from './routes/invoices'

const app = new Hono<{ Bindings: Bindings }>()

app.use('/static/*', serveStatic({ root: './public' }))
app.use(renderer)

// 認証関連は認証不要でアクセス可(ログイン/ステータス確認/初期設定のため)
app.route('/api/auth', authRoutes)

// それ以外のAPIは合言葉設定済みならログイン必須
app.use('/api/*', requireAuth)

app.route('/api/settings', settingsRoutes)
app.route('/api/customers', customersRoutes)
app.route('/api/purchases', purchasesRoutes)
app.route('/api/invoices', invoicesRoutes)

app.get('*', (c) => {
  return c.render(<div id="app"></div>)
})

export default app
