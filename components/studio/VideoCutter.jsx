'use client'

import { useRef, useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import {
  Upload, Scissors, SplitSquareHorizontal, Loader2, Download, Youtube, Facebook, Instagram,
  CalendarClock, Trash2, Plus, Film, Flag, Image as ImageIcon, Smartphone, VolumeX, Music,
} from 'lucide-react'

const api = async (path, opts) => {
  const res = await fetch('/api' + path, { headers: { 'Content-Type': 'application/json' }, ...opts })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.message || data.error || 'Istek basarisiz')
  return data
}

const fmt = (s) => {
  s = Math.max(0, Number(s) || 0)
  const m = Math.floor(s / 60)
  const sec = (s % 60).toFixed(1).padStart(4, '0')
  return `${m}:${sec}`
}

const CHUNK = 4 * 1024 * 1024

export default function VideoCutter({ pageId }) {
  const videoRef = useRef(null)
  const [file, setFile] = useState(null) // {file, url, duration}
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)

  const [mode, setMode] = useState('trim') // trim | split
  const [start, setStart] = useState(0)
  const [end, setEnd] = useState(0)
  const [busy, setBusy] = useState(false)

  const [splitMode, setSplitMode] = useState('equal') // equal | points
  const [parts, setParts] = useState(2)
  const [points, setPoints] = useState([])

  const [results, setResults] = useState([]) // [{jobId,url,duration,start,end}]
  const [presets, setPresets] = useState([])
  const [posters, setPosters] = useState([])
  const [introOpen, setIntroOpen] = useState(false)
  const [introPoster, setIntroPoster] = useState(null) // {file} or {dataUrl}
  const [introDur, setIntroDur] = useState(2)
  const [introBusy, setIntroBusy] = useState(false)

  useEffect(() => { api('/studio/presets').then(setPresets).catch(() => {}) }, [])
  useEffect(() => { api('/posters').then(setPosters).catch(() => {}) }, [])

  const addResult = (r) => setResults((prev) => [...prev, r])

  const uploadIntroImage = async (e) => {
    const f = e.target.files?.[0]; if (!f) return
    e.target.value = ''
    const dataUrl = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f) })
    setIntroPoster({ dataUrl, thumb: dataUrl, name: f.name })
  }

  const prependIntro = async () => {
    if (!file) return
    if (!introPoster) { toast.error('Once bir afis secin veya yukleyin'); return }
    setIntroBusy(true)
    try {
      const body = { file: file.file, duration: introDur }
      if (introPoster.file) body.posterFile = introPoster.file
      else body.posterDataUrl = introPoster.dataUrl
      const res = await api('/video/prepend-poster', { method: 'POST', body: JSON.stringify(body) })
      addResult({ ...res, label: 'Afisli Giris' })
      setIntroOpen(false)
      toast.success('Afis videonun onune eklendi! Sonuclara bakin.')
    } catch (e) { toast.error(e.message) } finally { setIntroBusy(false) }
  }

  const deleteIntroPoster = async (id) => {
    try { await api('/posters/' + id, { method: 'DELETE' }); setPosters((p) => p.filter((x) => x.id !== id)); if (introPoster?._id === id) setIntroPoster(null) }
    catch (e) { toast.error(e.message) }
  }

  const onUpload = async (e) => {
    const f = e.target.files?.[0]; if (!f) return
    e.target.value = ''
    if (!f.type.startsWith('video')) { toast.error('Lutfen bir video dosyasi secin'); return }
    setUploading(true); setProgress(0); setFile(null); setResults([])
    const uploadId = (crypto?.randomUUID?.() || Math.random().toString(36).slice(2)) + Date.now().toString(36)
    const ext = (f.name.split('.').pop() || 'mp4').toLowerCase()
    const total = Math.max(1, Math.ceil(f.size / CHUNK))
    try {
      let last = null
      for (let i = 0; i < total; i++) {
        const blob = f.slice(i * CHUNK, (i + 1) * CHUNK)
        const form = new FormData()
        form.append('uploadId', uploadId)
        form.append('index', String(i))
        form.append('ext', ext)
        form.append('final', String(i === total - 1))
        form.append('chunk', blob)
        const res = await fetch('/api/video/upload-chunk', { method: 'POST', body: form })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Yukleme hatasi')
        last = data
        setProgress(Math.round(((i + 1) / total) * 100))
      }
      if (!last?.duration) throw new Error('Video suresi okunamadi')
      setFile(last)
      setStart(0); setEnd(Number(last.duration.toFixed(1)))
      toast.success('Video yuklendi (' + fmt(last.duration) + ')')
    } catch (err) { toast.error(err.message) } finally { setUploading(false) }
  }

  const seek = (t) => { if (videoRef.current) videoRef.current.currentTime = Math.max(0, Math.min(file?.duration || 0, t)) }
  const setStartH = (v) => { v = Math.min(Number(v), end - 0.2); setStart(v); seek(v) }
  const setEndH = (v) => { v = Math.max(Number(v), start + 0.2); setEnd(v); seek(v) }

  const addPoint = () => {
    const t = Number((videoRef.current?.currentTime || 0).toFixed(1))
    if (t <= 0 || t >= (file?.duration || 0)) { toast.error('Videoyu oynatip bolme anini secin (0 ve son haric)'); return }
    if (points.includes(t)) return
    setPoints((p) => [...p, t].sort((a, b) => a - b))
  }
  const removePoint = (t) => setPoints((p) => p.filter((x) => x !== t))

  const doTrim = async () => {
    if (!file) return
    setBusy(true)
    try {
      const r = await api('/video/trim', { method: 'POST', body: JSON.stringify({ file: file.file, start, end }) })
      setResults([{ ...r, start, end }])
      toast.success('Video kesildi! Asagidan indirin veya paylasin.')
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  const doSplit = async () => {
    if (!file) return
    const body = splitMode === 'points'
      ? { file: file.file, points }
      : { file: file.file, parts }
    if (splitMode === 'points' && !points.length) { toast.error('En az bir bolme noktasi ekleyin'); return }
    setBusy(true)
    try {
      const r = await api('/video/split', { method: 'POST', body: JSON.stringify(body) })
      setResults(r.segments || [])
      toast.success((r.segments || []).length + ' parca olusturuldu!')
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  const selPct = (v) => file?.duration ? (v / file.duration) * 100 : 0

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      <div className="lg:col-span-3 space-y-4">
        <Card className="border-zinc-800 bg-zinc-900/70">
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Film className="h-4 w-4 text-orange-400" /> Video Kesici & Bolucu</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {!file ? (
              <label className={`flex min-h-[220px] cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-zinc-700 bg-zinc-950/50 p-6 text-center hover:border-orange-500/50 ${uploading ? 'pointer-events-none opacity-70' : ''}`}>
                {uploading ? (
                  <>
                    <Loader2 className="h-8 w-8 animate-spin text-orange-400" />
                    <p className="text-sm text-zinc-300">Yukleniyor... %{progress}</p>
                    <div className="h-2 w-56 overflow-hidden rounded-full bg-zinc-800"><div className="h-full bg-orange-500 transition-all" style={{ width: progress + '%' }} /></div>
                  </>
                ) : (
                  <>
                    <Upload className="h-8 w-8 text-zinc-500" />
                    <p className="text-sm text-zinc-300">Video yuklemek icin tiklayin (MP4, MOV...)</p>
                    <p className="text-xs text-zinc-600">Buyuk dosyalar parcali (chunked) yuklenir</p>
                  </>
                )}
                <input type="file" accept="video/*" onChange={onUpload} className="hidden" disabled={uploading} />
              </label>
            ) : (
              <>
                <video ref={videoRef} src={file.url} controls className="w-full rounded-lg border border-zinc-800 bg-black" />

                {/* Zaman cizelgesi */}
                <div>
                  <div className="relative h-9 w-full rounded-lg border border-zinc-800 bg-zinc-950">
                    {mode === 'trim' ? (
                      <div className="absolute inset-y-0 rounded-md bg-orange-500/30 ring-1 ring-orange-500/60" style={{ left: selPct(start) + '%', width: selPct(end - start) + '%' }} />
                    ) : (
                      points.map((p) => (<div key={p} className="absolute inset-y-0 w-0.5 bg-fuchsia-400" style={{ left: selPct(p) + '%' }} />))
                    )}
                    <div className="absolute inset-x-2 bottom-0 flex justify-between text-[10px] text-zinc-600"><span>0:00.0</span><span>{fmt(file.duration)}</span></div>
                  </div>

                  {mode === 'trim' && (
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center gap-2 text-xs text-zinc-300">
                        <Flag className="h-3.5 w-3.5 text-orange-400" /> Baslangic: <span className="font-mono text-orange-300">{fmt(start)}</span>
                        <input type="range" min="0" max={file.duration} step="0.1" value={start} onChange={(e) => setStartH(e.target.value)} className="flex-1 accent-orange-500" />
                      </div>
                      <div className="flex items-center gap-2 text-xs text-zinc-300">
                        <Flag className="h-3.5 w-3.5 text-emerald-400" /> Bitis: <span className="font-mono text-emerald-300">{fmt(end)}</span>
                        <input type="range" min="0" max={file.duration} step="0.1" value={end} onChange={(e) => setEndH(e.target.value)} className="flex-1 accent-emerald-500" />
                      </div>
                      <p className="text-xs text-zinc-500">Secilen parca suresi: <span className="text-orange-300">{fmt(end - start)}</span></p>
                    </div>
                  )}

                  {mode === 'split' && (
                    <div className="mt-3 space-y-3">
                      <div className="flex gap-2">
                        <button onClick={() => setSplitMode('equal')} className={`rounded-lg border px-3 py-1.5 text-xs ${splitMode === 'equal' ? 'border-fuchsia-500 bg-fuchsia-500/15 text-fuchsia-300' : 'border-zinc-700 text-zinc-400'}`}>Esit Parcalara Bol</button>
                        <button onClick={() => setSplitMode('points')} className={`rounded-lg border px-3 py-1.5 text-xs ${splitMode === 'points' ? 'border-fuchsia-500 bg-fuchsia-500/15 text-fuchsia-300' : 'border-zinc-700 text-zinc-400'}`}>Nokta Belirleyerek Bol</button>
                      </div>
                      {splitMode === 'equal' ? (
                        <div className="flex items-center gap-2 text-xs text-zinc-300">
                          Parca sayisi:
                          <input type="range" min="2" max="10" value={parts} onChange={(e) => setParts(Number(e.target.value))} className="flex-1 accent-fuchsia-500" />
                          <span className="font-semibold text-fuchsia-300">{parts}</span>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Button onClick={addPoint} variant="outline" size="sm" className="border-fuchsia-700/50 bg-fuchsia-950/20 text-fuchsia-200"><Plus className="mr-1.5 h-3.5 w-3.5" /> Su Anki Sureyi Bolme Noktasi Yap</Button>
                          <div className="flex flex-wrap gap-1.5">
                            {points.map((p) => (
                              <span key={p} className="inline-flex items-center gap-1 rounded-full border border-fuchsia-500/40 bg-fuchsia-500/10 px-2 py-0.5 text-xs text-fuchsia-200">{fmt(p)}<button onClick={() => removePoint(p)}><Trash2 className="h-3 w-3" /></button></span>
                            ))}
                            {!points.length && <span className="text-xs text-zinc-600">Henuz nokta yok — videoyu oynatip ekleyin</span>}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => setMode('trim')} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm ${mode === 'trim' ? 'border-orange-500 bg-orange-500/15 text-orange-300' : 'border-zinc-700 text-zinc-400'}`}><Scissors className="h-4 w-4" /> Kes (Trim)</button>
                  <button onClick={() => setMode('split')} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm ${mode === 'split' ? 'border-fuchsia-500 bg-fuchsia-500/15 text-fuchsia-300' : 'border-zinc-700 text-zinc-400'}`}><SplitSquareHorizontal className="h-4 w-4" /> Bol (Split)</button>
                  <span className="w-px self-stretch bg-zinc-800" />
                  {mode === 'trim' ? (
                    <Button onClick={doTrim} disabled={busy} className="bg-orange-600 hover:bg-orange-500">{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Scissors className="mr-2 h-4 w-4" />} Videoyu Kes</Button>
                  ) : (
                    <Button onClick={doSplit} disabled={busy} className="bg-fuchsia-600 hover:bg-fuchsia-500">{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <SplitSquareHorizontal className="mr-2 h-4 w-4" />} Videoyu Bol</Button>
                  )}
                  <Button onClick={() => { setFile(null); setResults([]); setPoints([]) }} variant="outline" className="border-zinc-700 text-zinc-300">Yeni Video</Button>
                </div>

                {/* Afis / Intro onune ekleme */}
                <div className="rounded-lg border border-orange-500/20 bg-orange-950/10 p-3">
                  <button onClick={() => setIntroOpen((s) => !s)} className="flex w-full items-center gap-2 text-sm font-medium text-orange-300">
                    <Film className="h-4 w-4" /> Afis / Giris Ekle (video onune) <span className="ml-auto text-xs text-zinc-500">{introOpen ? 'gizle' : 'ac'}</span>
                  </button>
                  {introOpen && (
                    <div className="mt-3 space-y-3">
                      <p className="text-xs text-zinc-500">Reels Studyosunda "Afisi Video Girisi Icin Kaydet" ile kaydettiginiz afisi secin veya yeni bir gorsel yukleyin. Afis, videonun basina giris olarak eklenir.</p>
                      {posters.length > 0 && (
                        <div className="grid grid-cols-4 gap-2">
                          {posters.map((p) => (
                            <div key={p.id} className="group relative">
                              <button onClick={() => setIntroPoster({ file: p.file, _id: p.id })} className={`aspect-[9/16] w-full overflow-hidden rounded-md border ${introPoster?.file === p.file ? 'border-orange-500 ring-2 ring-orange-500/50' : 'border-zinc-700'} bg-zinc-950`}>
                                <img src={p.thumb || p.url} alt={p.name} className="h-full w-full object-cover" />
                              </button>
                              <button onClick={() => deleteIntroPoster(p.id)} className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white opacity-0 transition-opacity group-hover:opacity-100"><Trash2 className="h-3 w-3" /></button>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 hover:border-orange-500/50">
                          <ImageIcon className="h-3.5 w-3.5" /> Yeni Afis Yukle<input type="file" accept="image/*" onChange={uploadIntroImage} className="hidden" />
                        </label>
                        {introPoster && <span className="text-xs text-emerald-400">Afis secildi ✓</span>}
                      </div>
                      <div>
                        <label className="mb-1 flex items-center justify-between text-xs text-zinc-500"><span>Giris suresi</span><span className="font-semibold text-orange-300">{introDur.toFixed(1)} sn</span></label>
                        <input type="range" min="0.5" max="10" step="0.5" value={introDur} onChange={(e) => setIntroDur(Number(e.target.value))} className="w-full accent-orange-500" />
                      </div>
                      <Button onClick={prependIntro} disabled={introBusy || !introPoster} className="w-full bg-orange-600 hover:bg-orange-500">{introBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Film className="mr-2 h-4 w-4" />} Afisi Videonun Onune Ekle</Button>
                    </div>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="lg:col-span-2 space-y-4">
        <Card className="border-zinc-800 bg-zinc-900/70">
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Download className="h-4 w-4 text-emerald-400" /> Sonuclar</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {!results.length ? (
              <p className="text-sm text-zinc-500">Kesme/bolme sonrasi parcalar burada gorunur; indirebilir veya paylasabilirsiniz.</p>
            ) : results.map((r, i) => (
              <ResultCard key={r.jobId} index={i} r={r} pageId={pageId} presets={presets} onNewResult={addResult} />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function ResultCard({ r, index, pageId, presets = [], onNewResult }) {
  const vidRef = useRef(null)
  const [publishing, setPublishing] = useState('')
  const [schedAt, setSchedAt] = useState('')
  const [schedPlatforms, setSchedPlatforms] = useState({ youtube: false, facebook: true, instagram: false })
  const [schedCaption, setSchedCaption] = useState('')
  const [showSched, setShowSched] = useState(false)
  const [working, setWorking] = useState('')
  const [thumb, setThumb] = useState(null)
  const [showMusic, setShowMusic] = useState(false)
  const [presetId, setPresetId] = useState('enerjik')

  const grabThumb = async () => {
    setWorking('thumb')
    try {
      const t = Number((vidRef.current?.currentTime || 0).toFixed(2))
      const res = await api('/video/thumbnail', { method: 'POST', body: JSON.stringify({ file: r.file, time: t }) })
      setThumb(res.url)
      toast.success('Kapak alindi (' + fmt(t) + ')')
    } catch (e) { toast.error(e.message) } finally { setWorking('') }
  }

  const makeVertical = async () => {
    setWorking('vertical')
    try {
      const res = await api('/video/vertical', { method: 'POST', body: JSON.stringify({ file: r.file }) })
      onNewResult?.({ ...res, label: '9:16 Dikey' })
      toast.success('9:16 dikey video hazir! Sonuclara eklendi.')
    } catch (e) { toast.error(e.message) } finally { setWorking('') }
  }

  const muteVideo = async () => {
    setWorking('mute')
    try {
      const res = await api('/video/audio', { method: 'POST', body: JSON.stringify({ file: r.file, action: 'mute' }) })
      onNewResult?.({ ...res, label: 'Sessiz' })
      toast.success('Sesi kaldirilmis video hazir!')
    } catch (e) { toast.error(e.message) } finally { setWorking('') }
  }

  const addMusic = async () => {
    setWorking('music')
    try {
      const res = await api('/video/audio', { method: 'POST', body: JSON.stringify({ file: r.file, action: 'music', presetId }) })
      onNewResult?.({ ...res, label: 'Muzikli' })
      setShowMusic(false)
      toast.success('Muzik bindirilmis video hazir!')
    } catch (e) { toast.error(e.message) } finally { setWorking('') }
  }

  const publish = async (platform) => {
    setPublishing(platform)
    const ep = platform === 'youtube' ? '/youtube/upload-short' : platform === 'facebook' ? '/reels/publish-fb' : '/reels/publish-ig'
    try {
      const res = await api(ep, { method: 'POST', body: JSON.stringify({ jobId: r.jobId, pageId }) })
      toast.success(`${platform} yayinlandi: ${res.url || res.video_id || res.videoId || 'ok'}`)
    } catch (e) {
      if (String(e.message).match(/OAUTH/i)) toast.error('YouTube icin Ayarlar > Kanal Bagla ile OAuth kurun')
      else toast.error(e.message)
    } finally { setPublishing('') }
  }

  const scheduleIt = async () => {
    const platforms = Object.entries(schedPlatforms).filter(([, v]) => v).map(([k]) => k)
    if (!schedAt) { toast.error('Tarih/saat secin'); return }
    if (!platforms.length) { toast.error('En az bir platform secin'); return }
    try {
      await api('/schedule', { method: 'POST', body: JSON.stringify({ jobId: r.jobId, platforms, caption: schedCaption, scheduledAt: new Date(schedAt).toISOString() }) })
      toast.success('Paylasim zamanlandi! Takvim sekmesinden takip edin.')
      setShowSched(false)
    } catch (e) { toast.error(e.message) }
  }

  return (
    <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
      <div className="flex items-center justify-between text-xs text-zinc-400">
        <span className="font-medium text-zinc-200">{r.label || `Parca ${index + 1}`}</span>
        <span>{r.duration != null ? fmt(r.duration) : ''}{r.start != null ? ` (${fmt(r.start)} → ${fmt(r.end)})` : ''}</span>
      </div>
      <video ref={vidRef} src={r.url} controls className="w-full rounded border border-zinc-800 bg-black" />

      {/* Ekstra araclar */}
      <div className="flex flex-wrap gap-1.5">
        <button onClick={grabThumb} disabled={!!working} className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-300 hover:border-amber-500/50 disabled:opacity-50">{working === 'thumb' ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImageIcon className="h-3 w-3" />} Kapak Al</button>
        <button onClick={makeVertical} disabled={!!working} className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-300 hover:border-fuchsia-500/50 disabled:opacity-50">{working === 'vertical' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Smartphone className="h-3 w-3" />} 9:16 Yap</button>
        <button onClick={muteVideo} disabled={!!working} className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-300 hover:border-red-500/50 disabled:opacity-50">{working === 'mute' ? <Loader2 className="h-3 w-3 animate-spin" /> : <VolumeX className="h-3 w-3" />} Sesi Kaldir</button>
        <button onClick={() => setShowMusic((s) => !s)} disabled={!!working} className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-300 hover:border-emerald-500/50 disabled:opacity-50">{working === 'music' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Music className="h-3 w-3" />} Muzik Bindir</button>
      </div>

      {showMusic && (
        <div className="space-y-2 rounded-lg border border-emerald-500/20 bg-emerald-950/10 p-2">
          <div className="flex flex-wrap gap-1.5">
            {presets.map((p) => (<button key={p.id} onClick={() => setPresetId(p.id)} className={`rounded-full border px-2.5 py-1 text-[11px] ${presetId === p.id ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300' : 'border-zinc-700 text-zinc-400'}`}>{p.name}</button>))}
          </div>
          {presetId && <audio controls src={`/api/media?dir=music&file=${presetId}.mp3`} className="h-8 w-full" />}
          <Button onClick={addMusic} disabled={!!working} size="sm" className="w-full bg-emerald-600 hover:bg-emerald-500"><Music className="mr-2 h-4 w-4" /> Secili Muzigi Bindir</Button>
        </div>
      )}

      {thumb && (
        <div className="space-y-1 rounded-lg border border-amber-500/20 bg-amber-950/10 p-2">
          <p className="text-[11px] text-amber-300">Kapak Gorseli</p>
          <img src={thumb} alt="kapak" className="w-full rounded border border-zinc-800" />
          <a href={thumb} download className="inline-flex items-center gap-1 text-[11px] text-amber-200 hover:underline"><Download className="h-3 w-3" /> Kapagi Indir</a>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <a href={r.url} download className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-700/50 bg-emerald-950/20 px-3 py-2 text-xs text-emerald-200 hover:bg-emerald-900/30"><Download className="h-3.5 w-3.5" /> Indir</a>
        <button onClick={() => setShowSched((s) => !s)} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-indigo-700/50 bg-indigo-950/20 px-3 py-2 text-xs text-indigo-200 hover:bg-indigo-900/30"><CalendarClock className="h-3.5 w-3.5" /> Zamanla</button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Button onClick={() => publish('youtube')} disabled={publishing === 'youtube'} className="bg-red-600 px-1 text-xs hover:bg-red-500">{publishing === 'youtube' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Youtube className="mr-1 h-4 w-4" />} YT</Button>
        <Button onClick={() => publish('facebook')} disabled={publishing === 'facebook'} className="bg-blue-600 px-1 text-xs hover:bg-blue-500">{publishing === 'facebook' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Facebook className="mr-1 h-4 w-4" />} FB</Button>
        <Button onClick={() => publish('instagram')} disabled={publishing === 'instagram'} className="bg-gradient-to-r from-fuchsia-600 to-pink-500 px-1 text-xs hover:opacity-90">{publishing === 'instagram' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Instagram className="mr-1 h-4 w-4" />} IG</Button>
      </div>
      {showSched && (
        <div className="space-y-2 rounded-lg border border-indigo-500/20 bg-indigo-950/20 p-2">
          <input type="datetime-local" value={schedAt} onChange={(e) => setSchedAt(e.target.value)} className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200" />
          <div className="flex flex-wrap gap-2 text-xs text-zinc-300">
            {['youtube', 'facebook', 'instagram'].map((p) => (
              <label key={p} className="flex items-center gap-1 capitalize"><input type="checkbox" checked={schedPlatforms[p]} onChange={(e) => setSchedPlatforms((s) => ({ ...s, [p]: e.target.checked }))} /> {p}</label>
            ))}
          </div>
          <Textarea rows={2} value={schedCaption} onChange={(e) => setSchedCaption(e.target.value)} placeholder="Aciklama (opsiyonel)" className="border-zinc-800 bg-zinc-950 text-xs" />
          <Button onClick={scheduleIt} size="sm" className="w-full bg-indigo-600 hover:bg-indigo-500"><CalendarClock className="mr-2 h-4 w-4" /> Zamanla</Button>
        </div>
      )}
    </div>
  )
}
