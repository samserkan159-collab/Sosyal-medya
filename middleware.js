import { NextResponse } from 'next/server'
import { cookieName, isPublicPath, verifySession } from '@/lib/auth-session'

export async function middleware(request) {
  const { pathname } = request.nextUrl
  if (request.method === 'OPTIONS') return NextResponse.next()
  if (isPublicPath(pathname)) {
    if (pathname === '/login') {
      const token = request.cookies.get(cookieName())?.value
      if (token && await verifySession(token)) {
        return NextResponse.redirect(new URL('/', request.url))
      }
    }
    return NextResponse.next()
  }

  const token = request.cookies.get(cookieName())?.value
  const session = token ? await verifySession(token) : null
  if (session) return NextResponse.next()

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Oturum gerekli' }, { status: 401 })
  }
  const login = new URL('/login', request.url)
  login.searchParams.set('next', pathname)
  return NextResponse.redirect(login)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
