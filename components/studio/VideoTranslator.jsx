'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Upload, Download, Loader2, Trash2, Languages, Mic, Music2, Film, Wand2,
  AudioWaveform, CheckCircle2, AlertCircle, ArrowRight, RefreshCw,
} from 'lucide-react'

const API = '/api/dub'
const STAGES = [
  { key: 'extract', label: 'Ses Cikarma', icon: AudioWaveform },
  { key: 'separate', label: 'Vokal', icon: Music2 },
  { key: 'transcribe', label: 'Yaziya Dok', icon: Mic },
  { key: 'translate', label: 'Ceviri', icon: Languages },
  { key: 'tts', label: 'Seslendirme', icon: Wand2 },
  { key: 'mux', label: 'Birlestir', icon: Film },
]
const FALLBACK_LANGS = [
  { code: 'zh', name: 'Cince' }, { code: 'tr', name: 'Turkce' }, { code: 'en', name: 'Ingilizce' },
  { code: 'de', name: 'Almanca' }, { code: 'ar', name: 'Arapca' }, { code: 'fr', name: 'Fransizca' },
  { code: 'ru', name: 'Rusca' }, { code: 'ja', name: 'Japonca' }, { code: 'ko', name: 'Korece' },
  { code: 'es', name: 'Ispanyolca' }, { code: 'vi', name: 'Vietnamca' }, { code: 'fa', name: 'Farsca' },
]

function pctToDb(pct) {
  const p = Math.max(0, Number(pct) || 0)
  if (p <= 0.5) return -60
  return Math.round(20 * Math.log10(p / 100) * 10) / 10
}

function fmtTime(s) {
  if (s == null) return '00:00'
  const m = Math.floor(s / 60).toString().padStart(2, '0')
  const sec = Math.floor(s % 60).toString().padStart(2, '0')
  return `${m}:${sec}`
}

async function dubFetch(path, opts) {
  const res = await fetch(API + path, opts)
  const ct = res.headers.get('content-type') || ''
  const data = ct.includes('application/json') ? await res.json().catch(() => ({})) : {}
  if (!res.ok) throw new Error(data.message || data.error || data.detail || 'Istek basarisiz')
  return data
}

