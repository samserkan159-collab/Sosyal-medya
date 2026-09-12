'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  ImageUp, Scissors, Layers, Sparkles, Tag, Type, Phone, Trash2, ArrowUp,
  Music, Upload, Video, Youtube, Facebook, Loader2, Play,
} from 'lucide-react'

const api = async (path, opts) => {
  const res = await fetch('/api' + path, { headers: { 'Content-Type': 'application/json' }, ...opts })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.message || data.error || 'Istek basarisiz')
  return data
}

const CW = 360
const CH = 640
const MULT = 1080 / CW

export default function ReelsStudio({ pageId, integrations = {} }) {
  const canvasElRef = useRef(null)
  const fabricRef = useRef(null)
  const canvasRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [bgBusy, setBgBusy] = useState(false)

  const [audioMode, setAudioMode] = useState('preset')
  const [presetId, setPresetId] = useState('enerjik')
  const [presets, setPresets] = useState([])
  const [audioFile, setAudioFile] = useState(null)
  const [rendering, setRendering] = useState(false)
  const [job, setJob] = useState(null)
  const [publishing, setPublishing] = useState('')

  // init fabric
  useEffect(() => {
    let disposed = false
    ;(async () => {
      const fabric = await import('fabric')
      if (disposed) return
      fabricRef.current = fabric
      const canvas = new fabric.Canvas(canvasElRef.current, { backgroundColor: '#0b0b12', preserveObjectStacking: true })
      canvas.setDimensions({ width: CW, height: CH })
      // gradient background rect
      const bg = new fabric.Rect({
        left: 0, top: 0, width: CW, height: CH, selectable: false, evented: false,
        fill: new fabric.Gradient({
          type: 'linear', coords: { x1: 0, y1: 0, x2: 0, y2: CH },
          colorStops: [{ offset: 0, color: '#111827' }, { offset: 1, color: '#0b1e2e' }],
        }),
      })
      canvas.add(bg)
      canvasRef.current = canvas
      setReady(true)
    })()
    return () => { disposed = true; try { canvasRef.current?.dispose() } catch (e) {} }
  }, [])

  useEffect(() => { api('/studio/presets').then(setPresets).catch(() => {}) }, [])

  const f = () => fabricRef.current
  const c = () => canvasRef.current

  const addText = (text, opts = {}) => {
    const fabric = f(); if (!fabric) return
    const t = new fabric.Textbox(text, {
      left: opts.left ?? 40, top: opts.top ?? 60, width: opts.width ?? 240,
      fontSize: opts.fontSize ?? 26, fontWeight: opts.fontWeight ?? 'bold',
      fill: opts.fill ?? '#ffffff', fontFamily: 'Arial', textAlign: opts.textAlign ?? 'left',
      backgroundColor: opts.backgroundColor, padding: 6, editable: true,
    })
    if (opts.shadow) t.set('shadow', new fabric.Shadow(opts.shadow))
    c().add(t); c().setActiveObject(t); c().requestRenderAll()
  }

  const uploadDevice = async (e) => {
    const file = e.target.files?.[0]; if (!file) return
    const dataUrl = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file) })
    const fabric = f()
    const img = await fabric.FabricImage.fromURL(dataUrl, { crossOrigin: 'anonymous' })
    const scale = Math.min((CW * 0.7) / img.width, (CH * 0.5) / img.height)
    img.set({ left: CW / 2, top: CH * 0.42, originX: 'center', originY: 'center', scaleX: scale, scaleY: scale })
    img.set('data', { role: 'device' })
    c().add(img); c().setActiveObject(img); c().requestRenderAll()
    toast.success('Cihaz gorseli eklendi')
  }

  const removeBg = async () => {
    const canvas = c(); const fabric = f()
    const active = canvas.getActiveObject()
    const target = active && active.type === 'image' ? active : canvas.getObjects().find((o) => o.type === 'image')
    if (!target) { toast.error('Once bir cihaz gorseli yukleyin'); return }
    setBgBusy(true)
    try {
      const dataUrl = target.toDataURL({ format: 'png' })
      const r = await api('/studio/remove-bg', { method: 'POST', body: JSON.stringify({ image: dataUrl }) })
      const newImg = await fabric.FabricImage.fromURL(r.image)
      newImg.set({ left: target.left, top: target.top, originX: target.originX, originY: target.originY, scaleX: target.scaleX, scaleY: target.scaleY, angle: target.angle })
      canvas.remove(target); canvas.add(newImg); canvas.setActiveObject(newImg); canvas.requestRenderAll()
      toast.success('Arka plan silindi (seffaf PNG)')
    } catch (e) {
      if (String(e.message).includes('API_KEY') || String(e.message).includes('gerekli')) toast.error('Arka plan silme icin API anahtari gerekli (.env). Orijinal gorsel korundu.')
      else toast.error(e.message)
    } finally { setBgBusy(false) }
  }

  const addPodium = () => {
    const fabric = f(); const canvas = c()
    const ellipse = new fabric.Ellipse({ rx: 130, ry: 26, left: 0, top: 0, originX: 'center', originY: 'center',
      fill: new fabric.Gradient({ type: 'radial', coords: { x1: 130, y1: 26, r1: 0, x2: 130, y2: 26, r2: 130 }, colorStops: [{ offset: 0, color: '#ffffff' }, { offset: 1, color: '#cbd5e1' }] }),
      shadow: new fabric.Shadow({ color: 'rgba(255,255,255,0.4)', blur: 30 }) })
    const slab = new fabric.Rect({ width: 200, height: 18, left: 0, top: 18, originX: 'center', originY: 'center', rx: 6, fill: '#e2e8f0', opacity: 0.85 })
    const g = new fabric.Group([slab, ellipse], { left: CW / 2, top: CH * 0.72, originX: 'center', originY: 'center' })
    g.set('data', { role: 'podium' })
    canvas.add(g); canvas.setActiveObject(g); canvas.requestRenderAll()
  }

  const addBadge = () => addText('DC INVERTER', { left: 210, top: 80, width: 130, fontSize: 22, fill: '#111827', backgroundColor: '#fbbf24', textAlign: 'center', shadow: { color: 'rgba(251,191,36,0.8)', blur: 22 } })
  const addFeature = () => addText('⚡ Hassas Test', { left: 30, top: 470, width: 150, fontSize: 18, fill: '#e5e7eb', backgroundColor: '#1e293b' })
  const addTitle = () => addText('PROFESYONEL\nCIHAZ TAMIRI', { left: 30, top: 30, width: 300, fontSize: 34, fill: '#ffffff', shadow: { color: 'rgba(0,0,0,0.6)', blur: 8 } })
  const addWhatsapp = () => addText('📱 WhatsApp: 0555 000 00 00', { left: 0, top: CH - 60, width: CW, fontSize: 22, fill: '#ffffff', backgroundColor: '#16a34a', textAlign: 'center' })

  const delSel = () => { const canvas = c(); const a = canvas.getActiveObject(); if (a) { canvas.remove(a); canvas.requestRenderAll() } }
  const forward = () => { const canvas = c(); const a = canvas.getActiveObject(); if (a) { canvas.bringObjectToFront(a); canvas.requestRenderAll() } }

  const onAudioUpload = async (e) => {
    const file = e.target.files?.[0]; if (!file) return
    const form = new FormData(); form.append('file', file)
    try { const r = await fetch('/api/studio/upload-audio', { method: 'POST', body: form }).then((x) => x.json()); if (r.error) throw new Error(r.error); setAudioFile(r.file); toast.success('Muzik yuklendi') }
    catch (err) { toast.error(err.message) }
  }

  const renderReels = async () => {
    const canvas = c(); if (!canvas) return
    canvas.discardActiveObject(); canvas.requestRenderAll()
    const posterDataUrl = canvas.toDataURL({ format: 'png', multiplier: MULT })
    setRendering(true); setJob(null)
    try {
      const body = { posterDataUrl, audioMode, presetId, audioFile }
      const { jobId } = await api('/studio/render', { method: 'POST', body: JSON.stringify(body) })
      // poll
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
    try {
      if (platform === 'youtube') {
        const r = await api('/youtube/upload-short', { method: 'POST', body: JSON.stringify({ jobId: job.id, title: 'Reels' }) })
        toast.success('YouTube Shorts yuklendi: ' + (r.url || r.videoId))
      } else {
        const r = await api('/reels/publish-fb', { method: 'POST', body: JSON.stringify({ jobId: job.id, pageId }) })
        toast.success('Facebook Reel yayinlandi: ' + (r.video_id || 'ok'))
      }
    } catch (e) {
      if (String(e.message).includes('OAUTH') || String(e.message).includes('OAuth')) toast.error('YouTube icin once Ayarlar > Kanal Bagla ile OAuth kurun')
      else toast.error(e.message)
    } finally { setPublishing('') }
  }

  const tools = [
    { label: 'Cihaz Yukle', icon: ImageUp, action: 'upload' },
    { label: 'Arka Plani Sil', icon: Scissors, action: 'removebg' },
    { label: 'Podyum', icon: Layers, fn: addPodium },
    { label: 'Rozet', icon: Tag, fn: addBadge },
    { label: 'Teknik Kutu', icon: Sparkles, fn: addFeature },
    { label: 'Baslik', icon: Type, fn: addTitle },
    { label: 'WhatsApp Seridi', icon: Phone, fn: addWhatsapp },
  ]

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      {/* Toolbar + canvas */}
      <div className="lg:col-span-3">
        <Card className="border-zinc-800 bg-zinc-900/70">
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Layers className="h-4 w-4 text-indigo-400" /> Teknik Afis Editoru (9:16)</CardTitle></CardHeader>
          <CardContent>
            <div className="mb-4 flex flex-wrap gap-2">
              {tools.map((t) => {
                const Icon = t.icon
                if (t.action === 'upload') return (
                  <label key={t.label} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-1.5 text-xs text-zinc-200 hover:border-indigo-500/50">
                    <Icon className="h-3.5 w-3.5" /> {t.label}
                    <input type="file" accept="image/*" onChange={uploadDevice} className="hidden" />
                  </label>
                )
                return (
                  <button key={t.label} disabled={t.action === 'removebg' && bgBusy} onClick={t.fn || (t.action === 'removebg' ? removeBg : undefined)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-1.5 text-xs text-zinc-200 hover:border-indigo-500/50 disabled:opacity-50">
                    {t.action === 'removebg' && bgBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />} {t.label}
                  </button>
                )
              })}
              <button onClick={forward} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-1.5 text-xs text-zinc-200 hover:border-indigo-500/50"><ArrowUp className="h-3.5 w-3.5" /> One Al</button>
              <button onClick={delSel} className="inline-flex items-center gap-1.5 rounded-lg border border-red-800/60 bg-red-950/40 px-3 py-1.5 text-xs text-red-300 hover:border-red-500/50"><Trash2 className="h-3.5 w-3.5" /> Sil</button>
            </div>
            <div className="flex justify-center rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
              <div className="overflow-hidden rounded-[1.4rem] shadow-2xl shadow-black/60 ring-4 ring-zinc-800">
                <canvas ref={canvasElRef} />
              </div>
            </div>
            <p className="mt-3 text-center text-xs text-zinc-500">{ready ? 'Elemanlari surukleyip tasiyin • cift tiklayarak metni duzenleyin' : 'Editor yukleniyor...'}</p>
          </CardContent>
        </Card>
      </div>

      {/* Music + render panel */}
      <div className="lg:col-span-2 space-y-6">
        <Card className="border-zinc-800 bg-zinc-900/70">
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Music className="h-4 w-4 text-fuchsia-400" /> Ses / Muzik Secimi</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <label className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 ${audioMode === 'preset' ? 'border-indigo-500/50 bg-indigo-500/10' : 'border-zinc-800 bg-zinc-950/50'}`}>
              <input type="radio" checked={audioMode === 'preset'} onChange={() => setAudioMode('preset')} />
              <div className="flex-1">
                <p className="text-sm font-medium">Hazir Telifsiz Kutuphane</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {presets.map((p) => (
                    <button key={p.id} onClick={(e) => { e.preventDefault(); setPresetId(p.id); setAudioMode('preset') }}
                      className={`rounded-full border px-2.5 py-1 text-xs ${presetId === p.id ? 'border-fuchsia-500/50 bg-fuchsia-500/15 text-fuchsia-300' : 'border-zinc-700 text-zinc-400'}`}>{p.name}</button>
                  ))}
                </div>
                {presetId && <audio controls src={`/api/media?dir=music&file=${presetId}.mp3`} className="mt-2 h-8 w-full" />}
              </div>
            </label>

            <label className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 ${audioMode === 'upload' ? 'border-indigo-500/50 bg-indigo-500/10' : 'border-zinc-800 bg-zinc-950/50'}`}>
              <input type="radio" checked={audioMode === 'upload'} onChange={() => setAudioMode('upload')} />
              <div className="flex-1">
                <p className="text-sm font-medium">Kendi Muzigini Yukle</p>
                <input type="file" accept="audio/mpeg,audio/wav,audio/*" onChange={onAudioUpload} className="mt-1 text-xs text-zinc-400" />
                {audioFile && <p className="mt-1 text-xs text-emerald-400">Yuklendi ✓</p>}
              </div>
            </label>

            <label className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 ${audioMode === 'silent' ? 'border-indigo-500/50 bg-indigo-500/10' : 'border-zinc-800 bg-zinc-950/50'}`}>
              <input type="radio" checked={audioMode === 'silent'} onChange={() => setAudioMode('silent')} />
              <div><p className="text-sm font-medium">Muziksiz (Sessiz) Uret</p><p className="text-xs text-zinc-500">Trend muzigi platformdan kendiniz ekleyin</p></div>
            </label>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/70">
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Video className="h-4 w-4 text-emerald-400" /> Reels Uretimi (6sn)</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={renderReels} disabled={rendering || !ready} className="w-full bg-emerald-600 hover:bg-emerald-500">
              {rendering ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Render ediliyor...</> : <><Video className="mr-2 h-4 w-4" /> 6sn Sinematik Reels Uret</>}
            </Button>
            {job?.videoUrl && (
              <div className="space-y-3">
                <video src={job.videoUrl} controls className="w-full rounded-lg border border-zinc-800" />
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button onClick={() => publish('youtube')} disabled={publishing === 'youtube'} className="flex-1 bg-red-600 hover:bg-red-500">
                    {publishing === 'youtube' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Youtube className="mr-2 h-4 w-4" />} YouTube Shorts
                  </Button>
                  <Button onClick={() => publish('facebook')} disabled={publishing === 'facebook'} className="flex-1 bg-blue-600 hover:bg-blue-500">
                    {publishing === 'facebook' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Facebook className="mr-2 h-4 w-4" />} Facebook Reels
                  </Button>
                </div>
                <p className="text-xs text-zinc-500">Not: YouTube icin OAuth (Ayarlar &gt; Kanal Bagla), Facebook icin sayfa token'i gerekir.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
