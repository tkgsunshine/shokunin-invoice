import type { Context, Next } from 'hono'
import { getCookie } from 'hono/cookie'
import type { Bindings } from './types'
import { verifySessionToken } from './auth'

const COOKIE_NAME = 'shokunin_session'

// 合言葉が未設定の場合は誰でも通す(初回セットアップのため)。
// 設定済みの場合はセッションCookieが有効な場合のみ通す。
export async function requireAuth(c: Context<{ Bindings: Bindings }>, next: Next) {
  const settings = await c.env.DB.prepare(
    'SELECT password_hash, session_secret FROM settings WHERE id = 1'
  ).first<{ password_hash: string | null; session_secret: string | null }>()

  if (!settings?.password_hash) {
    // 未設定なら通す(セットアップ画面に誘導するのはフロント側)
    return next()
  }

  const token = getCookie(c, COOKIE_NAME)
  if (!token || !settings.session_secret) {
    return c.json({ error: '認証が必要です' }, 401)
  }

  const valid = await verifySessionToken(settings.session_secret, token)
  if (!valid) {
    return c.json({ error: '認証が必要です' }, 401)
  }

  return next()
}