export default function VideoTranslator() {
  const [online, setOnline] = useState(null)
  const [voices, setVoices] = useState([])
  const [languages, setLanguages] = useState(FALLBACK_LANGS)
  const [targets, setTargets] = useState(FALLBACK_LANGS)
  const [voice, setVoice] = useState('Charon')
  const [srcLang, setSrcLang] = useState('zh')
  const [tgtLang, setTgtLang] = useState('tr')
  const [keepMusic, setKeepMusic] = useState(true)
  const [voicePct, setVoicePct] = useState(100)
  const [musicPct, setMusicPct] = useState(40)
  const [job, setJob] = useState(null)
  const [history, setHistory] = useState([])
  const [uploading, setUploading] = useState(false)
  const [drag, setDrag] = useState(false)
  const [draft, setDraft] = useState([])
  const [saving, setSaving] = useState(false)
  const [approving, setApproving] = useState(false)
  const [playingSeg, setPlayingSeg] = useState(null)
  const fileRef = useRef(null)
  const pollRef = useRef(null)

  const loadVoices = useCallback(async (tgt) => {
    try {
      const r = await dubFetch(`/voices?target_lang=${encodeURIComponent(tgt || 'tr')}`)
      setVoices(r.voices || [])
      if (r.default) setVoice(r.default)
    } catch { /* motor kapali */ }
  }, [])

  const ping = useCallback(async () => {
    try {
      const r = await dubFetch('/health')
      setOnline(r.api !== false)
      const [langs, tgts] = await Promise.all([
        dubFetch('/languages').catch(() => null),
        dubFetch('/target-languages').catch(() => null),
      ])
      if (langs?.languages) setLanguages((langs.languages || []).filter((l) => l.code !== 'auto'))
      if (tgts?.languages) setTargets(tgts.languages)
      if (tgts?.default) setTgtLang(tgts.default)
      await loadVoices(tgts?.default || 'tr')
      const jobs = await dubFetch('/jobs').catch(() => null)
      if (jobs?.items) setHistory(jobs.items)
    } catch {
      setOnline(false)
    }
  }, [loadVoices])

  const pollJob = useCallback(async (id) => {
    try {
      const r = await dubFetch(`/job/${id}`)
      setJob(r)
      if (r.status === 'done') {
        toast.success('Ceviri bitti — MP4 indirilebilir.')
        clearInterval(pollRef.current)
        pollRef.current = null
        dubFetch('/jobs').then((j) => setHistory(j.items || [])).catch(() => {})
      } else if (r.status === 'awaiting_review') {
        toast.success('Ceviri hazir. Satirlari kontrol edip onaylayin.')
        clearInterval(pollRef.current)
        pollRef.current = null
        dubFetch('/jobs').then((j) => setHistory(j.items || [])).catch(() => {})
      } else if (r.status === 'error') {
        toast.error(r.error?.split('\n')[0] || 'Ceviri hatasi')
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    } catch (e) {
      console.error(e)
    }
  }, [])

  const startPoll = useCallback((id) => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(() => pollJob(id), 1500)
  }, [pollJob])

  useEffect(() => { ping(); return () => { if (pollRef.current) clearInterval(pollRef.current) } }, [ping])

  useEffect(() => {
    if (job?.status === 'awaiting_review' && Array.isArray(job.segments)) {
      setDraft(job.segments.map((s) => ({ ...s, keep: s.keep !== false })))
      setPlayingSeg(null)
    }
  }, [job?.id, job?.status])

  const handleFile = async (file) => {
    if (!file) return
    if (!online) { toast.error('Ceviri motoru kapali — once ASM backend (8000) acin'); return }
    const ok = ['.mp4', '.mov', '.m4v', '.webm', '.mkv'].some((e) => file.name.toLowerCase().endsWith(e))
    if (!ok) { toast.error('MP4, MOV, M4V, WEBM veya MKV yukleyin'); return }
    setUploading(true)
    setJob(null)
    setDraft([])
    const fd = new FormData()
    fd.append('file', file)
    const qs = new URLSearchParams({
      voice,
      language: srcLang,
      target_language: tgtLang,
      audio_mode: keepMusic ? 'dub_with_music' : 'dub_only',
      music_db: String(pctToDb(musicPct)),
      voice_db: String(pctToDb(voicePct)),
    })
    try {
      const r = await fetch(`${API}/upload?${qs}`, { method: 'POST', body: fd })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.detail || data.message || data.error || 'Yukleme basarisiz')
      toast.success('Video yuklendi, ceviri basladi')
      const id = data.job_id
      const initial = await dubFetch(`/job/${id}`)
      setJob(initial)
      startPoll(id)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const saveSegs = async (silent) => {
    if (!job?.id) return false
    setSaving(true)
    try {
      await dubFetch(`/job/${job.id}/segments`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ segments: draft }) })
      if (!silent) toast.success('Satirlar kaydedildi')
      return true
    } catch (e) {
      toast.error(e.message)
      return false
    } finally { setSaving(false) }
  }

  const approve = async () => {
    if (!job?.id) return
    setApproving(true)
    try {
      if (!(await saveSegs(true))) return
      await dubFetch(`/job/${job.id}/approve`, { method: 'POST' })
      toast.success('Onaylandi — seslendirme basliyor')
      startPoll(job.id)
    } catch (e) { toast.error(e.message) } finally { setApproving(false) }
  }

  const reopen = async (id) => {
    const r = await dubFetch(`/job/${id}`)
    setJob(r)
    if (r.status === 'running' || r.status === 'queued') startPoll(id)
  }

  const remove = async (id) => {
    try {
      await dubFetch(`/job/${id}`, { method: 'DELETE' })
      toast.success('Is silindi')
      if (job?.id === id) setJob(null)
      const jobs = await dubFetch('/jobs')
      setHistory(jobs.items || [])
    } catch (e) { toast.error(e.message) }
  }

  const stageIdx = job ? STAGES.findIndex((s) => s.key === job.stage) : -1
  const reviewing = job?.status === 'awaiting_review'
  const segs = reviewing ? draft : (job?.segments || [])
  const kept = segs.filter((s) => s.keep !== false).length
  const stamp = encodeURIComponent(String(job?.updated_at || job?.status || ''))
  const previewSrc = job
    ? (job.status === 'done' ? `${API}/job/${job.id}/download?v=${stamp}` : `${API}/job/${job.id}/source?v=${stamp}`)
    : ''

  return (
    <div className="space-y-4">
      <div className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs ${online ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-300' : 'border-amber-500/30 bg-amber-950/20 text-amber-300'}`}>
        <span>{online === null ? 'Motor kontrol ediliyor...' : online ? 'ASM ceviri motoru bagli (Gemini + Edge-TTS / ses API)' : 'Motor kapali — dublaj-ceviri-main icinde BASLAT_ASM.bat ile 8000 acin'}</span>
        <button type="button" onClick={ping} className="inline-flex items-center gap-1 text-zinc-400 hover:text-zinc-200"><RefreshCw className="h-3 w-3" /> Yenile</button>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
        <Card className="border-zinc-800 bg-zinc-900/70 lg:col-span-3">
          <CardHeader className="py-2 px-3">
            <CardTitle className="flex items-center gap-2 text-sm"><Languages className="h-4 w-4 text-sky-400" /> Video Cevirici</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-3 pb-3">
            <p className="text-xs text-zinc-500">Ana dili sec, hedefe dublajla. Motor: transcribe + ceviri (Gemini) ve seslendirme API.</p>
            <div>
              <p className="mb-1.5 text-[11px] uppercase tracking-wider text-zinc-500">Ana dil</p>
              <ChipRow items={languages} value={srcLang} onChange={setSrcLang} disabled={uploading || job?.status === 'running'} />
            </div>
            <div>
              <p className="mb-1.5 text-[11px] uppercase tracking-wider text-zinc-500">Hedef dil</p>
              <ChipRow items={targets} value={tgtLang} onChange={(c) => { setTgtLang(c); loadVoices(c) }} disabled={uploading || job?.status === 'running'} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs text-zinc-500">Ses</label>
              <select value={voice} onChange={(e) => setVoice(e.target.value)} disabled={uploading || job?.status === 'running'} className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200">
                {(voices.length ? voices : [{ id: 'Charon', name: 'Charon' }]).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
              <button type="button" onClick={() => setKeepMusic(true)} className={`rounded-md border px-2 py-1 text-xs ${keepMusic ? 'border-sky-500 bg-sky-500/15 text-sky-300' : 'border-zinc-700 text-zinc-400'}`}>Muzik kalsin</button>
              <button type="button" onClick={() => setKeepMusic(false)} className={`rounded-md border px-2 py-1 text-xs ${!keepMusic ? 'border-orange-500 bg-orange-500/15 text-orange-300' : 'border-zinc-700 text-zinc-400'}`}>Muzigi sil</button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs text-zinc-400">
              <label>Ses %{voicePct}<input type="range" min="20" max="140" value={voicePct} onChange={(e) => setVoicePct(Number(e.target.value))} className="mt-1 w-full accent-indigo-500" /></label>
              {keepMusic && <label>Muzik %{musicPct}<input type="range" min="10" max="100" value={musicPct} onChange={(e) => setMusicPct(Number(e.target.value))} className="mt-1 w-full accent-sky-500" /></label>}
            </div>
            <p className="flex items-center gap-1.5 text-xs text-zinc-400">
              <span>{languages.find((l) => l.code === srcLang)?.name || srcLang}</span>
              <ArrowRight className="h-3.5 w-3.5 text-sky-400" />
              <span className="text-sky-300">{targets.find((l) => l.code === tgtLang)?.name || tgtLang}</span>
            </p>
            <label
              className={`flex min-h-[140px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 text-center ${drag ? 'border-sky-500 bg-sky-950/20' : 'border-zinc-700 bg-zinc-950/50 hover:border-sky-500/50'} ${!online || uploading ? 'pointer-events-none opacity-70' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files?.[0]) }}
            >
              {uploading ? <Loader2 className="h-8 w-8 animate-spin text-sky-400" /> : <Upload className="h-8 w-8 text-zinc-500" />}
              <p className="text-sm text-zinc-300">{uploading ? 'Yukleniyor...' : 'Video birak veya tikla'}</p>
              <p className="text-xs text-zinc-600">MP4, MOV, M4V, WEBM, MKV</p>
              <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
            </label>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/70 lg:col-span-2">
          <CardHeader className="py-2 px-3"><CardTitle className="text-sm">Islem Hatti</CardTitle></CardHeader>
          <CardContent className="space-y-2 px-3 pb-3">
            {STAGES.map((s, i) => {
              const Icon = s.icon
              const on = i <= stageIdx && stageIdx >= 0
              const err = job?.status === 'error' && s.key === job.stage
              const done = job?.status === 'done'
              return (
                <div key={s.key} className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs ${err ? 'border-red-800 bg-red-950/30 text-red-300' : on || done ? 'border-sky-800/60 bg-sky-950/20 text-sky-200' : 'border-zinc-800 text-zinc-500'}`}>
                  {err ? <AlertCircle className="h-3.5 w-3.5" /> : on || done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                  {s.label}
                </div>
              )
            })}
            {job && <p className="pt-1 text-[11px] text-zinc-500">{job.message || job.status}{job.progress != null ? ` · %${job.progress}` : ''}</p>}
            {job?.status === 'error' && <p className="text-[11px] text-red-300">{job.error?.split('\n')[0]}</p>}
          </CardContent>
        </Card>
      </div>

      {job && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
          <Card className="border-zinc-800 bg-zinc-900/70 lg:col-span-2">
            <CardHeader className="py-2 px-3"><CardTitle className="text-sm">{job.status === 'done' ? 'Onizleme' : 'Kaynak video'}</CardTitle></CardHeader>
            <CardContent className="space-y-2 px-3 pb-3">
              {(job.status === 'done' || reviewing || job.status === 'running' || job.status === 'queued') ? (
                <video key={previewSrc} src={previewSrc} controls className="mx-auto max-h-[280px] w-full rounded-md border border-zinc-800 bg-black" />
              ) : <p className="py-8 text-center text-xs text-zinc-500">Hazirlaniyor...</p>}
              <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-500">
                <span>{job.duration ? `${Number(job.duration).toFixed(1)} sn` : '—'} · {job.voice}</span>
                <a href={job.status === 'done' ? `${API}/job/${job.id}/download?v=${stamp}` : undefined} className={`inline-flex items-center gap-1 ${job.status === 'done' ? 'text-emerald-300 hover:underline' : 'pointer-events-none text-zinc-600'}`}>
                  <Download className="h-3 w-3" /> MP4 Indir
                </a>
              </div>
            </CardContent>
          </Card>
          <Card className="border-zinc-800 bg-zinc-900/70 lg:col-span-3">
            <CardHeader className="py-2 px-3">
              <CardTitle className="text-sm">{reviewing ? `Kontrol kapisi (${kept}/${segs.length})` : 'Metin karsilastirma'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 px-3 pb-3">
              {!segs.length ? <p className="py-8 text-center text-xs text-zinc-600">Transkripsiyon bitince satirlar burada.</p> : (
                <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                  {segs.map((s) => (
                    <div key={s.id} className={`rounded-md border p-2 ${s.keep === false ? 'border-zinc-800 opacity-50' : 'border-zinc-800 bg-zinc-950/60'}`}>
                      <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                        {reviewing && (
                          <label className="inline-flex items-center gap-1 text-zinc-300">
                            <input type="checkbox" checked={s.keep !== false} onChange={() => setDraft((p) => p.map((x) => x.id === s.id ? { ...x, keep: !x.keep } : x))} /> Al
                          </label>
                        )}
                        <span className="font-mono">{fmtTime(s.start)} → {fmtTime(s.end)}</span>
                        {reviewing && (
                          <button type="button" className="text-sky-400 hover:underline" onClick={() => setPlayingSeg((c) => c === s.id ? null : s.id)}>
                            {playingSeg === s.id ? 'Durdur' : 'Orijinal ses'}
                          </button>
                        )}
                      </div>
                      {reviewing && playingSeg === s.id && (
                        <audio className="mb-2 w-full" controls autoPlay src={`${API}/job/${job.id}/segment/${s.id}/audio`} />
                      )}
                      <p className="text-xs text-zinc-400">{s.text_src || s.text_zh || ''}</p>
                      {reviewing ? (
                        <textarea value={s.text_tr || ''} onChange={(e) => setDraft((p) => p.map((x) => x.id === s.id ? { ...x, text_tr: e.target.value } : x))} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200" rows={2} />
                      ) : <p className="mt-1 text-xs text-zinc-200">{s.text_tr}</p>}
                    </div>
                  ))}
                </div>
              )}
              {reviewing && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" variant="outline" disabled={saving || approving} onClick={() => saveSegs(false)} className="border-zinc-700">{saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null} Satirlari kaydet</Button>
                  <Button size="sm" disabled={saving || approving || kept === 0} onClick={approve} className="bg-sky-600 hover:bg-sky-500">{approving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null} Onayla ve seslendir</Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="border-zinc-800 bg-zinc-900/70">
        <CardHeader className="py-2 px-3"><CardTitle className="text-sm">Onceki islemler</CardTitle></CardHeader>
        <CardContent className="px-3 pb-3">
          {!history.length ? <p className="py-6 text-center text-xs text-zinc-600">Henuz is yok.</p> : (
            <div className="space-y-1.5">
              {history.slice(0, 20).map((h) => (
                <div key={h.id} className="flex items-center justify-between gap-2 rounded-md border border-zinc-800 bg-zinc-950/40 px-2 py-1.5 text-xs">
                  <button type="button" onClick={() => reopen(h.id)} className="min-w-0 flex-1 truncate text-left text-zinc-300 hover:text-sky-300">{h.filename || h.id}</button>
                  <span className="shrink-0 text-zinc-500">{h.status}</span>
                  <button type="button" onClick={() => remove(h.id)} className="text-red-300 hover:text-red-200"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function ChipRow({ items, value, onChange, disabled }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {(items || []).map((lng) => (
        <button
          key={lng.code}
          type="button"
          disabled={disabled}
          onClick={() => onChange(lng.code)}
          className={`rounded-md border px-2 py-1 text-[11px] ${lng.code === value ? 'border-sky-500 bg-sky-500/15 text-sky-300' : 'border-zinc-700 text-zinc-400 hover:text-zinc-200'}`}
        >
          {lng.name}
        </button>
      ))}
    </div>
  )
}
