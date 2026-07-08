// パスワードハッシュ化とセッショントークンの署名/検証（Web Crypto APIのみ使用）

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16)
  }
  return bytes
}

export function randomHex(byteLen = 16): string {
  const arr = new Uint8Array(byteLen)
  crypto.getRandomValues(arr)
  return toHex(arr.buffer)
}

export async function hashPassword(password: string, saltHex?: string): Promise<{ hash: string; salt: string }> {
  const salt = saltHex ? fromHex(saltHex) : crypto.getRandomValues(new Uint8Array(16))
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    256
  )
  return { hash: toHex(bits), salt: toHex((salt as Uint8Array).buffer as ArrayBuffer) }
}

export async function verifyPassword(password: string, hashHex: string, saltHex: string): Promise<boolean> {
  const { hash } = await hashPassword(password, saltHex)
  return timingSafeEqual(hash, hashHex)
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

async function hmac(secretHex: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    fromHex(secretHex) as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return toHex(sig)
}

// 30日間有効なセッショントークンを発行
export async function createSessionToken(secretHex: string): Promise<string> {
  const expires = Date.now() + 30 * 24 * 60 * 60 * 1000
  const payload = `${expires}`
  const sig = await hmac(secretHex, payload)
  return `${payload}.${sig}`
}

export async function verifySessionToken(secretHex: string, token: string | undefined | null): Promise<boolean> {
  if (!token) return false
  const parts = token.split('.')
  if (parts.length !== 2) return false
  const [expiresStr, sig] = parts
  const expected = await hmac(secretHex, expiresStr)
  if (!timingSafeEqual(expected, sig)) return false
  const expires = parseInt(expiresStr, 10)
  if (isNaN(expires) || Date.now() > expires) return false
  return true
}
