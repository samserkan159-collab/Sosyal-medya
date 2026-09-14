import { NextResponse } from 'next/server'
import { createReadStream, statSync } from 'fs'
import { Readable } from 'node:stream'
import {
  dublajConfigured,
  languages,
  targetLanguages,
  voicesFor,
  createJobFromUpload,
  getJob,
  publicJob,
  listJobs,
  updateSegments,
  approveJob,
  deleteJob,
  outputFile,
  sourceFile,
} from '@/lib/dublaj-live'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

function json(data, status = 200) {
  const res = NextResponse.json(data, { status })
  res.headers.set('Access-Control-Allow-Origin', process.env.CORS_ORIGINS || '*')
  return res
}

function fileResponse(abs, filename, mime = 'video/mp4') {
  const stat = statSync(abs)
  const stream = Readable.toWeb(createReadStream(abs))
  return new NextResponse(stream, {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Content-Length': String(stat.size),
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': process.env.CORS_ORIGINS || '*',
    },
  })
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

export async function GET(request, context) {
  const { path: segs = [] } = await context.params
  const route = '/' + segs.join('/')
  const url = new URL(request.url)

  if (route === '/health' || route === '/') {
    return json({
      ok: dublajConfigured(),
      api: true,
      name: 'ASM Cockpit Dublaj (Gemini)',
      mongo: false,
      motor: dublajConfigured() ? 'gemini' : 'yok',
    })
  }
  if (route === '/languages') return json(languages())
  if (route === '/target-languages') return json(targetLanguages())
  if (route === '/voices') return json(voicesFor(url.searchParams.get('target_lang') || 'tr'))
  if (route === '/jobs') return json({ items: listJobs() })
  if (route === '/kling/config') return json({ configured: false, motor: true, estimated_costs: {}, error: 'Kling canli panoda henuz yok' })
  if (route.startsWith('/kling/')) return json({ error: 'Kling canli panoda henuz yok' }, 501)

  const jobMatch = route.match(/^\/job\/([^/]+)$/)
  if (jobMatch) {
    const job = publicJob(getJob(jobMatch[1]))
    if (!job) return json({ error: 'Is bulunamadi' }, 404)
    return json(job)
  }
  const dl = route.match(/^\/job\/([^/]+)\/download$/)
  if (dl) {
    const abs = outputFile(dl[1])
    if (!abs) return json({ error: 'Cikti henuz hazir degil' }, 404)
    return fileResponse(abs, `dublaj_${dl[1]}.mp4`)
  }
  const src = route.match(/^\/job\/([^/]+)\/source$/)
  if (src) {
    const abs = sourceFile(src[1])
    if (!abs) return json({ error: 'Kaynak video yok' }, 404)
    return fileResponse(abs, 'kaynak.mp4')
  }
  return json({ error: 'yol yok' }, 404)
}

export async function POST(request, context) {
  const { path: segs = [] } = await context.params
  const route = '/' + segs.join('/')
  const url = new URL(request.url)

  if (route === '/upload') {
    if (!dublajConfigured()) return json({ error: 'GEMINI_API_KEY yok' }, 503)
    const form = await request.formData()
    const file = form.get('file')
    if (!file || typeof file.arrayBuffer !== 'function') return json({ error: 'Dosya yok' }, 400)
    try {
      const job = await createJobFromUpload({
        file,
        filename: file.name,
        voice: url.searchParams.get('voice') || form.get('voice') || 'Charon',
        language: url.searchParams.get('language') || 'zh',
        target_language: url.searchParams.get('target_language') || 'tr',
        audio_mode: url.searchParams.get('audio_mode') || 'dub_with_music',
        voice_db: url.searchParams.get('voice_db'),
        music_db: url.searchParams.get('music_db'),
      })
      return json({ job_id: job.id, status: job.status, language: job.language, target_language: job.target_language, audio_mode: job.audio_mode })
    } catch (e) {
      return json({ error: e.message }, 400)
    }
  }

  if (route.startsWith('/kling/')) return json({ error: 'Kling canli panoda henuz yok' }, 501)

  const approve = route.match(/^\/job\/([^/]+)\/approve$/)
  if (approve) {
    try {
      const job = publicJob(approveJob(approve[1]))
      return json({ ok: true, job_id: job.id, status: job.status })
    } catch (e) {
      return json({ error: e.message }, 400)
    }
  }
  return json({ error: 'yol yok' }, 404)
}

export async function PATCH(request, context) {
  const { path: segs = [] } = await context.params
  const route = '/' + segs.join('/')
  const m = route.match(/^\/job\/([^/]+)\/segments$/)
  if (!m) return json({ error: 'yol yok' }, 404)
  try {
    const body = await request.json()
    const job = updateSegments(m[1], body.segments || [])
    return json({ ok: true, segments: job.segments })
  } catch (e) {
    return json({ error: e.message }, 400)
  }
}

export async function DELETE(request, context) {
  const { path: segs = [] } = await context.params
  const route = '/' + segs.join('/')
  const m = route.match(/^\/job\/([^/]+)$/)
  if (!m) return json({ error: 'yol yok' }, 404)
  if (!deleteJob(m[1])) return json({ error: 'Is bulunamadi' }, 404)
  return json({ ok: true })
}
