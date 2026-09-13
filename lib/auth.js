import crypto from 'crypto'
import { signSession, verifySession, cookieName, cookieOptions } from '@/lib/auth-session'

const fails = new Map()
const MAX_FAIL = 5
const BLOCK_MS = 15 * 60 * 1000

function safeEqual(a, b) {
  const left = Buffer.from(String(a))
  const right = Buffer.from(String(b))
  const len = Math.max(left.length, right.length, 1)
  const x = Buffer.alloc(len)
  const y = Buffer.alloc(len)
  left.copy(x)
  right.copy(y)
  return crypto.timingSafeEqual(x, y) && left.length === right.length
}

export function clientIp(request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'local'
  )
}

export function loginBlocked(ip) {
  const row = fails.get(ip)
  if (!row) return null
  if (row.until && row.until > Date.now()) {
    const min = Math.ceil((row.until - Date.now()) / 60000)
    return `${min} dk kilit`
  }
  if (row.until && row.until <= Date.now()) fails.delete(ip)
  return null
}

export function recordFail(ip) {
  const row = fails.get(ip) || { n: 0, until: 0 }
  row.n += 1
  if (row.n >= MAX_FAIL) {
    row.until = Date.now() + BLOCK_MS
    row.n = 0
  }
  fails.set(ip, row)
  return row
}

export function recordOk(ip) {
  fails.delete(ip)
}

export function adminConfigured() {
  return !!process.env.ADMIN_PASSWORD
}

export function checkAdmin(password) {
  if (!adminConfigured()) return false
  return safeEqual(String(password || ''), String(process.env.ADMIN_PASSWORD || ''))
}

export function verifyMetaSignature(rawBody, header) {
  const secret = process.env.META_APP_SECRET || ''
  if (!secret) return { ok: false, reason: 'META_APP_SECRET tanimli degil' }
  const got = String(header || '')
  const exp = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
  const a = Buffer.from(got)
  const b = Buffer.from(exp)
  if (a.length !== b.length) return { ok: false, reason: 'imza yok veya hatali' }
  if (!crypto.timingSafeEqual(a, b)) return { ok: false, reason: 'imza uyusmadi' }
  return { ok: true }
}

export { signSession, verifySession, cookieName, cookieOptions }
