import { Hono } from 'hono'
import type { Bindings } from '../types'
import { hashPassword, verifyPassword, randomHex, createSessionToken } from '../lib/crypto'
import { setSessionCookie, clearSessionCookie, SESSION_COOKIE } from '../lib/auth'
import { getCookie } from 'hono/cookie'
import { verifySessionToken } from '../lib/crypto'

const auth = new Hono<{ Bindings: Bindings }>()

// 現在のログイン状態・初期セットアップ有無を確認
auth.get('/status', async (c) => {
  const result = await c.env.DB.prepare(
    'SELECT password_hash, session_secret FROM settings WHERE id = 1'
  ).first<{ password_hash: string | null; session_secret: string | null }>()

  const needsSetup = !result?.password_hash
  let loggedIn = needsSetup // 未設定なら常にアクセス可能

  if (!needsSetup) {
    const token = getCookie(c, SESSION_COOKIE)
    loggedIn = result!.session_secret ? await verifySessionToken(result!.session_secret, token) : false
  }

  return c.json({ needsSetup, loggedIn })
})

// 初回セットアップ：合言葉(パスワード)を設定
auth.post('/setup', async (c) => {
  const { password } = await c.req.json<{ password: string }>()
  if (!password || password.length < 4) {
    return c.json({ error: '合言葉は4文字以上で設定してください' }, 400)
  }

  const existing = await c.env.DB.prepare(
    'SELECT password_hash FROM settings WHERE id = 1'
  ).first<{ password_hash: string | null }>()

  if (existing?.password_hash) {
    return c.json({ error: '既に合言葉が設定されています' }, 400)
  }

  const { hash, salt } = await hashPassword(password)
  const sessionSecret = randomHex(32)

  await c.env.DB.prepare(
    'UPDATE settings SET password_hash = ?, password_salt = ?, session_secret = ? WHERE id = 1'
  )
    .bind(hash, salt, sessionSecret)
    .run()

  const token = await createSessionToken(sessionSecret)
  setSessionCookie(c, token)

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

  const ok = await verifyPassword(password ?? '', settings.password_hash, settings.password_salt)
  if (!ok) {
    return c.json({ error: '合言葉が違います' }, 401)
  }

  let sessionSecret = settings.session_secret
  if (!sessionSecret) {
    sessionSecret = randomHex(32)
    await c.env.DB.prepare('UPDATE settings SET session_secret = ? WHERE id = 1').bind(sessionSecret).run()
  }

  const token = await createSessionToken(sessionSecret)
  setSessionCookie(c, token)

  return c.json({ success: true })
})

// ログアウト
auth.post('/logout', async (c) => {
  clearSessionCookie(c)
  return c.json({ success: true })
})

// 合言葉の変更（ログイン済みが前提）
auth.post('/change-password', async (c) => {
  const { currentPassword, newPassword } = await c.req.json<{ currentPassword: string; newPassword: string }>()
  if (!newPassword || newPassword.length < 4) {
    return c.json({ error: '新しい合言葉は4文字以上で設定してください' }, 400)
  }

  const settings = await c.env.DB.prepare(
    'SELECT password_hash, password_salt FROM settings WHERE id = 1'
  ).first<{ password_hash: string | null; password_salt: string | null }>()

  if (settings?.password_hash && settings.password_salt) {
    const ok = await verifyPassword(currentPassword ?? '', settings.password_hash, settings.password_salt)
    if (!ok) {
      return c.json({ error: '現在の合言葉が違います' }, 401)
    }
  }

  const { hash, salt } = await hashPassword(newPassword)
  const sessionSecret = randomHex(32)
  await c.env.DB.prepare(
    'UPDATE settings SET password_hash = ?, password_salt = ?, session_secret = ? WHERE id = 1'
  )
    .bind(hash, salt, sessionSecret)
    .run()

  const token = await createSessionToken(sessionSecret)
  setSessionCookie(c, token)

  return c.json({ success: true })
})

export default auth
