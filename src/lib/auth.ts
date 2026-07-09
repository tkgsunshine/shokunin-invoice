import { Context, Next } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import type { Bindings } from '../types'
import { verifySessionToken } from './crypto'

export const SESSION_COOKIE = 'shokunin_session'

export async function authMiddleware(c: Context<{ Bindings: Bindings }>, next: Next) {
  const result = await c.env.DB.execute('SELECT session_secret, password_hash FROM settings WHERE id = 1')
  const settings = result.rows[0] as { session_secret: string | null; password_hash: string | null } | undefined

  // パスワード未設定の場合は初回セットアップ扱いで認証をスキップ
  if (!settings?.password_hash) {
    return next()
  }

  const token = getCookie(c, SESSION_COOKIE)
  const ok = settings.session_secret ? await verifySessionToken(settings.session_secret, token) : false
  if (!ok) {
    return c.json({ error: 'ログインが必要です' }, 401)
  }
  return next()
}

export function setSessionCookie(c: Context, token: string) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Strict',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
}

export function clearSessionCookie(c: Context) {
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
}
