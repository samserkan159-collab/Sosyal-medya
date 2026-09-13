'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { ArrowRightLeft, Clapperboard, Download, Film, Image as ImageIcon, Loader2, Sparkles, Upload } from 'lucide-react'
import { modelCatalog } from '@/lib/videoai-models'

const api = async (path, opts) => {
  const res = await fetch('/api' + path, opts)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.message || data.error || 'Istek basarisiz')
  return data
}

const EMPTY_SLOTS = [
  { role: 'Ben (kisi)', preview: '', data: '', file: null },
  { role: 'Klima / urun', preview: '', data: '', file: null },
  { role: 'Veri ekrani', preview: '', data: '', file: null },
]

export default function AiVideoStudio() {
  const [models, setModels] = useState(() => modelCatalog())
  const [aiOn, setAiOn] = useState(true)
  const [description, setDescription] = useState('')
  const [prompt, setPrompt] = useState('')
  const [promptTr, setPromptTr] = useState('')
  const [titleTr, setTitleTr] = useState('')
  const [notesTr, setNotesTr] = useState('')
  const [trDirty, setTrDirty] = useState(false)
  const [promptBusy, setPromptBusy] = useState(false)
  const [syncBusy, setSyncBusy] = useState(false)
  const [modelId, setModelId] = useState('veo-lite')
  const [seconds, setSeconds] = useState(4)
  const [genBusy, setGenBusy] = useState(false)
  const [job, setJob] = useState(null)
  const [slots, setSlots] = useState(EMPTY_SLOTS)
  const [vidName, setVidName] = useState('')
  const videoRef = useRef(null)
  const pollRef = useRef(null)
  const filledSlots = slots.filter((s) => s.file || s.data)

  const spec = models.find((m) => m.id === modelId)
  const priceRow = spec?.prices?.find((p) => p.seconds === seconds)

  useEffect(() => {
    api('/video-ai/models').then((r) => {
      setAiOn(r.ai !== false)
      if (r.models?.length) setModels(r.models)
    }).catch(() => setAiOn(true))
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  useEffect(() => {
    if (!spec) return
    if (!spec.durations.includes(seconds)) setSeconds(spec.durations[0])
  }, [modelId, spec, seconds])

  const makePrompt = async (kind) => {
    const file = kind === 'video' ? videoRef.current?.files?.[0] : null
    if (kind === 'video' && !file && !description.trim()) {
      toast.error('Video yukleyin veya aciklama yazin')
      return
    }
    if (kind === 'image' && !filledSlots.length && !description.trim()) {
      toast.error('En az 1 resim yukleyin (ben / klima / ekran)')
      return
    }
    const sceneTr = (promptTr.trim() || description.trim())
    if (kind === 'text' && !sceneTr) { toast.error('Turkce sahneyi yazin (ust kutu veya not)'); return }
    setPromptBusy(true)
    const fd = new FormData()
    fd.set('kind', kind)
    fd.set('description', kind === 'text' ? sceneTr : description)
    if (file) fd.set('file', file)
    slots.forEach((s, i) => {
      fd.set('role' + (i + 1), s.role)
      if (s.file) fd.set('img' + (i + 1), s.file)
    })
    try {
      const r = await api('/video-ai/prompt', { method: 'POST', body: fd })
      setPrompt(r.prompt || '')
      setPromptTr(r.promptTr || '')
      setTitleTr(r.titleTr || '')
      setNotesTr(r.notesTr || '')
      setTrDirty(false)
      toast.success(kind === 'text' ? 'Turkce sahnen Ingilizceye cevrildi' : 'Sahne hazir — Turkceyi oku/duzenle, modele Ingilizce gider')
    } catch (e) { toast.error(e.message) } finally { setPromptBusy(false) }
  }

  const onSlotImage = (index, file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const data = String(reader.result || '')
      setSlots((prev) => prev.map((s, i) => (i === index ? { ...s, file, data, preview: data } : s)))
    }
    reader.readAsDataURL(file)
  }

  const setSlotRole = (index, role) => {
    setSlots((prev) => prev.map((s, i) => (i === index ? { ...s, role } : s)))
  }

  const startPoll = (id) => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const r = await api('/video-ai/job/' + id)
        setJob(r)
        if (r.status === 'DONE') {
          clearInterval(pollRef.current)
          pollRef.current = null
          toast.success('Video hazir')
        } else if (r.status === 'ERROR') {
          clearInterval(pollRef.current)
          pollRef.current = null
          toast.error(r.error || 'Uretim hatasi')
        }
      } catch (e) {
        clearInterval(pollRef.current)
        pollRef.current = null
        toast.error(e.message)
      }
    }, 8000)
  }

  const syncLang = async (source) => {
    const text = source === 'tr' ? promptTr : prompt
    if (!text.trim()) {
      toast.error(source === 'tr' ? 'Once Turkce sahneyi yazin' : 'Once Ingilizce prompt olsun')
      return null
    }
    setSyncBusy(true)
    try {
      const r = await api('/video-ai/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, text }),
      })
      if (r.prompt) setPrompt(r.prompt)
      if (r.promptTr) setPromptTr(r.promptTr)
      setTrDirty(false)
      toast.success(source === 'tr' ? 'Ingilizce guncellendi — modele bu gidecek' : 'Turkce ceviri guncellendi')
      return r.prompt || prompt
    } catch (e) {
      toast.error(e.message)
      return null
    } finally { setSyncBusy(false) }
  }

  const generate = async () => {
    if (!prompt.trim() && !promptTr.trim()) { toast.error('Once sahne yazin veya prompt olusturun'); return }
    if (!priceRow) { toast.error('Model / sure secin'); return }
    setGenBusy(true)
    setJob(null)
    try {
      let en = prompt.trim()
      if ((!en || trDirty) && promptTr.trim()) {
        const synced = await syncLang('tr')
        if (synced) en = synced
      }
      if (!en) { toast.error('Ingilizce veya Turkce sahne yazin'); setGenBusy(false); return }
      const r = await api('/video-ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId,
          seconds,
          prompt: en,
          images: slots.filter((s) => s.data).map((s) => ({ role: s.role, image: s.data })),
        }),
      })
      setJob(r)
      toast.success(`Uretim basladi — tahmini ${priceRow.label}`)
      startPoll(r.id)
    } catch (e) { toast.error(e.message) } finally { setGenBusy(false) }
  }

  return (
    <div className="space-y-4">
      <div className={`rounded-lg border px-3 py-2 text-xs ${aiOn ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-300' : 'border-amber-500/30 bg-amber-950/20 text-amber-300'}`}>
        {aiOn == null ? 'Gemini kontrol...' : aiOn ? 'Gemini bagli — sen Turkce sahne yazarsin, biz Ingilizceye ceviririz. Video okuma: tam dosya degil, 5 kare (ucuz). Uretim ucreti saniye x model.' : 'GEMINI_API_KEY yok'}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
        <Card className="border-zinc-800 bg-zinc-900/70 lg:col-span-3">
          <CardHeader className="py-2 px-3">
            <CardTitle className="flex items-center gap-2 text-sm"><Clapperboard className="h-4 w-4 text-fuchsia-400" /> AI Video — sahne + uretim</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-3 pb-3">
            <p className="text-xs text-zinc-500">3 resim: 1 sen, 2 klima, 3 veri ekrani. Model bunlari birlestirip video yapar. Video kutusu sadece sahne okumak icin (5 kare).</p>

            <label className="flex min-h-[88px] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-zinc-700 bg-zinc-950/50 p-3 text-center hover:border-sky-500/50">
              <Film className="h-5 w-5 text-sky-400" />
              <span className="text-xs text-zinc-300">Referans video (opsiyonel)</span>
              <span className="text-[11px] text-zinc-600">{vidName || 'MP4 — 5 kare, tam video gitmez'}</span>
              <input ref={videoRef} type="file" accept="video/*" className="hidden" onChange={(e) => setVidName(e.target.files?.[0]?.name || '')} />
            </label>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {slots.map((s, i) => (
                <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-2">
                  <input
                    value={s.role}
                    onChange={(e) => setSlotRole(i, e.target.value)}
                    className="mb-1.5 w-full rounded border border-zinc-800 bg-zinc-900 px-1.5 py-1 text-[11px] text-zinc-200"
                  />
                  <label className="flex min-h-[96px] cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-zinc-700 p-2 text-center hover:border-fuchsia-500/50">
                    {s.preview ? <img src={s.preview} alt="" className="max-h-16 rounded object-contain" /> : <ImageIcon className="h-5 w-5 text-fuchsia-400" />}
                    <span className="text-[10px] text-zinc-500">{s.preview ? 'Degistir' : `${i + 1}. resmi yukle`}</span>
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => onSlotImage(i, e.target.files?.[0])} />
                  </label>
                </div>
              ))}
            </div>

            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Istersen kisa not. Asil sahneyi asagidaki Turkce kutuya yaz." className="border-zinc-800 bg-zinc-950 text-sm" />

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={promptBusy} onClick={() => makePrompt('video')} className="border-sky-800 text-sky-200">
                {promptBusy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Film className="mr-1 h-3.5 w-3.5" />} Videodan (5 kare)
              </Button>
              <Button size="sm" variant="outline" disabled={promptBusy} onClick={() => makePrompt('image')} className="border-fuchsia-800 text-fuchsia-200">
                {promptBusy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="mr-1 h-3.5 w-3.5" />} 3 resimden prompt
              </Button>
              <Button size="sm" variant="outline" disabled={promptBusy} onClick={() => makePrompt('text')} className="border-zinc-700">
                {promptBusy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />} Turkceyi Ingilizceye cevir
              </Button>
            </div>

            {titleTr && <p className="text-xs text-zinc-400">{titleTr}{notesTr ? ` — ${notesTr}` : ''}</p>}

            <div className="space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-[11px] uppercase tracking-wider text-zinc-400">Sahne (Turkce) — oku, kendi dilinde duzenle</label>
                <Button size="sm" variant="outline" disabled={syncBusy || promptBusy || !promptTr.trim()} onClick={() => syncLang('tr')} className="h-7 border-sky-800 text-sky-200">
                  {syncBusy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <ArrowRightLeft className="mr-1 h-3.5 w-3.5" />}
                  Turkceyi Ingilizceye yaz
                </Button>
              </div>
              <Textarea
                rows={6}
                value={promptTr}
                onChange={(e) => { setPromptTr(e.target.value); setTrDirty(true) }}
                placeholder="Sahneyi buraya Turkce yaz. Ornek: atolyede 2.5 ton VRF, yavas yaklasim, gun isigi, ızgaralar net."
                className="border-zinc-700 bg-zinc-950 text-sm text-zinc-100"
              />
              {trDirty && <p className="text-[11px] text-amber-300">Turkce degisti — uretmeden once Ingilizce guncellenir.</p>}
            </div>

            <div className="space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-[11px] uppercase tracking-wider text-zinc-500">Modele gidecek Ingilizce (video modeli bunu daha iyi anlar)</label>
                <Button size="sm" variant="ghost" disabled={syncBusy || promptBusy || !prompt.trim()} onClick={() => syncLang('en')} className="h-7 text-zinc-400 hover:text-zinc-200">
                  {syncBusy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <ArrowRightLeft className="mr-1 h-3.5 w-3.5" />}
                  Ingilizceyi Turkceye yaz
                </Button>
              </div>
              <Textarea rows={5} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Veo / Omni burayi okur." className="border-zinc-800 bg-zinc-950 font-mono text-[11px] text-zinc-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/70 lg:col-span-2">
          <CardHeader className="py-2 px-3"><CardTitle className="text-sm">Model ve ucret</CardTitle></CardHeader>
          <CardContent className="space-y-2 px-3 pb-3">
            <p className="text-[11px] text-zinc-500">Resmi Gemini fiyatı (720p, saniye × tarif). Uretim baslayinca bu tutar faturaya yansir.</p>
            <div className="space-y-2">
              {models.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setModelId(m.id)}
                  className={`w-full rounded-lg border px-2.5 py-2 text-left ${modelId === m.id ? 'border-fuchsia-500 bg-fuchsia-950/30' : 'border-zinc-800 bg-zinc-950/40'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-zinc-100">{m.name}</span>
                    <span className="text-[11px] text-fuchsia-300">${m.usdPerSec.toFixed(2)} / sn</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-zinc-500">{m.blurb}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {m.prices.map((p) => (
                      <span
                        key={p.seconds}
                        role="button"
                        onClick={(e) => { e.stopPropagation(); setModelId(m.id); setSeconds(p.seconds) }}
                        className={`rounded px-1.5 py-0.5 text-[10px] ${modelId === m.id && seconds === p.seconds ? 'bg-fuchsia-600 text-white' : 'bg-zinc-800 text-zinc-400'}`}
                      >
                        {p.label}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
            {spec && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-xs text-zinc-500">Sure</span>
                {spec.durations.map((s) => (
                  <button key={s} type="button" onClick={() => setSeconds(s)} className={`rounded-md border px-2 py-1 text-xs ${seconds === s ? 'border-fuchsia-500 bg-fuchsia-500/15 text-fuchsia-200' : 'border-zinc-700 text-zinc-400'}`}>
                    {s} sn
                  </button>
                ))}
              </div>
            )}
            <p className="text-sm font-semibold text-zinc-100">
              Secim: {spec?.name || '—'} · {priceRow ? priceRow.label : '—'}
            </p>
            <Button
              type="button"
              onClick={generate}
              disabled={genBusy || syncBusy}
              className="w-full bg-fuchsia-600 hover:bg-fuchsia-500"
            >
              {genBusy || syncBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              {priceRow ? `Videoyu uret (${priceRow.label})` : 'Videoyu uret'}
            </Button>
            {job && (
              <div className="space-y-2 rounded-md border border-zinc-800 bg-zinc-950/50 p-2">
                <p className="text-xs text-zinc-400">Durum: <span className="text-zinc-200">{job.status}</span>{job.estimatedUsd != null ? ` · ~$${job.estimatedUsd}` : ''}</p>
                {job.error && <p className="text-xs text-red-300">{job.error}</p>}
                {job.status === 'RUNNING' && <p className="text-[11px] text-zinc-500">Uretim 1-3 dk surebilir...</p>}
                {job.status === 'DONE' && job.videoUrl && (
                  <>
                    <video src={job.videoUrl} controls className="mx-auto max-h-64 w-full rounded border border-zinc-800 bg-black" />
                    <a href={job.videoUrl} className="inline-flex items-center gap-1 text-xs text-emerald-300 hover:underline"><Download className="h-3.5 w-3.5" /> Indir</a>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
