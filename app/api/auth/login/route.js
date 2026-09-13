import { NextResponse } from 'next/server'
import {
  adminConfigured,
  checkAdmin,
  clientIp,
  cookieName,
  cookieOptions,
  loginBlocked,
  recordFail,
  recordOk,
  signSession,
} from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request) {
  if (!adminConfigured()) {
    return NextResponse.json({ error: 'ADMIN_PASSWORD tanimli degil' }, { status: 503 })
  }
  const ip = clientIp(request)
  const blocked = loginBlocked(ip)
  if (blocked) {
    return NextResponse.json({ error: `Cok fazla hatali deneme. ${blocked} sonra tekrar dene.` }, { status: 429 })
  }
  const b = await request.json().catch(() => ({}))
  if (!checkAdmin(b.password)) {
    const row = recordFail(ip)
    const left = row.until > Date.now() ? 0 : Math.max(0, 5 - row.n)
    return NextResponse.json({
      error: row.until > Date.now()
        ? '5 hatali deneme — 15 dk kilit.'
        : `Hatali sifre. Kalan deneme: ${left}`,
    }, { status: 401 })
  }
  recordOk(ip)
  const token = await signSession('admin')
  const res = NextResponse.json({ ok: true })
  res.cookies.set(cookieName(), token, cookieOptions())
  return res
}
