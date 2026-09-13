'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Clapperboard, Download, Image as ImageIcon, Loader2, RefreshCw, Upload } from 'lucide-react'

const API = '/api/dub'
const STATUS = {
  submitted: 'Kuyrukta',
  processing: 'Isleniyor',
  succeed: 'Tamamlandi',
  failed: 'Basarisiz',
}

export default function KlingStudio() {
  const [cfg, setCfg] = useState({ configured: null, estimated_costs: {} })
  const [prompt, setPrompt] = useState('')
  const [mode, setMode] = useState('std')
  const [duration, setDuration] = useState('5')
  const [preview, setPreview] = useState('')
  const [busy, setBusy] = useState(false)
  const [task, setTask] = useState(null)
  const fileRef = useRef(null)
  const pollRef = useRef(null)

  const loadCfg = async () => {
    try {
      const res = await fetch(`${API}/kling/config`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || data.error || 'Kling config yok')
      setCfg(data)
    } catch {
      setCfg({ configured: false, estimated_costs: {}, motor: false })
    }
  }

  useEffect(() => {
    loadCfg()
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      if (preview) URL.revokeObjectURL(preview)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stopPoll = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  const poll = (id) => {
    stopPoll()
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API}/kling/status/${id}`)
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.detail || data.message || data.error || 'Durum alinamadi')
        setTask(data)
        if (data.status === 'succeed' || data.status === 'failed') {
          stopPoll()
          if (data.status === 'succeed') toast.success('Kling video hazir')
          if (data.status === 'failed') toast.error(data.error || 'Uretim basarisiz')
        }
      } catch (e) {
        stopPoll()
        toast.error(e.message)
      }
    }, 4000)
  }

  const onFile = (file) => {
    if (!file) return
    if (preview) URL.revokeObjectURL(preview)
    setPreview(URL.createObjectURL(file))
  }

  const generate = async () => {
    const file = fileRef.current?.files?.[0]
    if (!file) { toast.error('Once bir urun fotografi secin'); return }
    if (!prompt.trim()) { toast.error('Sahne tarifini yazin'); return }
    setBusy(true)
    setTask(null)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('prompt', prompt)
    fd.append('mode', mode)
    fd.append('duration', duration)
    try {
      const res = await fetch(`${API}/kling/generate`, { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail || data.message || data.error || 'Uretim baslamadi')
      setTask(data)
      toast.success('Gorev gonderildi')
      if (data.id) poll(data.id)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const est = cfg.estimated_costs?.[`${mode}_${duration}s`]
  const ready = cfg.configured === true
  const motorDown = cfg.motor === false

  return (
    <div className="space-y-4">
      <div className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs ${ready ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-300' : 'border-amber-500/30 bg-amber-950/20 text-amber-300'}`}>
        <span>
          {cfg.configured == null && 'Kling kontrol ediliyor...'}
          {motorDown && 'Ceviri motoru (8000) kapali — BASLAT_ASM.bat ile acin, Kling oradan gider.'}
          {!motorDown && cfg.configured === false && 'Kling anahtarlari yok — dublaj-ceviri backend/keys.env icine KLING_ACCESS_KEY / KLING_SECRET_KEY.'}
          {ready && 'Kling API bagli — fotograf + tarif ile image-to-video.'}
        </span>
        <button type="button" onClick={loadCfg} className="inline-flex items-center gap-1 text-zinc-400 hover:text-zinc-200"><RefreshCw className="h-3 w-3" /> Yenile</button>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
        <Card className="border-zinc-800 bg-zinc-900/70 lg:col-span-2">
          <CardHeader className="py-2 px-3">
            <CardTitle className="flex items-center gap-2 text-sm"><Clapperboard className="h-4 w-4 text-fuchsia-400" /> Kling AI Video</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-3 pb-3">
            <p className="text-xs text-zinc-500">Urun fotografi yukle, sahneyi yaz. Motor resmi Kling image-to-video; kuyruga otomatik dusmez.</p>
            <label className={`flex min-h-[120px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-3 text-center ${busy ? 'pointer-events-none opacity-70' : 'border-zinc-700 bg-zinc-950/50 hover:border-fuchsia-500/50'}`}>
              {preview ? (
                <img src={preview} alt="urun" className="max-h-36 rounded-md border border-zinc-800 object-contain" />
              ) : (
                <>
                  <ImageIcon className="h-7 w-7 text-zinc-500" />
                  <p className="text-sm text-zinc-300">JPG / PNG birak veya tikla</p>
                </>
              )}
              <input ref={fileRef} type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" className="hidden" disabled={busy} onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
            <Textarea rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)} disabled={busy} placeholder="Orn. kamera yavasca yaklasiyor, urun donuyor, isik yumusak" className="border-zinc-800 bg-zinc-950 text-sm" />
            <div className="grid grid-cols-2 gap-2">
              <select value={mode} onChange={(e) => setMode(e.target.value)} disabled={busy} className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200">
                <option value="std">Standart (720p)</option>
                <option value="pro">Pro (1080p)</option>
              </select>
              <select value={duration} onChange={(e) => setDuration(e.target.value)} disabled={busy} className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200">
                <option value="5">5 sn</option>
                <option value="10">10 sn</option>
              </select>
            </div>
            <p className="text-[11px] text-zinc-500">Tahmini maliyet: {est != null ? `~$${Number(est).toFixed(2)}` : 'bilinmiyor'} (Kling hesabina gore degisir)</p>
            <Button onClick={generate} disabled={busy || !ready} className="w-full bg-fuchsia-600 hover:bg-fuchsia-500">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              {busy ? 'Gonderiliyor...' : 'Video Uret'}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/70 lg:col-span-3">
          <CardHeader className="py-2 px-3"><CardTitle className="text-sm">Sonuc</CardTitle></CardHeader>
          <CardContent className="space-y-3 px-3 pb-3">
            {!task ? (
              <p className="py-10 text-center text-sm text-zinc-500">Henuz gorev yok — soldan fotograf ve tarif ile baslatin.</p>
            ) : (
              <>
                <p className="text-xs text-zinc-400">
                  Durum: <span className="text-zinc-200">{STATUS[task.status] || task.status}</span>
                  {(task.status === 'processing' || task.status === 'submitted') ? ' — otomatik kontrol...' : ''}
                </p>
                {task.error && <p className="text-xs text-red-300">{task.error}</p>}
                {task.status === 'succeed' && (
                  <div className="space-y-2">
                    <video key={task.id} controls src={`${API}/kling/video/${task.id}`} className="mx-auto max-h-[360px] w-auto max-w-full rounded-md border border-zinc-800 bg-black" />
                    <a href={`${API}/kling/video/${task.id}`} className="inline-flex items-center gap-1 text-xs text-emerald-300 hover:underline">
                      <Download className="h-3.5 w-3.5" /> Videoyu indir
                    </a>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
