const COOKIE = 'cc_admin'
const MAX_AGE = 60 * 60 * 12

function secret() {
  return process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || ''
}

function b64urlFromBytes(bytes) {
  let bin = ''
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i])
  const b64 = typeof btoa === 'function' ? btoa(bin) : Buffer.from(arr).toString('base64')
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function bytesFromB64url(s) {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad
  if (typeof atob === 'function') {
    const bin = atob(b64)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  }
  return new Uint8Array(Buffer.from(b64, 'base64'))
}

async function hmac(data) {
  const key = secret()
  if (!key) throw new Error('SESSION_SECRET / ADMIN_PASSWORD yok')
  const cryptoApi = globalThis.crypto
  const raw = new TextEncoder().encode(key)
  const k = await cryptoApi.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await cryptoApi.subtle.sign('HMAC', k, new TextEncoder().encode(data))
  return b64urlFromBytes(sig)
}

export function cookieName() {
  return COOKIE
}

export function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: MAX_AGE,
  }
}

export async function signSession(email) {
  const header = b64urlFromBytes(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
  const payload = b64urlFromBytes(new TextEncoder().encode(JSON.stringify({
    email,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + MAX_AGE,
  })))
  const body = `${header}.${payload}`
  const sig = await hmac(body)
  return `${body}.${sig}`
}

export async function verifySession(token) {
  if (!token || !secret()) return null
  const parts = String(token).split('.')
  if (parts.length !== 3) return null
  const [h, p, s] = parts
  const expect = await hmac(`${h}.${p}`)
  if (expect.length !== s.length) return null
  const a = bytesFromB64url(expect)
  const b = bytesFromB64url(s)
  if (a.length !== b.length) return null
  let ok = 0
  for (let i = 0; i < a.length; i++) ok |= a[i] ^ b[i]
  if (ok !== 0) return null
  try {
    const json = JSON.parse(new TextDecoder().decode(bytesFromB64url(p)))
    if (!json?.email || !json.exp || json.exp < Math.floor(Date.now() / 1000)) return null
    return json
  } catch {
    return null
  }
}

export function isPublicPath(pathname) {
  if (pathname === '/login') return true
  if (pathname.startsWith('/api/auth/login')) return true
  if (pathname.startsWith('/api/auth/logout')) return true
  if (pathname === '/api/webhook/meta' || pathname.startsWith('/api/webhook/meta/')) return true
  if (pathname === '/api/webhook/telegram' || pathname.startsWith('/api/webhook/telegram/')) return true
  if (pathname === '/api/webhooks/meta' || pathname.startsWith('/api/webhooks/meta/')) return true
  if (pathname === '/api/webhooks/telegram' || pathname.startsWith('/api/webhooks/telegram/')) return true
  if (pathname.startsWith('/api/oauth/google/callback')) return true
  return false
}
