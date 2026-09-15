'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import {
  ImageUp, Scissors, Type, MoveUpRight, Square, Circle as CircleIcon, Star, RectangleHorizontal,
  Music, Video, Youtube, Facebook, Instagram, Loader2, Trash2, ArrowUp, ArrowDown, CalendarClock, Bold,
  Sparkles, Layers, Plus, Film, ImagePlus,
} from 'lucide-react'
import { STUDIO_BACKGROUNDS } from '@/lib/studio-backgrounds'

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

  const [scenes, setScenes] = useState([])
  const [transition, setTransition] = useState('fade')
  const [transitionDur, setTransitionDur] = useState(0.7)
  const [logos, setLogos] = useState([])
  const [logoBusy, setLogoBusy] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiContext, setAiContext] = useState('')
  const [customTexts, setCustomTexts] = useState('')
  const [customBusy, setCustomBusy] = useState(false)
  const [bgPanel, setBgPanel] = useState('hazir')
  const [activeBg, setActiveBg] = useState('')
  const [autoCutBg, setAutoCutBg] = useState(true)
  const [photoBusy, setPhotoBusy] = useState(false)
  const photoInputRef = useRef(null)

  // Bir logo dataUrl'ini tuvale yerlestir
  const addLogoToCanvas = async (dataUrl) => {
    const img = await f().FabricImage.fromURL(dataUrl, { crossOrigin: 'anonymous' })
    const scale = 100 / img.width
    img.set({ left: CW - 70, top: 46, originX: 'center', originY: 'center', scaleX: scale, scaleY: scale })
    place(img); toast.success('Logo eklendi — dilediginiz yere tasiyin')
  }

  // Kutuphaneye logo yukle (base64 -> MongoDB, max 5)
  const uploadLogo = async (e) => {
    const file = e.target.files?.[0]; if (!file) { return }
    e.target.value = ''
    if (logos.length >= 5) { toast.error('En fazla 5 logo saklayabilirsiniz. Once bir logoyu silin.'); return }
    const dataUrl = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file) })
    setLogoBusy(true)
    try {
      const saved = await api('/studio/logos', { method: 'POST', body: JSON.stringify({ image: dataUrl, name: file.name?.replace(/\.[^.]+$/, '') || undefined }) })
      setLogos((l) => [saved, ...l])
      await addLogoToCanvas(dataUrl)
      toast.success('Logo kutuphaneye kaydedildi')
    } catch (err) { toast.error(err.message) } finally { setLogoBusy(false) }
  }

  const deleteLogo = async (id) => {
    try { await api('/studio/logos/' + id, { method: 'DELETE' }); setLogos((l) => l.filter((x) => x.id !== id)); toast.success('Logo silindi') }
    catch (err) { toast.error(err.message) }
  }

  const placeBox = (fab, b) => {
    const kind = b.kind || 'badge'
    const left = Math.max(6, Math.min(CW - 60, (Number(b.xPct) || 15) / 100 * CW))
    const top = Math.max(6, Math.min(CH - 40, (Number(b.yPct) || 20) / 100 * CH))
    const styles = {
      title: { fontSize: 30, fontWeight: 'bold', fill: '#ffffff', width: 280 },
      badge: { fontSize: 20, fontWeight: 'bold', fill: '#111827', backgroundColor: '#fbbf24', width: 140, textAlign: 'center' },
      feature: { fontSize: 16, fill: '#e5e7eb', backgroundColor: '#1e293b', width: 180 },
      cta: { fontSize: 20, fill: '#ffffff', backgroundColor: '#16a34a', width: 240, textAlign: 'center' },
    }
    const st = styles[kind] || styles.badge
    const txt = kind === 'feature' ? '⚡ ' + b.text : b.text
    place(new fab.Textbox(txt, { left, top, padding: 4, fontFamily: 'Arial', ...st }))
  }

  const customBoxes = async () => {
    const tokens = customTexts.split('/').map((t) => t.trim()).filter(Boolean)
    if (!tokens.length) { toast.error('Metinleri / ile ayirarak yazin (or: Hizli Servis / 2 Yil Garanti / Ucretsiz Kesif)'); return }
    const canvas = c(); const img = canvas.getObjects().find((o) => (o.type === 'image' || o.type === 'Image') && o.role !== 'canvasBg')
    setCustomBusy(true)
    try {
      let boxes = []
      if (img) {
        const r = await api('/studio/custom-boxes', { method: 'POST', body: JSON.stringify({ image: img.toDataURL({ format: 'png' }), texts: tokens, context: aiContext }) })
        boxes = r.boxes || []
      }
      if (!boxes.length) boxes = tokens.map((t, i) => ({ text: t, kind: i === 0 ? 'title' : 'badge', xPct: 12, yPct: 12 + i * 16 }))
      const fab = f()
      boxes.forEach((b) => placeBox(fab, b))
      canvas.discardActiveObject(); setSel(null); canvas.requestRenderAll()
      toast.success(boxes.length + ' kutu gorsele uygun sekilde eklendi')
    } catch (e) { toast.error(e.message) } finally { setCustomBusy(false) }
  }

  const lockToggle = () => {
    const canvas = c(); const o = canvas.getActiveObject(); if (!o) return
    const willLock = !o.lockMovementX
    o.set({ lockMovementX: willLock, lockMovementY: willLock, lockScalingX: willLock, lockScalingY: willLock, lockRotation: willLock, hasControls: !willLock })
    canvas.requestRenderAll()
    setSel((s) => ({ ...s, locked: willLock }))
    toast.success(willLock ? 'Nesne kilitlendi (artik kaymaz)' : 'Kilit acildi')
  }

  useEffect(() => {
    let disposed = false
    ;(async () => {
      const fabric = await import('fabric')
      if (disposed) return
      fabricRef.current = fabric
      const canvas = new fabric.Canvas(canvasElRef.current, { backgroundColor: '#0b0b12', preserveObjectStacking: true })
      canvas.setDimensions({ width: CW, height: CH })
      const bg = new fabric.Rect({
        left: 0, top: 0, width: CW, height: CH, selectable: false, evented: false, fill: '#ffffff',
      })
      canvas.add(bg)
      bg.role = 'canvasBg'
      setActiveBg('white')
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
          locked: !!o.lockMovementX,
        })
      }
      canvas.on('selection:created', sync)
      canvas.on('selection:updated', sync)
      canvas.on('selection:cleared', () => setSel(null))

      // Hizalama kilavuzlari (snap to center)
      const cx = CW / 2, cy = CH / 2
      const vLine = new fabric.Line([cx, 0, cx, CH], { stroke: '#6366f1', strokeDashArray: [5, 5], selectable: false, evented: false, opacity: 0, excludeFromExport: true })
      const hLine = new fabric.Line([0, cy, CW, cy], { stroke: '#6366f1', strokeDashArray: [5, 5], selectable: false, evented: false, opacity: 0, excludeFromExport: true })
      canvas.add(vLine, hLine)
      canvas.on('object:moving', (e) => {
        const o = e.target; if (!o) return
        const p = o.getCenterPoint(); const snap = 8
        vLine.set('opacity', 0); hLine.set('opacity', 0)
        if (Math.abs(p.x - cx) < snap) { o.set('left', o.left + (cx - p.x)); vLine.set('opacity', 1) }
        if (Math.abs(p.y - cy) < snap) { o.set('top', o.top + (cy - p.y)); hLine.set('opacity', 1) }
        canvas.bringObjectToFront(vLine); canvas.bringObjectToFront(hLine)
      })
      const hideGuides = () => { vLine.set('opacity', 0); hLine.set('opacity', 0); canvas.requestRenderAll() }
      canvas.on('object:modified', hideGuides)
      canvas.on('mouse:up', hideGuides)
      canvasRef.current = canvas
      setReady(true)
    })()
    return () => { disposed = true; try { canvasRef.current?.dispose() } catch (e) {} }
  }, [])

  useEffect(() => { api('/studio/presets').then(setPresets).catch(() => {}) }, [])
  useEffect(() => { api('/studio/logos').then(setLogos).catch(() => {}) }, [])

  const f = () => fabricRef.current
  const c = () => canvasRef.current
  const sendBgBack = (canvas) => {
    const bg = canvas?.getObjects?.().find((o) => o.role === 'canvasBg')
    if (bg) canvas.sendObjectToBack(bg)
  }
  const place = (obj) => {
    const canvas = c()
    canvas.add(obj)
    canvas.setActiveObject(obj)
    sendBgBack(canvas)
    canvas.requestRenderAll()
  }

  const applySolidBg = (fill, id) => {
    const canvas = c(); const fabric = f(); if (!canvas || !fabric) return
    canvas.getObjects().filter((o) => o.role === 'canvasBg').forEach((o) => canvas.remove(o))
    const bg = new fabric.Rect({ left: 0, top: 0, width: CW, height: CH, fill, selectable: false, evented: false })
    bg.role = 'canvasBg'
    canvas.add(bg)
    canvas.sendObjectToBack(bg)
    canvas.requestRenderAll()
    setActiveBg(id)
  }

  const applyBgUrl = async (url, id) => {
    const canvas = c(); const fabric = f(); if (!canvas || !fabric) return
    const img = await fabric.FabricImage.fromURL(url, { crossOrigin: 'anonymous' })
    const scale = Math.max(CW / img.width, CH / img.height)
    img.set({ left: CW / 2, top: CH / 2, originX: 'center', originY: 'center', scaleX: scale, scaleY: scale, selectable: false, evented: false })
    img.role = 'canvasBg'
    canvas.getObjects().filter((o) => o.role === 'canvasBg').forEach((o) => canvas.remove(o))
    canvas.add(img)
    canvas.sendObjectToBack(img)
    canvas.requestRenderAll()
    setActiveBg(id)
  }

  const pickPresetBg = async (bg) => {
    try {
      if (bg.kind === 'solid') { applySolidBg(bg.fill, bg.id); toast.success(bg.name + ' uygulandi') }
      else { await applyBgUrl(bg.url, bg.id); toast.success(bg.name + ' yuklendi') }
    } catch (e) { toast.error('Arka plan yuklenemedi: ' + (e.message || 'dosya okunamadi')) }
  }

  const uploadCustomBg = async (e) => {
    const file = e.target.files?.[0]; if (!file) return
    e.target.value = ''
    const dataUrl = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file) })
    try { await applyBgUrl(dataUrl, 'custom'); toast.success('Kendi arka planin yuklendi') }
    catch (err) { toast.error(err.message) }
  }

  const addText = () => { const fabric = f(); place(new fabric.Textbox('Yaziniz', { left: 40, top: 60, width: 240, fontSize: 30, fontWeight: 'bold', fill: '#ffffff', fontFamily: 'Arial', editable: true, padding: 4 })) }
  const addArrow = () => { const fabric = f(); const p = new fabric.Path('M0,15 L40,15 L40,3 L64,22 L40,41 L40,29 L0,29 Z', { left: 80, top: 260, fill: '#ef4444', stroke: '', scaleX: 1.4, scaleY: 1.4 }); place(p) }
  const addRect = () => { const fabric = f(); place(new fabric.Rect({ left: 60, top: 120, width: 140, height: 80, fill: 'rgba(59,130,246,0.35)', stroke: '#3b82f6', strokeWidth: 3 })) }
  const addRounded = () => { const fabric = f(); place(new fabric.Rect({ left: 60, top: 220, width: 160, height: 70, rx: 18, ry: 18, fill: 'rgba(16,185,129,0.25)', stroke: '#10b981', strokeWidth: 3 })) }
  const addCircle = () => { const fabric = f(); place(new fabric.Circle({ left: 120, top: 300, radius: 46, fill: 'rgba(217,70,239,0.25)', stroke: '#d946ef', strokeWidth: 3 })) }
  const addStar = () => { const fabric = f(); place(new fabric.Polygon(makeStarPoints(), { left: 140, top: 90, fill: '#fbbf24', stroke: '#f59e0b', strokeWidth: 2, shadow: new fabric.Shadow({ color: 'rgba(251,191,36,0.8)', blur: 20 }) })) }

  const placeDeviceImage = async (dataUrl) => {
    const img = await f().FabricImage.fromURL(dataUrl, { crossOrigin: 'anonymous' })
    const scale = Math.min((CW * 0.7) / img.width, (CH * 0.5) / img.height)
    img.set({ left: CW / 2, top: CH * 0.45, originX: 'center', originY: 'center', scaleX: scale, scaleY: scale })
    img.role = 'device'
    place(img)
  }

  const uploadDevice = async (e) => {
    const file = e.target.files?.[0]; if (!file) return
    e.target.value = ''
    const dataUrl = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file) })
    setPhotoBusy(true)
    try {
      let url = dataUrl
      if (autoCutBg) {
        try {
          const r = await api('/studio/remove-bg', { method: 'POST', body: JSON.stringify({ image: dataUrl }) })
          url = r.image
          toast.success('Foto eklendi — arka plan silindi. Baska foto da yukleyebilirsiniz.')
        } catch (err) {
          toast.error('Arka plan silinemedi, orijinal foto eklendi')
        }
      } else {
        toast.success('Yeni foto tuvale eklendi (ustune baska da ekleyebilirsiniz)')
      }
      await placeDeviceImage(url)
    } finally { setPhotoBusy(false) }
  }

  const removeBg = async () => {
    const canvas = c(); const active = canvas.getActiveObject()
    const target = active && (active.type === 'image' || active.type === 'Image') && active.role !== 'canvasBg'
      ? active
      : canvas.getObjects().find((o) => (o.type === 'image' || o.type === 'Image') && o.role !== 'canvasBg')
    if (!target) { toast.error('Once bir cihaz fotografi yukleyin'); return }
    setBgBusy(true)
    try {
      const r = await api('/studio/remove-bg', { method: 'POST', body: JSON.stringify({ image: target.toDataURL({ format: 'png' }) }) })
      const ni = await f().FabricImage.fromURL(r.image)
      ni.set({ left: target.left, top: target.top, originX: target.originX, originY: target.originY, scaleX: target.scaleX, scaleY: target.scaleY, angle: target.angle })
      ni.role = 'device'
      canvas.remove(target); canvas.add(ni); canvas.setActiveObject(ni); sendBgBack(canvas); canvas.requestRenderAll(); toast.success('Arka plan silindi')
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
  const back = () => { const a = c().getActiveObject(); if (a) { c().sendObjectToBack(a); sendBgBack(c()); c().requestRenderAll() } }

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
      const body = scenes.length > 0
        ? { scenes: scenes.map((s) => ({ posterDataUrl: s.dataUrl, duration: s.duration })), transition, transitionDur, audioMode, presetId, audioFile }
        : { posterDataUrl, audioMode, presetId, audioFile }
      const { jobId } = await api('/studio/render', { method: 'POST', body: JSON.stringify(body) })
      const poll = setInterval(async () => {
        try {
          const st = await api('/studio/render/' + jobId)
          if (st.status === 'DONE') { clearInterval(poll); setJob(st); setRendering(false); toast.success('Reels videosu hazir!') }
          else if (st.status === 'FAILED') { clearInterval(poll); setRendering(false); toast.error('Render hatasi: ' + st.error) }
        } catch (e) {}
      }, 2000)
    } catch (e) { setRendering(false); toast.error(e.message) }
  }

  const captureScene = () => {
    const canvas = c(); if (!canvas) return
    canvas.discardActiveObject(); setSel(null); canvas.requestRenderAll()
    const dataUrl = canvas.toDataURL({ format: 'png', multiplier: MULT })
    const thumb = canvas.toDataURL({ format: 'png', multiplier: 0.3 })
    setScenes((s) => [...s, { dataUrl, thumb, duration: 3 }])
    toast.success('Sahne kaydedildi (' + (scenes.length + 1) + '). Tuvali degistirip yeni sahne ekleyebilirsiniz.')
  }
  const removeScene = (i) => setScenes((s) => s.filter((_, x) => x !== i))
  const setSceneDur = (i, v) => setScenes((s) => s.map((sc, x) => (x === i ? { ...sc, duration: v } : sc)))

  const [introSaving, setIntroSaving] = useState(false)
  const saveIntroPoster = async () => {
    const canvas = c(); if (!canvas) return
    canvas.discardActiveObject(); setSel(null); canvas.requestRenderAll()
    const dataUrl = canvas.toDataURL({ format: 'png', multiplier: MULT })
    const thumb = canvas.toDataURL({ format: 'png', multiplier: 0.25 })
    setIntroSaving(true)
    try {
      await api('/posters', { method: 'POST', body: JSON.stringify({ dataUrl, thumb }) })
      toast.success('Afis kaydedildi! Video Kesici sekmesinde bir videonun onune ekleyebilirsiniz.')
    } catch (e) { toast.error(e.message) } finally { setIntroSaving(false) }
  }

  const aiSuggest = async () => {
    const canvas = c(); const img = canvas.getObjects().find((o) => (o.type === 'image' || o.type === 'Image') && o.role !== 'canvasBg')
    if (!img) { toast.error('Once bir cihaz gorseli yukleyin'); return }
    setAiBusy(true)
    try {
      const r = await api('/studio/suggest-labels', { method: 'POST', body: JSON.stringify({ image: img.toDataURL({ format: 'png' }), context: aiContext }) })
      const fab = f()
      if (r.title) place(new fab.Textbox(r.title, { left: 28, top: 26, width: 300, fontSize: 32, fontWeight: 'bold', fill: '#ffffff' }))
      ;(r.badges || []).forEach((t, i) => place(new fab.Textbox(t, { left: 210, top: 70 + i * 46, width: 130, fontSize: 20, fontWeight: 'bold', fill: '#111827', backgroundColor: '#fbbf24', textAlign: 'center', padding: 4 })))
      ;(r.features || []).forEach((t, i) => place(new fab.Textbox('⚡ ' + t, { left: 22, top: 450 + i * 42, width: 180, fontSize: 16, fill: '#e5e7eb', backgroundColor: '#1e293b', padding: 4 })))
      if (r.cta) place(new fab.Textbox('📱 ' + r.cta, { left: 0, top: CH - 54, width: CW, fontSize: 20, fill: '#ffffff', backgroundColor: '#16a34a', textAlign: 'center', padding: 4 }))
      canvas.discardActiveObject(); setSel(null); canvas.requestRenderAll()
      toast.success('AI metinleri eklendi — konumlari serbestce duzenleyin')
    } catch (e) { toast.error(e.message) } finally { setAiBusy(false) }
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
            <div className="mb-3 rounded-lg border border-cyan-500/25 bg-cyan-950/15 p-3">
              <p className="mb-2 text-xs font-semibold text-cyan-200">Foto yukle (arka plan sil)</p>
              <p className="mb-2 text-[11px] text-zinc-500">Calisirken baska foto da ekleyebilirsiniz — her yukleme yeni cihaz olarak tuvale biner.</p>
              <label className={`flex min-h-[72px] cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-cyan-700/50 bg-zinc-950/60 px-3 py-3 text-center hover:border-cyan-400/60 ${(photoBusy || bgBusy) ? 'pointer-events-none opacity-60' : ''}`}>
                {photoBusy ? <Loader2 className="h-5 w-5 animate-spin text-cyan-300" /> : <ImagePlus className="h-5 w-5 text-cyan-300" />}
                <span className="text-xs text-zinc-200">Yeni foto sec / tekrar yukle</span>
                <input ref={photoInputRef} type="file" accept="image/*" onChange={uploadDevice} className="hidden" />
              </label>
              <label className="mt-2 flex items-center gap-2 text-[11px] text-zinc-400">
                <input type="checkbox" checked={autoCutBg} onChange={(e) => setAutoCutBg(e.target.checked)} />
                Yuklerken arka plani otomatik sil
              </label>
            </div>
            <div className="mb-3 flex flex-wrap gap-2">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-1.5 text-xs text-zinc-200 hover:border-indigo-500/50">
                <ImageUp className="h-3.5 w-3.5" /> Cihaz Yukle<input type="file" accept="image/*" onChange={uploadDevice} className="hidden" />
              </label>
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-1.5 text-xs text-zinc-200 hover:border-indigo-500/50">
                <Layers className="h-3.5 w-3.5" /> Logo Ekle<input type="file" accept="image/*" onChange={uploadLogo} className="hidden" />
              </label>
              <button disabled={bgBusy} onClick={removeBg} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-1.5 text-xs text-zinc-200 hover:border-indigo-500/50 disabled:opacity-50">
                {bgBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Scissors className="h-3.5 w-3.5" />} Arka Plani Sil
              </button>
              <button disabled={aiBusy} onClick={aiSuggest} className="inline-flex items-center gap-1.5 rounded-lg border border-fuchsia-700/60 bg-fuchsia-950/40 px-3 py-1.5 text-xs text-fuchsia-200 hover:border-fuchsia-500/50 disabled:opacity-50">
                {aiBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} AI Metin Onerisi
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
                <button onClick={lockToggle} className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-xs ${sel.locked ? 'border-amber-500 bg-amber-500/20 text-amber-200' : 'border-zinc-700 text-zinc-300'}`}>{sel.locked ? '🔒 Kilit Ac' : '🔓 Kilitle'}</button>
              </div>
            ) : <p className="mb-3 text-xs text-zinc-500">Bir nesne seciniz veya ekleyiniz — tum nesneler surukle/dondur/boyutlandir yapilabilir. Resmi ayarlayip "Kilitle" ile sabitleyebilirsiniz.</p>}

            <div className="mb-3 flex flex-col gap-2 rounded-lg border border-fuchsia-500/20 bg-fuchsia-950/10 p-3 sm:flex-row sm:items-center">
              <input value={aiContext} onChange={(e) => setAiContext(e.target.value)} placeholder="Cihaz ne ise yariyor? (AI icin ipucu, or: 'oto klima gazi dolum cihazi')" className="flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200" />
              <button disabled={aiBusy} onClick={aiSuggest} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-fuchsia-600 px-3 py-2 text-xs text-white hover:bg-fuchsia-500 disabled:opacity-50">{aiBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} AI ile Kutulari Olustur</button>
            </div>

            <div className="mb-3 flex flex-col gap-2 rounded-lg border border-cyan-500/20 bg-cyan-950/10 p-3 sm:flex-row sm:items-center">
              <input value={customTexts} onChange={(e) => setCustomTexts(e.target.value)} placeholder="Kendi metinleriniz: / ile ayirin (or: Hizli Servis / 2 Yil Garanti / Ucretsiz Kesif)" className="flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200" />
              <button disabled={customBusy} onClick={customBoxes} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-2 text-xs text-white hover:bg-cyan-500 disabled:opacity-50">{customBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Metnimi Kutulara Dok</button>
            </div>

            <div className="flex justify-center rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
              <div className="overflow-hidden rounded-[1.4rem] shadow-2xl shadow-black/60 ring-4 ring-zinc-800"><canvas ref={canvasElRef} /></div>
            </div>
            <p className="mt-3 text-center text-xs text-zinc-500">{ready ? 'Cift tik ile yaziyi duzenle • koseden tut buyut/dondur' : 'Editor yukleniyor...'}</p>
          </CardContent>
        </Card>
      </div>

      <div className="lg:col-span-2 space-y-6">
        <Card className="border-zinc-800 bg-zinc-900/70">
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Layers className="h-4 w-4 text-sky-400" /> Arka Plan</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-zinc-500">Afiş zemini. Beyaz studio, klima/VRF zeminleri veya kendi fotonuz. Cihaz fotosu bunun ustune biner.</p>
            <div className="flex gap-1 rounded-md border border-zinc-800 bg-zinc-950 p-0.5">
              <button type="button" onClick={() => setBgPanel('hazir')} className={`flex-1 rounded px-2 py-1.5 text-xs ${bgPanel === 'hazir' ? 'bg-sky-600 text-white' : 'text-zinc-400'}`}>Hazir zeminler</button>
              <button type="button" onClick={() => setBgPanel('yukle')} className={`flex-1 rounded px-2 py-1.5 text-xs ${bgPanel === 'yukle' ? 'bg-sky-600 text-white' : 'text-zinc-400'}`}>Arka plan yukle</button>
            </div>
            {bgPanel === 'hazir' ? (
              <div className="grid grid-cols-3 gap-2">
                {STUDIO_BACKGROUNDS.map((bg) => (
                  <button
                    key={bg.id}
                    type="button"
                    onClick={() => pickPresetBg(bg)}
                    className={`overflow-hidden rounded-md border text-left ${activeBg === bg.id ? 'border-sky-400 ring-2 ring-sky-400/40' : 'border-zinc-700 hover:border-sky-500/50'}`}
                    title={bg.name}
                  >
                    <div className="h-16 w-full" style={bg.kind === 'solid' ? { background: bg.fill } : { backgroundImage: `url(${bg.url})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                    <span className="block truncate px-1 py-1 text-[10px] text-zinc-300">{bg.name}</span>
                  </button>
                ))}
              </div>
            ) : (
              <label className="flex min-h-[88px] cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-sky-700/50 bg-zinc-950/50 p-3 text-center hover:border-sky-400/60">
                <ImageUp className="h-5 w-5 text-sky-300" />
                <span className="text-xs text-zinc-200">Kendi arka plan fotonuzu yukleyin</span>
                <span className="text-[10px] text-zinc-500">JPG / PNG — tuvali doldurur</span>
                <input type="file" accept="image/*" onChange={uploadCustomBg} className="hidden" />
              </label>
            )}
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/70">
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Layers className="h-4 w-4 text-amber-400" /> Logo Kutuphanesi <span className="ml-auto text-xs font-normal text-zinc-500">{logos.length}/5</span></CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-zinc-500">Sik kullandiginiz logolari kaydedin, her tasarima tek tikla ekleyin. En fazla 5 logo.</p>
            <label className={`inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-amber-700/50 bg-amber-950/20 px-3 py-2 text-xs text-amber-200 hover:border-amber-500/50 ${(logoBusy || logos.length >= 5) ? 'pointer-events-none opacity-50' : ''}`}>
              {logoBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} {logos.length >= 5 ? 'Limit doldu (5/5)' : 'Yeni Logo Yukle & Kaydet'}
              <input type="file" accept="image/*" onChange={uploadLogo} disabled={logoBusy || logos.length >= 5} className="hidden" />
            </label>
            {logos.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {logos.map((lg) => (
                  <div key={lg.id} className="group relative">
                    <button onClick={() => addLogoToCanvas(lg.image)} title="Tuvale ekle" className="flex h-16 w-full items-center justify-center rounded-lg border border-zinc-700 bg-zinc-950 p-1 hover:border-amber-500/60">
                      <img src={lg.image} alt={lg.name} className="max-h-full max-w-full object-contain" />
                    </button>
                    <button onClick={() => deleteLogo(lg.id)} title="Sil" className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white opacity-0 transition-opacity group-hover:opacity-100"><Trash2 className="h-3 w-3" /></button>
                  </div>
                ))}
              </div>
            ) : <p className="text-center text-xs text-zinc-600">Henuz logo yok</p>}
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/70">
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Layers className="h-4 w-4 text-cyan-400" /> Coklu Sahne (Opsiyonel)</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-zinc-500">Tuvaldeki tasarimi "Sahne Ekle" ile kaydedin, sonra tuvali degistirip yeni sahneler ekleyin. 2+ sahne varsa video secilen gecisle birlestirilir. Sahne eklemezseniz tek afis 6sn render edilir — secim sizde.</p>
            <Button onClick={captureScene} disabled={!ready} variant="outline" className="w-full border-cyan-700/50 bg-cyan-950/20 text-cyan-200 hover:bg-cyan-900/30"><Plus className="mr-2 h-4 w-4" /> Bu Tuvali Sahne Olarak Ekle</Button>
            <Button onClick={saveIntroPoster} disabled={!ready || introSaving} variant="outline" className="w-full border-orange-700/50 bg-orange-950/20 text-orange-200 hover:bg-orange-900/30">{introSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Film className="mr-2 h-4 w-4" />} Afisi Video Girisi Icin Kaydet</Button>
            {scenes.length > 0 && (
              <>
                <div className="flex flex-wrap gap-2">
                  {scenes.map((s, i) => (
                    <div key={i} className="relative">
                      <img src={s.thumb} alt={`sahne ${i + 1}`} className="h-24 w-[54px] rounded border border-zinc-700 object-cover" />
                      <button onClick={() => removeScene(i)} className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white"><Trash2 className="h-3 w-3" /></button>
                      <input type="number" min="1" max="10" value={s.duration} onChange={(e) => setSceneDur(i, Number(e.target.value))} className="mt-1 w-[54px] rounded border border-zinc-700 bg-zinc-950 px-1 py-0.5 text-center text-[10px] text-zinc-300" />
                      <span className="block text-center text-[9px] text-zinc-600">sn</span>
                    </div>
                  ))}
                </div>
                <div>
                  <label className="mb-1 block text-xs text-zinc-500">Gecis Efekti (siz secin)</label>
                  <select value={transition} onChange={(e) => setTransition(e.target.value)} className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200">
                    <option value="fade">Yumusak Gecis (fade)</option>
                    <option value="wipeleft">Sola Sil (wipeleft)</option>
                    <option value="slideright">Saga Kaydir (slideright)</option>
                    <option value="circleopen">Daire Ac (circleopen)</option>
                    <option value="dissolve">Erime (dissolve)</option>
                    <option value="smoothleft">Akici Sol (smoothleft)</option>
                  </select>
                  <div className="mt-3">
                    <label className="mb-1 flex items-center justify-between text-xs text-zinc-500">
                      <span>Gecis Suresi (her gecis icin)</span>
                      <span className="font-semibold text-cyan-300">{transitionDur.toFixed(1)} sn</span>
                    </label>
                    <input type="range" min="0.3" max="2" step="0.1" value={transitionDur} onChange={(e) => setTransitionDur(Number(e.target.value))} className="w-full accent-cyan-500" />
                    <div className="flex justify-between text-[10px] text-zinc-600"><span>Hizli 0.3sn</span><span>Yavas 2sn</span></div>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <TransitionPreview transition={transition} a={scenes[0]?.thumb} b={scenes[1]?.thumb} />
                    <p className="text-xs text-zinc-500">Secilen gecisin canli onizlemesi (render oncesi).</p>
                  </div>
                </div>
                <p className="text-xs text-cyan-300">{scenes.length} sahne · toplam ~{scenes.reduce((a, s) => a + Number(s.duration), 0)}sn</p>
              </>
            )}
          </CardContent>
        </Card>

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
            <Button onClick={renderReels} disabled={rendering || !ready} className="w-full bg-emerald-600 hover:bg-emerald-500">{rendering ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Render ediliyor...</> : <><Video className="mr-2 h-4 w-4" /> {scenes.length > 1 ? `${scenes.length} Sahneli Reels Uret` : '6sn Sinematik Reels Uret'}</>}</Button>
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

