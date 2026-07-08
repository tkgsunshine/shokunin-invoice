import { Hono } from 'hono'
import type { Bindings } from './types'
import { authMiddleware } from './lib/auth'
import authRoute from './routes/auth'
import settingsRoute from './routes/settings'
import customersRoute from './routes/customers'
import purchasesRoute from './routes/purchases'
import invoicesRoute from './routes/invoices'

const app = new Hono<{ Bindings: Bindings }>()

// 認証系ルートは認証不要
app.route('/api/auth', authRoute)

// それ以外のAPIは認証必須
app.use('/api/settings/*', authMiddleware)
app.use('/api/customers/*', authMiddleware)
app.use('/api/purchases/*', authMiddleware)
app.use('/api/invoices/*', authMiddleware)

app.route('/api/settings', settingsRoute)
app.route('/api/customers', customersRoute)
app.route('/api/purchases', purchasesRoute)
app.route('/api/invoices', invoicesRoute)

// 静的ファイル・SPAのフォールバックはCloudflare Pagesが public/ を
// そのまま配信するため、ここではAPI以外のルートを定義しない
// (public/_routes.json でAPI以外を静的配信に回している)

export default app
