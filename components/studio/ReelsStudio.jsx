'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import {
  ImageUp, Scissors, Type, MoveUpRight, Square, Circle as CircleIcon, Star, RectangleHorizontal,
  Music, Video, Youtube, Facebook, Instagram, Loader2, Trash2, ArrowUp, ArrowDown, CalendarClock, Bold,
} from 'lucide-react'

const api = async (path, opts) => {
  const res = await fetch('/api' + path, { headers: { 'Content-Type': 'application/json' }, ...opts })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.message || data.error || 'Istek basarisiz')
  return data
}

const CW = 360, CH = 640, MULT = 1080 / CW

function makeStarPoints(spikes = 5, outer = 42, inner = 18) {
  const pts = []
  const step = Math.PI / spikes
  let rot = -Math.PI / 2
  for (let i = 0; i < spikes; i++) {
    pts.push({ x: Math.cos(rot) * outer, y: Math.sin(rot) * outer }); rot += step
    pts.push({ x: Math.cos(rot) * inner, y: Math.sin(rot) * inner }); rot += step
  }
  return pts
}

export default function ReelsStudio({ pageId, integrations = {} }) {
  const canvasElRef = useRef(null)
  const fabricRef = useRef(null)
  const canvasRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [bgBusy, setBgBusy] = useState(false)
  const [sel, setSel] = useState(null)

  const [audioMode, setAudioMode] = useState('preset')
  const [presetId, setPresetId] = useState('enerjik')
  const [presets, setPresets] = useState([])
  const [audioFile, setAudioFile] = useState(null)
  const [rendering, setRendering] = useState(false)
  const [job, setJob] = useState(null)
  const [publishing, setPublishing] = useState('')

  const [schedAt, setSchedAt] = useState('')
  const [schedPlatforms, setSchedPlatforms] = useState({ youtube: false, facebook: true, instagram: false })
  const [schedCaption, setSchedCaption] = useState('')

  useEffect(() => {
    let disposed = false
    ;(async () => {
      const fabric = await import('fabric')
      if (disposed) return
      fabricRef.current = fabric
      const canvas = new fabric.Canvas(canvasElRef.current, { backgroundColor: '#0b0b12', preserveObjectStacking: true })
      canvas.setDimensions({ width: CW, height: CH })
      const bg = new fabric.Rect({
        left: 0, top: 0, width: CW, height: CH, selectable: false, evented: false,
        fill: new fabric.Gradient({ type: 'linear', coords: { x1: 0, y1: 0, x2: 0, y2: CH }, colorStops: [{ offset: 0, color: '#111827' }, { offset: 1, color: '#0b1e2e' }] }),
      })
      canvas.add(bg)
      const sync = () => {
        const o = canvas.getActiveObject()
        if (!o) return setSel(null)
        setSel({
          isText: o.type === 'textbox',
          fill: typeof o.fill === 'string' ? o.fill : '#ffffff',
          stroke: o.stroke || '#000000',
          strokeWidth: o.strokeWidth || 0,
          opacity: o.opacity ?? 1,
          fontSize: o.fontSize || 28,
          bold: o.fontWeight === 'bold',
          bg: o.backgroundColor || '#16a34a',
        })
      }
      canvas.on('selection:created', sync)
      canvas.on('selection:updated', sync)
      canvas.on('selection:cleared', () => setSel(null))
      canvasRef.current = canvas
      setReady(true)
    })()
    return () => { disposed = true; try { canvasRef.current?.dispose() } catch (e) {} }
  }, [])

  useEffect(() => { api('/studio/presets').then(setPresets).catch(() => {}) }, [])

  const f = () => fabricRef.current
  const c = () => canvasRef.current
  const place = (obj) => { const canvas = c(); canvas.add(obj); canvas.setActiveObject(obj); canvas.requestRenderAll() }

  const addText = () => { const fabric = f(); place(new fabric.Textbox('Yaziniz', { left: 40, top: 60, width: 240, fontSize: 30, fontWeight: 'bold', fill: '#ffffff', fontFamily: 'Arial', editable: true, padding: 4 })) }
  const addArrow = () => { const fabric = f(); const p = new fabric.Path('M0,15 L40,15 L40,3 L64,22 L40,41 L40,29 L0,29 Z', { left: 80, top: 260, fill: '#ef4444', stroke: '', scaleX: 1.4, scaleY: 1.4 }); place(p) }
  const addRect = () => { const fabric = f(); place(new fabric.Rect({ left: 60, top: 120, width: 140, height: 80, fill: 'rgba(59,130,246,0.35)', stroke: '#3b82f6', strokeWidth: 3 })) }
  const addRounded = () => { const fabric = f(); place(new fabric.Rect({ left: 60, top: 220, width: 160, height: 70, rx: 18, ry: 18, fill: 'rgba(16,185,129,0.25)', stroke: '#10b981', strokeWidth: 3 })) }
  const addCircle = () => { const fabric = f(); place(new fabric.Circle({ left: 120, top: 300, radius: 46, fill: 'rgba(217,70,239,0.25)', stroke: '#d946ef', strokeWidth: 3 })) }
  const addStar = () => { const fabric = f(); place(new fabric.Polygon(makeStarPoints(), { left: 140, top: 90, fill: '#fbbf24', stroke: '#f59e0b', strokeWidth: 2, shadow: new fabric.Shadow({ color: 'rgba(251,191,36,0.8)', blur: 20 }) })) }

  const uploadDevice = async (e) => {
    const file = e.target.files?.[0]; if (!file) return
    const dataUrl = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file) })
    const img = await f().FabricImage.fromURL(dataUrl, { crossOrigin: 'anonymous' })
    const scale = Math.min((CW * 0.7) / img.width, (CH * 0.5) / img.height)
    img.set({ left: CW / 2, top: CH * 0.45, originX: 'center', originY: 'center', scaleX: scale, scaleY: scale })
    place(img); toast.success('Cihaz gorseli eklendi')
  }

  const removeBg = async () => {
    const canvas = c(); const active = canvas.getActiveObject()
    const target = active && active.type === 'image' ? active : canvas.getObjects().find((o) => o.type === 'image')
    if (!target) { toast.error('Once bir cihaz gorseli yukleyin'); return }
    setBgBusy(true)
    try {
      const r = await api('/studio/remove-bg', { method: 'POST', body: JSON.stringify({ image: target.toDataURL({ format: 'png' }) }) })
      const ni = await f().FabricImage.fromURL(r.image)
      ni.set({ left: target.left, top: target.top, originX: target.originX, originY: target.originY, scaleX: target.scaleX, scaleY: target.scaleY, angle: target.angle })
      canvas.remove(target); canvas.add(ni); canvas.setActiveObject(ni); canvas.requestRenderAll(); toast.success('Arka plan silindi')
    } catch (e) {
      if (String(e.message).match(/API_KEY|gerekli/)) toast.error('Arka plan silme icin API anahtari gerekli (.env)')
      else toast.error(e.message)
    } finally { setBgBusy(false) }
  }

  const apply = (patch) => {
    const canvas = c(); const o = canvas.getActiveObject(); if (!o) return
    Object.entries(patch).forEach(([k, v]) => { if (k === 'bold') o.set('fontWeight', v ? 'bold' : 'normal'); else o.set(k, v) })
    canvas.requestRenderAll()
    setSel((s) => ({ ...s, ...patch }))
  }
  const delSel = () => { const canvas = c(); const a = canvas.getActiveObject(); if (a) { canvas.remove(a); canvas.discardActiveObject(); canvas.requestRenderAll(); setSel(null) } }
  const front = () => { const a = c().getActiveObject(); if (a) { c().bringObjectToFront(a); c().requestRenderAll() } }
  const back = () => { const a = c().getActiveObject(); if (a) { c().sendObjectToBack(a); c().getObjects()[0] && c().sendObjectToBack(c().getObjects().find(o=>!o.selectable)||a); c().requestRenderAll() } }

  const onAudioUpload = async (e) => {
    const file = e.target.files?.[0]; if (!file) return
    const form = new FormData(); form.append('file', file)
    try { const r = await fetch('/api/studio/upload-audio', { method: 'POST', body: form }).then((x) => x.json()); if (r.error) throw new Error(r.error); setAudioFile(r.file); toast.success('Muzik yuklendi') }
    catch (err) { toast.error(err.message) }
  }

  const renderReels = async () => {
    const canvas = c(); if (!canvas) return
    canvas.discardActiveObject(); setSel(null); canvas.requestRenderAll()
    const posterDataUrl = canvas.toDataURL({ format: 'png', multiplier: MULT })
    setRendering(true); setJob(null)
    try {
      const { jobId } = await api('/studio/render', { method: 'POST', body: JSON.stringify({ posterDataUrl, audioMode, presetId, audioFile }) })
      const poll = setInterval(async () => {
        try {
          const st = await api('/studio/render/' + jobId)
          if (st.status === 'DONE') { clearInterval(poll); setJob(st); setRendering(false); toast.success('Reels videosu hazir!') }
          else if (st.status === 'FAILED') { clearInterval(poll); setRendering(false); toast.error('Render hatasi: ' + st.error) }
        } catch (e) {}
      }, 2000)
    } catch (e) { setRendering(false); toast.error(e.message) }
  }

  const publish = async (platform) => {
    if (!job?.id) return
    setPublishing(platform)
    const ep = platform === 'youtube' ? '/youtube/upload-short' : platform === 'facebook' ? '/reels/publish-fb' : '/reels/publish-ig'
    try {
      const r = await api(ep, { method: 'POST', body: JSON.stringify({ jobId: job.id, pageId }) })
      toast.success(`${platform} yayinlandi: ${r.url || r.video_id || r.instagram || r.videoId || 'ok'}`)
    } catch (e) {
      if (String(e.message).match(/OAUTH/i)) toast.error('YouTube icin Ayarlar > Kanal Bagla ile OAuth kurun')
      else toast.error(e.message)
    } finally { setPublishing('') }
  }

  const scheduleIt = async () => {
    if (!job?.id) return
    const platforms = Object.entries(schedPlatforms).filter(([, v]) => v).map(([k]) => k)
    if (!schedAt) { toast.error('Tarih/saat secin'); return }
    if (!platforms.length) { toast.error('En az bir platform secin'); return }
    try {
      await api('/schedule', { method: 'POST', body: JSON.stringify({ jobId: job.id, platforms, caption: schedCaption, scheduledAt: new Date(schedAt).toISOString() }) })
      toast.success('Paylasim zamanlandi! Takvim sekmesinden takip edin.')
    } catch (e) { toast.error(e.message) }
  }

  const shapeTools = [
    { label: 'Yazi', icon: Type, fn: addText },
    { label: 'Ok', icon: MoveUpRight, fn: addArrow },
    { label: 'Dikdortgen', icon: Square, fn: addRect },
    { label: 'Yuvarlak Kutu', icon: RectangleHorizontal, fn: addRounded },
    { label: 'Daire', icon: CircleIcon, fn: addCircle },
    { label: 'Yildiz', icon: Star, fn: addStar },
  ]

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      <div className="lg:col-span-3 space-y-4">
        <Card className="border-zinc-800 bg-zinc-900/70">
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Type className="h-4 w-4 text-indigo-400" /> Serbest Tasarim Editoru (9:16)</CardTitle></CardHeader>
          <CardContent>
            <div className="mb-3 flex flex-wrap gap-2">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-1.5 text-xs text-zinc-200 hover:border-indigo-500/50">
                <ImageUp className="h-3.5 w-3.5" /> Cihaz Yukle<input type="file" accept="image/*" onChange={uploadDevice} className="hidden" />
              </label>
              <button disabled={bgBusy} onClick={removeBg} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-1.5 text-xs text-zinc-200 hover:border-indigo-500/50 disabled:opacity-50">
                {bgBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Scissors className="h-3.5 w-3.5" />} Arka Plani Sil
              </button>
              <span className="w-px self-stretch bg-zinc-800" />
              {shapeTools.map((t) => { const Icon = t.icon; return (
                <button key={t.label} onClick={t.fn} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-1.5 text-xs text-zinc-200 hover:border-indigo-500/50"><Icon className="h-3.5 w-3.5" /> {t.label}</button>
              )})}
              <span className="w-px self-stretch bg-zinc-800" />
              <button onClick={front} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-1.5 text-xs text-zinc-200 hover:border-indigo-500/50"><ArrowUp className="h-3.5 w-3.5" /> One</button>
              <button onClick={back} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-1.5 text-xs text-zinc-200 hover:border-indigo-500/50"><ArrowDown className="h-3.5 w-3.5" /> Arka</button>
              <button onClick={delSel} className="inline-flex items-center gap-1.5 rounded-lg border border-red-800/60 bg-red-950/40 px-3 py-1.5 text-xs text-red-300 hover:border-red-500/50"><Trash2 className="h-3.5 w-3.5" /> Sil</button>
            </div>

            {/* Properties panel */}
            {sel ? (
              <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-indigo-500/20 bg-indigo-950/20 p-3">
                <label className="flex items-center gap-1.5 text-xs text-zinc-300">{sel.isText ? 'Yazi Rengi' : 'Dolgu'}<input type="color" value={sel.fill} onChange={(e) => apply({ fill: e.target.value })} className="h-6 w-8 rounded border-0 bg-transparent" /></label>
                {!sel.isText && <label className="flex items-center gap-1.5 text-xs text-zinc-300">Kenarlik<input type="color" value={sel.stroke} onChange={(e) => apply({ stroke: e.target.value })} className="h-6 w-8 rounded border-0 bg-transparent" /></label>}
                {!sel.isText && <label className="flex items-center gap-1.5 text-xs text-zinc-300">Kalinlik<input type="range" min="0" max="12" value={sel.strokeWidth} onChange={(e) => apply({ strokeWidth: Number(e.target.value) })} className="w-20" /></label>}
                <label className="flex items-center gap-1.5 text-xs text-zinc-300">Seffaflik<input type="range" min="0.1" max="1" step="0.1" value={sel.opacity} onChange={(e) => apply({ opacity: Number(e.target.value) })} className="w-20" /></label>
                {sel.isText && <label className="flex items-center gap-1.5 text-xs text-zinc-300">Boyut<input type="range" min="12" max="80" value={sel.fontSize} onChange={(e) => apply({ fontSize: Number(e.target.value) })} className="w-20" /></label>}
                {sel.isText && <button onClick={() => apply({ bold: !sel.bold })} className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-xs ${sel.bold ? 'border-indigo-500 bg-indigo-500/20 text-indigo-200' : 'border-zinc-700 text-zinc-300'}`}><Bold className="h-3 w-3" /> Bold</button>}
                {sel.isText && <label className="flex items-center gap-1.5 text-xs text-zinc-300">Arka Plan<input type="color" value={sel.bg} onChange={(e) => apply({ backgroundColor: e.target.value })} className="h-6 w-8 rounded border-0 bg-transparent" /></label>}
              </div>
            ) : <p className="mb-3 text-xs text-zinc-500">Bir nesne seciniz veya ekleyiniz — tum nesneler surukle/dondur/boyutlandir yapilabilir.</p>}

            <div className="flex justify-center rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
              <div className="overflow-hidden rounded-[1.4rem] shadow-2xl shadow-black/60 ring-4 ring-zinc-800"><canvas ref={canvasElRef} /></div>
            </div>
            <p className="mt-3 text-center text-xs text-zinc-500">{ready ? 'Cift tik ile yaziyi duzenle • koseden tut buyut/dondur' : 'Editor yukleniyor...'}</p>
          </CardContent>
        </Card>
      </div>

      <div className="lg:col-span-2 space-y-6">
        <Card className="border-zinc-800 bg-zinc-900/70">
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Music className="h-4 w-4 text-fuchsia-400" /> Ses / Muzik Secimi</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${audioMode === 'preset' ? 'border-indigo-500/50 bg-indigo-500/10' : 'border-zinc-800 bg-zinc-950/50'}`}>
              <input type="radio" checked={audioMode === 'preset'} onChange={() => setAudioMode('preset')} className="mt-1" />
              <div className="flex-1">
                <p className="text-sm font-medium">Hazir Telifsiz Kutuphane</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {presets.map((p) => (<button key={p.id} onClick={(e) => { e.preventDefault(); setPresetId(p.id); setAudioMode('preset') }} className={`rounded-full border px-2.5 py-1 text-xs ${presetId === p.id ? 'border-fuchsia-500/50 bg-fuchsia-500/15 text-fuchsia-300' : 'border-zinc-700 text-zinc-400'}`}>{p.name}</button>))}
                </div>
                {presetId && <audio controls src={`/api/media?dir=music&file=${presetId}.mp3`} className="mt-2 h-8 w-full" />}
              </div>
            </label>
            <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${audioMode === 'upload' ? 'border-indigo-500/50 bg-indigo-500/10' : 'border-zinc-800 bg-zinc-950/50'}`}>
              <input type="radio" checked={audioMode === 'upload'} onChange={() => setAudioMode('upload')} className="mt-1" />
              <div className="flex-1"><p className="text-sm font-medium">Kendi Muzigini Yukle</p><input type="file" accept="audio/*" onChange={onAudioUpload} className="mt-1 text-xs text-zinc-400" />{audioFile && <p className="mt-1 text-xs text-emerald-400">Yuklendi ✓</p>}</div>
            </label>
            <label className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 ${audioMode === 'silent' ? 'border-indigo-500/50 bg-indigo-500/10' : 'border-zinc-800 bg-zinc-950/50'}`}>
              <input type="radio" checked={audioMode === 'silent'} onChange={() => setAudioMode('silent')} />
              <div><p className="text-sm font-medium">Muziksiz (Sessiz)</p><p className="text-xs text-zinc-500">Trend muzigi platformdan ekleyin</p></div>
            </label>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/70">
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Video className="h-4 w-4 text-emerald-400" /> Reels Uretimi (6sn)</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={renderReels} disabled={rendering || !ready} className="w-full bg-emerald-600 hover:bg-emerald-500">{rendering ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Render ediliyor...</> : <><Video className="mr-2 h-4 w-4" /> 6sn Sinematik Reels Uret</>}</Button>
            {job?.videoUrl && (
              <div className="space-y-3">
                <video src={job.videoUrl} controls className="w-full rounded-lg border border-zinc-800" />
                <div className="grid grid-cols-3 gap-2">
                  <Button onClick={() => publish('youtube')} disabled={publishing === 'youtube'} className="bg-red-600 text-xs hover:bg-red-500">{publishing === 'youtube' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Youtube className="mr-1 h-4 w-4" />} YouTube</Button>
                  <Button onClick={() => publish('facebook')} disabled={publishing === 'facebook'} className="bg-blue-600 text-xs hover:bg-blue-500">{publishing === 'facebook' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Facebook className="mr-1 h-4 w-4" />} Facebook</Button>
                  <Button onClick={() => publish('instagram')} disabled={publishing === 'instagram'} className="bg-gradient-to-r from-fuchsia-600 to-pink-500 text-xs hover:opacity-90">{publishing === 'instagram' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Instagram className="mr-1 h-4 w-4" />} Instagram</Button>
                </div>

                {/* Scheduling */}
                <div className="rounded-lg border border-indigo-500/20 bg-indigo-950/20 p-3 space-y-2">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-indigo-300"><CalendarClock className="h-3.5 w-3.5" /> Zamanlanmis Paylasim</p>
                  <input type="datetime-local" value={schedAt} onChange={(e) => setSchedAt(e.target.value)} className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200" />
                  <div className="flex flex-wrap gap-3 text-xs text-zinc-300">
                    {['youtube', 'facebook', 'instagram'].map((p) => (
                      <label key={p} className="flex items-center gap-1.5 capitalize"><input type="checkbox" checked={schedPlatforms[p]} onChange={(e) => setSchedPlatforms((s) => ({ ...s, [p]: e.target.checked }))} /> {p}</label>
                    ))}
                  </div>
                  <Textarea rows={2} value={schedCaption} onChange={(e) => setSchedCaption(e.target.value)} placeholder="Aciklama / caption (opsiyonel)" className="border-zinc-800 bg-zinc-950 text-sm" />
                  <Button onClick={scheduleIt} className="w-full bg-indigo-600 hover:bg-indigo-500"><CalendarClock className="mr-2 h-4 w-4" /> Paylasimi Zamanla</Button>
                </div>
                <p className="text-xs text-zinc-500">Not: YouTube icin OAuth, Facebook/Instagram icin sayfa & IG_USER_ID gerekir.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