// Gecis efekti canli mini-onizleme (CSS tabanli)
function TransitionPreview({ transition = 'fade', a, b }) {
  const [phase, setPhase] = useState(0)
  useEffect(() => { const t = setInterval(() => setPhase((p) => (p === 0 ? 1 : 0)), 2200); return () => clearInterval(t) }, [])
  const bottomStyle = { backgroundImage: a ? `url(${a})` : 'linear-gradient(135deg,#4f46e5,#db2777)', backgroundSize: 'cover', backgroundPosition: 'center' }
  const topBase = { position: 'absolute', inset: 0, backgroundSize: 'cover', backgroundPosition: 'center', backgroundImage: b ? `url(${b})` : 'linear-gradient(135deg,#0ea5e9,#22c55e)', transition: 'all 1.1s ease-in-out' }
  const on = phase === 1
  let dyn = {}
  switch (transition) {
    case 'slideright': dyn = { transform: on ? 'translateX(100%)' : 'translateX(0)' }; break
    case 'smoothleft': dyn = { transform: on ? 'translateX(-100%)' : 'translateX(0)' }; break
    case 'wipeleft': dyn = { clipPath: on ? 'inset(0 0 0 100%)' : 'inset(0 0 0 0)' }; break
    case 'circleopen': dyn = { clipPath: on ? 'circle(0% at 50% 50%)' : 'circle(75% at 50% 50%)' }; break
    default: dyn = { opacity: on ? 0 : 1 } // fade / dissolve
  }
  return (
    <div className="relative h-[124px] w-[70px] overflow-hidden rounded-md border border-zinc-700 bg-zinc-900" style={bottomStyle}>
      <div style={{ ...topBase, ...dyn }} />
    </div>
  )
}

