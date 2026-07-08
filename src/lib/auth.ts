// パスワード(合言葉)のハッシュ化・検証、セッションCookieの署名・検証
// Cloudflare Workers の Web Crypto API のみを使用(Node.js の crypto は使わない)

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function fromHex(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2)
  for (let i = 0; i < arr.length; i++) {
    arr[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16)
  }
  return arr
}

export function randomHex(bytes = 16): string {
  const arr = new Uint8Array(bytes)
  crypto.getRandomValues(arr)
  return toHex(arr.buffer)
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  const enc = new TextEncoder()
  const data = enc.encode(salt + ':' + password)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return toHex(digest)
}

export async function verifyPassword(password: string, salt: string, hash: string): Promise<boolean> {
  const computed = await hashPassword(password, salt)
  return timingSafeEqual(computed, hash)
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder()
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )
}

// セッショントークン: base64url(payload).base64url(signature)
// payload = JSON { exp: number(epoch秒) }
export async function createSessionToken(secret: string, expiresInSeconds = 60 * 60 * 24 * 30): Promise<string> {
  const payload = JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expiresInSeconds })
  const payloadB64 = base64UrlEncode(payload)
  const key = await hmacKey(secret)
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64))
  const sigB64 = base64UrlEncode(toHex(sig))
  return `${payloadB64}.${sigB64}`
}

export async function verifySessionToken(secret: string, token: string): Promise<boolean> {
  try {
    const [payloadB64, sigB64] = token.split('.')
    if (!payloadB64 || !sigB64) return false
    const key = await hmacKey(secret)
    const expectedSig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64))
    const expectedSigB64 = base64UrlEncode(toHex(expectedSig))
    if (!timingSafeEqual(expectedSigB64, sigB64)) return false
    const payload = JSON.parse(base64UrlDecode(payloadB64))
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return false
    return true
  } catch {
    return false
  }
}

function base64UrlEncode(str: string): string {
  const b64 = btoa(unescape(encodeURIComponent(str)))
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(str: string): string {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/')
  while (b64.length % 4) b64 += '='
  return decodeURIComponent(escape(atob(b64)))
}
