import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import type { Bindings } from '../lib/types'
import { createSessionToken, hashPassword, randomHex, verifyPassword } from '../lib/auth'

const auth = new Hono<{ Bindings: Bindings }>()

const COOKIE_NAME = 'shokunin_session'

// パスワード(合言葉)が設定済みかどうか
auth.get('/status', async (c) => {
  const settings = await c.env.DB.prepare('SELECT password_hash FROM settings WHERE id = 1').first<{
    password_hash: string | null
  }>()
  const hasPassword = !!settings?.password_hash

  const token = getCookie(c, COOKIE_NAME)
  let authenticated = false
  if (token && hasPassword) {
    const secretRow = await c.env.DB.prepare('SELECT session_secret FROM settings WHERE id = 1').first<{
      session_secret: string | null
    }>()
    if (secretRow?.session_secret) {
      const { verifySessionToken } = await import('../lib/auth')
      authenticated = await verifySessionToken(secretRow.session_secret, token)
    }
  }

  return c.json({ hasPassword, authenticated })
})

// 初回のみ: 合言葉を設定
auth.post('/setup', async (c) => {
  const { password } = await c.req.json<{ password: string }>()
  if (!password || password.length < 4) {
    return c.json({ error: '合言葉は4文字以上にしてください' }, 400)
  }

  const existing = await c.env.DB.prepare('SELECT password_hash FROM settings WHERE id = 1').first<{
    password_hash: string | null
  }>()
  if (existing?.password_hash) {
    return c.json({ error: '既に合言葉は設定されています' }, 400)
  }

  const salt = randomHex(8)
  const hash = await hashPassword(password, salt)
  const sessionSecret = randomHex(32)

  await c.env.DB.prepare(
    'UPDATE settings SET password_hash = ?, password_salt = ?, session_secret = ? WHERE id = 1'
  )
    .bind(hash, salt, sessionSecret)
    .run()

  const token = await createSessionToken(sessionSecret)
  setCookie(c, COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })

  return c.json({ success: true })
})

// ログイン
auth.post('/login', async (c) => {
  const { password } = await c.req.json<{ password: string }>()
  const settings = await c.env.DB.prepare(
    'SELECT password_hash, password_salt, session_secret FROM settings WHERE id = 1'
  ).first<{ password_hash: string | null; password_salt: string | null; session_secret: string | null }>()

  if (!settings?.password_hash || !settings.password_salt) {
    return c.json({ error: '合言葉が未設定です' }, 400)
  }

  const ok = await verifyPassword(password ?? '', settings.password_salt, settings.password_hash)
  if (!ok) {
    return c.json({ error: '合言葉が違います' }, 401)
  }

  let sessionSecret = settings.session_secret
  if (!sessionSecret) {
    sessionSecret = randomHex(32)
    await c.env.DB.prepare('UPDATE settings SET session_secret = ? WHERE id = 1').bind(sessionSecret).run()
  }

  const token = await createSessionToken(sessionSecret)
  setCookie(c, COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })

  return c.json({ success: true })
})

// 合言葉の変更(ログイン中のみ)
auth.post('/change-password', async (c) => {
  const { currentPassword, newPassword } = await c.req.json<{
    currentPassword: string
    newPassword: string
  }>()
  if (!newPassword || newPassword.length < 4) {
    return c.json({ error: '新しい合言葉は4文字以上にしてください' }, 400)
  }

  const settings = await c.env.DB.prepare('SELECT password_hash, password_salt FROM settings WHERE id = 1').first<{
    password_hash: string | null
    password_salt: string | null
  }>()
  if (!settings?.password_hash || !settings.password_salt) {
    return c.json({ error: '合言葉が未設定です' }, 400)
  }

  const ok = await verifyPassword(currentPassword ?? '', settings.password_salt, settings.password_hash)
  if (!ok) {
    return c.json({ error: '現在の合言葉が違います' }, 401)
  }

  const salt = randomHex(8)
  const hash = await hashPassword(newPassword, salt)
  await c.env.DB.prepare('UPDATE settings SET password_hash = ?, password_salt = ? WHERE id = 1')
    .bind(hash, salt)
    .run()

  return c.json({ success: true })
})

auth.post('/logout', async (c) => {
  deleteCookie(c, COOKIE_NAME, { path: '/' })
  return c.json({ success: true })
})

export { COOKIE_NAME }
export default auth
