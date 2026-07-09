import 'dotenv/config'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Bindings } from './types'
import { authMiddleware } from './lib/auth'
import { D1LikeClient, createDbClient } from './lib/db'
import { r2Adapter } from './lib/storage'
import authRoute from './routes/auth'
import settingsRoute from './routes/settings'
import customersRoute from './routes/customers'
import purchasesRoute from './routes/purchases'
import invoicesRoute from './routes/invoices'
import * as fs from 'fs'
import * as path from 'path'

// DB初期化
const libsqlClient = createDbClient()
const db = new D1LikeClient(libsqlClient)

// マイグレーション実行（起動時に自動適用）
async function runMigrations() {
  const migrationsDir = path.join(process.cwd(), 'migrations')
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()
  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8')
    // セミコロンで分割して個別実行
    const statements = sql.split(';').map((s) => s.trim()).filter((s) => s.length > 0)
    for (const stmt of statements) {
      try {
        await libsqlClient.execute(stmt)
      } catch (e: any) {
        // 既に存在するテーブル・カラムのエラーは無視
        if (!e.message?.includes('already exists') && !e.message?.includes('duplicate column')) {
          console.warn(`Migration warning (${file}): ${e.message}`)
        }
      }
    }
  }
  console.log('Migrations applied.')
}

const bindings: Bindings = {
  DB: db as any,
  R2: r2Adapter,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? '',
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
}

const app = new Hono<{ Bindings: Bindings }>()

// 全リクエストにbindingsを注入するミドルウェア
app.use('*', async (c, next) => {
  c.env = bindings
  return next()
})

app.use('/api/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}))

// 認証系ルートは認証不要
app.route('/api/auth', authRoute)

// 合言葉変更は認証必要
app.use('/api/auth/change-password', authMiddleware)

// それ以外のAPIは認証必須
app.use('/api/settings/*', authMiddleware)
app.use('/api/customers/*', authMiddleware)
app.use('/api/purchases/*', authMiddleware)
app.use('/api/invoices/*', authMiddleware)

app.route('/api/settings', settingsRoute)
app.route('/api/customers', customersRoute)
app.route('/api/purchases', purchasesRoute)
app.route('/api/invoices', invoicesRoute)

// 静的ファイル配信（public/ディレクトリ）
app.use('/*', serveStatic({ root: './public' }))

// SPAフォールバック
app.get('*', async (c) => {
  const html = fs.readFileSync(path.join(process.cwd(), 'public', 'index.html'), 'utf-8')
  return c.html(html)
})

const port = Number(process.env.PORT ?? 3000)

runMigrations().then(() => {
  serve({ fetch: app.fetch, port }, () => {
    console.log(`Server running at http://localhost:${port}`)
  })
}).catch((e) => {
  console.error('Migration failed:', e)
  process.exit(1)
})

export default app
