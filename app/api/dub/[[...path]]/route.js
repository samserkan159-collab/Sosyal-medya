import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const BASE = (process.env.DUBLAJ_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')

function destUrl(request, pathSegments) {
  const src = new URL(request.url)
  const tail = (pathSegments || []).join('/')
  return `${BASE}/api/${tail}${src.search}`
}

async function proxy(request, context) {
  const { path: pathSegments = [] } = await context.params
  const target = destUrl(request, pathSegments)
  const headers = new Headers()
  const ct = request.headers.get('content-type')
  if (ct) headers.set('content-type', ct)
  const init = { method: request.method, headers }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body
    init.duplex = 'half'
  }
  try {
    const res = await fetch(target, init)
    const out = new Headers()
    const pass = ['content-type', 'content-disposition', 'cache-control', 'pragma']
    pass.forEach((k) => {
      const v = res.headers.get(k)
      if (v) out.set(k, v)
    })
    out.set('Access-Control-Allow-Origin', process.env.CORS_ORIGINS || '*')
    return new NextResponse(res.body, { status: res.status, headers: out })
  } catch (e) {
    return NextResponse.json({
      error: 'Ceviri motoru kapali',
      message: 'ASM video cevirici API (127.0.0.1:8000) yanit vermiyor. dublaj-ceviri-main icinde BASLAT_ASM.bat ile backend acin.',
      motor: false,
      detail: e.message,
    }, { status: 503 })
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': process.env.CORS_ORIGINS || '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    },
  })
}

export const GET = proxy
export const POST = proxy
export const PUT = proxy
export const PATCH = proxy
export const DELETE = proxy
