'use client'

import { useRef, useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import {
  Upload, Scissors, SplitSquareHorizontal, Loader2, Download, Youtube, Facebook, Instagram,
  CalendarClock, Trash2, Plus, Film, Flag, Image as ImageIcon, Smartphone, VolumeX, Music, Type,
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
  const [ranges, setRanges] = useState([])
  const [rangeStart, setRangeStart] = useState(0)
  const [rangeEnd, setRangeEnd] = useState(0)

  const [results, setResults] = useState([]) // [{jobId,url,duration,start,end}]
  const [presets, setPresets] = useState([])
  const [posters, setPosters] = useState([])
  const [introOpen, setIntroOpen] = useState(false)
  const [introPoster, setIntroPoster] = useState(null) // {file} or {dataUrl}
  const [introDur, setIntroDur] = useState(2)
  const [introBusy, setIntroBusy] = useState(false)
  const [history, setHistory] = useState([])
  const [playerSize, setPlayerSize] = useState('orta') // kucuk | orta | buyuk
  const [textOpen, setTextOpen] = useState(false)

  const playerH = {
    kucuk: 'max-h-[220px]',
    orta: 'max-h-[min(40vh,380px)]',
    buyuk: 'max-h-[min(62vh,560px)]',
  }

  useEffect(() => { api('/studio/presets').then(setPresets).catch(() => {}) }, [])
  useEffect(() => { api('/posters').then(setPosters).catch(() => {}) }, [])

  const addResult = (r) => setResults((prev) => [...prev, r])

  const uploadIntroImage = async (e) => {
    const f = e.target.files?.[0]; if (!f) return
    e.target.value = ''
    const dataUrl = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f) })
    setIntroPoster({ dataUrl, thumb: dataUrl, name: f.name })
  }

  const adoptFile = (r, label) => {
    const dur = Number(r.duration || 0)
    setHistory((h) => (file ? [...h, file] : h))
    setFile({ file: r.file, url: `${r.url}${r.url.includes('?') ? '&' : '?'}t=${Date.now()}`, duration: dur })
    setStart(0)
    setEnd(Number(dur.toFixed(1)))
    setRangeStart(0)
    setRangeEnd(Number(dur.toFixed(1)))
    setRanges([])
    addResult({ ...r, label })
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
      adoptFile(res, 'Afisli Giris')
      setIntroOpen(false)
      toast.success('Afis basa eklendi. Oynaticida yeni video var — tekrar yukleme yok.')
    } catch (e) { toast.error(e.message) } finally { setIntroBusy(false) }
  }

  const deleteIntroPoster = async (id, e) => {
    e?.stopPropagation?.()
    e?.preventDefault?.()
    if (!id) return
    try {
      await api('/posters/' + id, { method: 'DELETE' })
      setPosters((p) => p.filter((x) => x.id !== id))
      if (introPoster?._id === id) setIntroPoster(null)
      toast.success('Afis listeden kaldirildi')
    } catch (err) { toast.error(err.message) }
  }

  const undoLastEdit = () => {
    if (!history.length) { toast.error('Geri alinacak adim yok'); return }
    const prev = history[history.length - 1]
    setHistory((h) => h.slice(0, -1))
    setFile(prev)
    const dur = Number(prev.duration || 0)
    setStart(0)
    setEnd(Number(dur.toFixed(1)))
    setRangeStart(0)
    setRangeEnd(Number(dur.toFixed(1)))
    setRanges([])
    toast.success('Onceki videoya donuldu — bu videoda afis yok')
  }

  const onUpload = async (e) => {
    const f = e.target.files?.[0]; if (!f) return
    e.target.value = ''
    if (!f.type.startsWith('video')) { toast.error('Lutfen bir video dosyasi secin'); return }
    setUploading(true); setProgress(0); setFile(null); setResults([]); setHistory([])
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
      setRangeStart(0); setRangeEnd(Number(last.duration.toFixed(1))); setRanges([])
      toast.success('Video yuklendi (' + fmt(last.duration) + ')')
    } catch (err) { toast.error(err.message) } finally { setUploading(false) }
  }

  const seek = (t) => { if (videoRef.current) videoRef.current.currentTime = Math.max(0, Math.min(file?.duration || 0, t)) }
  const setStartH = (v) => { v = Math.min(Number(v), end - 0.2); setStart(v); seek(v) }
  const setEndH = (v) => { v = Math.max(Number(v), start + 0.2); setEnd(v); seek(v) }

  const setRangeStartH = (v) => {
    v = Math.min(Math.max(0, Number(v) || 0), rangeEnd - 0.2)
    setRangeStart(Number(v.toFixed(1)))
    seek(v)
  }
  const setRangeEndH = (v) => {
    const dur = file?.duration || 0
    v = Math.max(Math.min(dur, Number(v) || 0), rangeStart + 0.2)
    setRangeEnd(Number(v.toFixed(1)))
    seek(v)
  }
  const addRange = () => {
    const dur = file?.duration || 0
    const s = Number(Math.max(0, rangeStart).toFixed(1))
    const e = Number(Math.min(dur, rangeEnd).toFixed(1))
    if (!(e - s > 0.2)) { toast.error('Bitis, baslangictan en az 0.2 sn sonra olmali'); return }
    setRanges((prev) => [...prev, { id: Date.now() + '-' + prev.length, start: s, end: e }])
    toast.success(`${fmt(s)} → ${fmt(e)} kuyruga eklendi`)
  }
  const removeRange = (id) => setRanges((prev) => prev.filter((x) => x.id !== id))

  const cutOutRanges = async (list) => {
    if (!file) return
    const dur = file.duration || 0
    const clean = (list || []).filter((r) => r.end - r.start > 0.2)
    if (!clean.length) { toast.error('Silinecek aralik secin'); return }
    const cutLen = clean.reduce((a, r) => a + (r.end - r.start), 0)
    if (cutLen >= dur - 0.3) { toast.error('Tum videoyu silemezsiniz'); return }
    setBusy(true)
    try {
      const r = await api('/video/excise', { method: 'POST', body: JSON.stringify({ file: file.file, ranges: clean.map(({ start: s, end: e }) => ({ start: s, end: e })) }) })
      adoptFile(r, 'Aralik cikarildi')
      toast.success('Secilen alan videodan cikti. Oynaticiyi tekrar izleyin — o kisim yok.')
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  const doTrim = async () => {
    if (!file) return
    setBusy(true)
    try {
      const r = await api('/video/trim', { method: 'POST', body: JSON.stringify({ file: file.file, start, end }) })
      adoptFile(r, 'Kesildi (sadece bu parca)')
      toast.success('Sadece secilen parca kaldi. Duzenlemeye devam edebilirsiniz.')
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  const doSplit = async () => {
    if (!file) return
    const body = splitMode === 'points'
      ? { file: file.file, ranges: ranges.map(({ start: s, end: e }) => ({ start: s, end: e })) }
      : { file: file.file, parts }
    if (splitMode === 'points' && !ranges.length) { toast.error('En az bir baslangic-bitis araligi ekleyin'); return }
    setBusy(true)
    try {
      const r = await api('/video/split', { method: 'POST', body: JSON.stringify(body) })
      setResults(r.segments || [])
      toast.success((r.segments || []).length + ' parca olusturuldu!')
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  const selPct = (v) => file?.duration ? (v / file.duration) * 100 : 0

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
      <div className="lg:col-span-3 space-y-3">
        <Card className="border-zinc-800 bg-zinc-900/70">
          <CardHeader className="py-2 px-3"><CardTitle className="flex items-center gap-2 text-sm"><Film className="h-4 w-4 text-orange-400" /> Video Kesici & Bolucu</CardTitle></CardHeader>
          <CardContent className="space-y-2 px-3 pb-3">
            {!file ? (
              <label className={`flex min-h-[120px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-700 bg-zinc-950/50 p-4 text-center hover:border-orange-500/50 ${uploading ? 'pointer-events-none opacity-70' : ''}`}>
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
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button type="button" onClick={() => setMode('trim')} className={`inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs ${mode === 'trim' ? 'border-orange-500 bg-orange-500/15 text-orange-300' : 'border-zinc-700 text-zinc-400'}`}><Scissors className="h-3.5 w-3.5" /> Kes</button>
                    <button type="button" onClick={() => setMode('split')} className={`inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs ${mode === 'split' ? 'border-fuchsia-500 bg-fuchsia-500/15 text-fuchsia-300' : 'border-zinc-700 text-zinc-400'}`}><SplitSquareHorizontal className="h-3.5 w-3.5" /> Bol</button>
                  </div>
                  <div className="flex items-center gap-0.5 rounded-md border border-zinc-800 bg-zinc-950 p-0.5">
                    {[
                      ['kucuk', 'Kucuk'],
                      ['orta', 'Orta'],
                      ['buyuk', 'Buyuk'],
                    ].map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setPlayerSize(id)}
                        className={`rounded px-2 py-1 text-[11px] ${playerSize === id ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,1fr)]">
                  <div className="space-y-1.5 rounded-lg border border-zinc-800 bg-zinc-950/90 p-2">
                    <video key={file.file} ref={videoRef} src={file.url} controls className={`mx-auto w-auto max-w-full rounded-md border border-zinc-800 bg-black ${playerH[playerSize]}`} />
                    <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-zinc-500">
                      <span>{fmt(file.duration)}</span>
                      <div className="flex flex-wrap items-center gap-2">
                        {history.length > 0 && (
                          <button type="button" onClick={undoLastEdit} className="inline-flex items-center gap-1 text-red-300 hover:underline">
                            <Trash2 className="h-3 w-3" /> Geri al
                          </button>
                        )}
                        <a href={file.url} download className="inline-flex items-center gap-1 text-emerald-300 hover:underline"><Download className="h-3 w-3" /> Indir</a>
                      </div>
                    </div>
                    <div className="relative h-6 w-full rounded-md border border-zinc-800 bg-zinc-900">
                      {mode === 'trim' ? (
                        <div className="absolute inset-y-0 rounded-md bg-orange-500/30 ring-1 ring-orange-500/60" style={{ left: selPct(start) + '%', width: selPct(end - start) + '%' }} />
                      ) : splitMode === 'points' ? (
                        <>
                          <div className="absolute inset-y-0 rounded-md bg-fuchsia-400/20 ring-1 ring-fuchsia-400/40" style={{ left: selPct(rangeStart) + '%', width: selPct(rangeEnd - rangeStart) + '%' }} />
                          {ranges.map((r) => (
                            <div key={r.id} className="absolute inset-y-0 rounded-md bg-fuchsia-500/40 ring-1 ring-fuchsia-400/70" style={{ left: selPct(r.start) + '%', width: selPct(r.end - r.start) + '%' }} />
                          ))}
                        </>
                      ) : null}
                      <div className="absolute inset-x-1 bottom-0 flex justify-between text-[9px] text-zinc-600"><span>0:00</span><span>{fmt(file.duration)}</span></div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {mode === 'trim' && (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 text-xs text-zinc-300">
                          <Flag className="h-3.5 w-3.5 shrink-0 text-orange-400" /> Baslangic: <span className="font-mono text-orange-300">{fmt(start)}</span>
                        </div>
                        <input type="range" min="0" max={file.duration} step="0.1" value={start} onChange={(e) => setStartH(e.target.value)} className="w-full accent-orange-500" />
                        <div className="flex items-center gap-2 text-xs text-zinc-300">
                          <Flag className="h-3.5 w-3.5 shrink-0 text-emerald-400" /> Bitis: <span className="font-mono text-emerald-300">{fmt(end)}</span>
                        </div>
                        <input type="range" min="0" max={file.duration} step="0.1" value={end} onChange={(e) => setEndH(e.target.value)} className="w-full accent-emerald-500" />
                        <p className="text-xs text-zinc-500">Secilen parca: <span className="text-orange-300">{fmt(end - start)}</span></p>
                      </div>
                    )}

                    {mode === 'split' && (
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => setSplitMode('equal')} className={`rounded-lg border px-3 py-1.5 text-xs ${splitMode === 'equal' ? 'border-fuchsia-500 bg-fuchsia-500/15 text-fuchsia-300' : 'border-zinc-700 text-zinc-400'}`}>Esit Parcalara Bol</button>
                          <button type="button" onClick={() => setSplitMode('points')} className={`rounded-lg border px-3 py-1.5 text-xs ${splitMode === 'points' ? 'border-fuchsia-500 bg-fuchsia-500/15 text-fuchsia-300' : 'border-zinc-700 text-zinc-400'}`}>Aralik Cikar</button>
                        </div>
                        {splitMode === 'equal' ? (
                          <div className="flex items-center gap-2 text-xs text-zinc-300">
                            Parca sayisi:
                            <input type="range" min="2" max="10" value={parts} onChange={(e) => setParts(Number(e.target.value))} className="flex-1 accent-fuchsia-500" />
                            <span className="font-semibold text-fuchsia-300">{parts}</span>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <p className="text-[11px] text-zinc-500">Araligi sec, <b className="text-zinc-400">Bu Alani Sil</b> — oynaticida o kisim kalkar.</p>
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-300">
                                <Flag className="h-3.5 w-3.5 text-fuchsia-400" /> Baslangic
                                <span className="font-mono text-fuchsia-300">{fmt(rangeStart)}</span>
                                <input type="number" min="0" max={file.duration} step="0.1" value={rangeStart} onChange={(e) => setRangeStartH(e.target.value)} className="w-20 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-fuchsia-200" />
                                <span className="text-zinc-600">sn</span>
                              </div>
                              <input type="range" min="0" max={file.duration} step="0.1" value={rangeStart} onChange={(e) => setRangeStartH(e.target.value)} className="w-full accent-fuchsia-500" />
                            </div>
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-300">
                                <Flag className="h-3.5 w-3.5 text-emerald-400" /> Bitis
                                <span className="font-mono text-emerald-300">{fmt(rangeEnd)}</span>
                                <input type="number" min="0" max={file.duration} step="0.1" value={rangeEnd} onChange={(e) => setRangeEndH(e.target.value)} className="w-20 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-emerald-200" />
                                <span className="text-zinc-600">sn</span>
                              </div>
                              <input type="range" min="0" max={file.duration} step="0.1" value={rangeEnd} onChange={(e) => setRangeEndH(e.target.value)} className="w-full accent-emerald-500" />
                            </div>
                            <p className="text-xs text-zinc-500">Secilen parca: <span className="text-fuchsia-300">{fmt(rangeEnd - rangeStart)}</span></p>
                            <div className="flex flex-wrap gap-2">
                              <Button onClick={addRange} variant="outline" size="sm" className="border-fuchsia-700/50 bg-fuchsia-950/20 text-fuchsia-200"><Plus className="mr-1.5 h-3.5 w-3.5" /> Kuyruga Ekle</Button>
                              <Button
                                type="button"
                                onClick={() => cutOutRanges([{ start: rangeStart, end: rangeEnd }])}
                                disabled={busy}
                                variant="outline"
                                size="sm"
                                className="border-red-800/60 bg-red-950/20 text-red-300 hover:bg-red-950/40"
                              >
                                {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1.5 h-3.5 w-3.5" />} Bu Alani Sil
                              </Button>
                              {ranges.length > 0 && (
                                <Button type="button" onClick={() => cutOutRanges(ranges)} disabled={busy} size="sm" className="bg-red-700 hover:bg-red-600">
                                  Kuyruktakileri Cikar ({ranges.length})
                                </Button>
                              )}
                            </div>
                            <div className="max-h-28 space-y-1.5 overflow-y-auto">
                              {ranges.map((r) => (
                                <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-fuchsia-500/30 bg-fuchsia-500/10 px-3 py-1.5">
                                  <span className="text-xs text-fuchsia-200">{fmt(r.start)} → {fmt(r.end)} <span className="text-zinc-500">({fmt(r.end - r.start)})</span></span>
                                  <button type="button" onClick={() => removeRange(r.id)} className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800">
                                    <Trash2 className="h-3 w-3" /> Kuyruktan Sil
                                  </button>
                                </div>
                              ))}
                              {!ranges.length && <span className="text-xs text-zinc-600">Tek aralik: baslangic/bitis + Bu Alani Sil. Birden fazla icin kuyruga ekleyin.</span>}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {mode === 'trim' ? (
                        <Button onClick={doTrim} disabled={busy} className="bg-orange-600 hover:bg-orange-500">{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Scissors className="mr-2 h-4 w-4" />} Videoyu Kes</Button>
                      ) : (
                        <Button onClick={doSplit} disabled={busy} className="bg-fuchsia-600 hover:bg-fuchsia-500">{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <SplitSquareHorizontal className="mr-2 h-4 w-4" />} Videoyu Bol</Button>
                      )}
                      <Button onClick={() => { setFile(null); setResults([]); setRanges([]); setHistory([]) }} variant="outline" className="border-zinc-700 text-zinc-300">Yeni Video</Button>
                    </div>
                  </div>
                </div>

                {/* Afis / Intro onune ekleme */}
                <div className="rounded-lg border border-orange-500/20 bg-orange-950/10 p-2">
                  <button onClick={() => setIntroOpen((s) => !s)} className="flex w-full items-center gap-2 text-sm font-medium text-orange-300">
                    <Film className="h-4 w-4" /> Afis / Giris Ekle (video onune) <span className="ml-auto text-xs text-zinc-500">{introOpen ? 'gizle' : 'ac'}</span>
                  </button>
                  {introOpen && (
                    <div className="mt-3 space-y-3">
                      <p className="text-xs text-zinc-500">Reels Studyosunda "Afisi Video Girisi Icin Kaydet" ile kaydettiginiz afisi secin veya yeni bir gorsel yukleyin. Afis, videonun basina giris olarak eklenir.</p>
                      {posters.length > 0 && (
                        <div className="grid grid-cols-4 gap-2">
                          {posters.map((p) => (
                            <div key={p.id} className="space-y-1">
                              <button type="button" onClick={() => setIntroPoster({ file: p.file, _id: p.id })} className={`aspect-[9/16] w-full overflow-hidden rounded-md border ${introPoster?._id === p.id ? 'border-orange-500 ring-2 ring-orange-500/50' : 'border-zinc-700'} bg-zinc-950`}>
                                <img src={p.thumb || p.url} alt={p.name} className="h-full w-full object-cover" />
                              </button>
                              <button type="button" onClick={(e) => deleteIntroPoster(p.id, e)} className="flex w-full items-center justify-center gap-1 rounded-md border border-red-800/50 bg-red-950/40 px-1.5 py-1 text-[10px] text-red-300 hover:bg-red-900/50">
                                <Trash2 className="h-3 w-3" /> Kaldir
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 hover:border-orange-500/50">
                          <ImageIcon className="h-3.5 w-3.5" /> Yeni Afis Yukle<input type="file" accept="image/*" onChange={uploadIntroImage} className="hidden" />
                        </label>
                        {introPoster && (
                          <>
                            <span className="text-xs text-emerald-400">Afis secildi ✓</span>
                            <button type="button" onClick={() => setIntroPoster(null)} className="text-xs text-red-300 underline hover:text-red-200">Secimi birak</button>
                          </>
                        )}
                      </div>
                      <div>
                        <label className="mb-1 flex items-center justify-between text-xs text-zinc-500"><span>Giris suresi</span><span className="font-semibold text-orange-300">{introDur.toFixed(1)} sn</span></label>
                        <input type="range" min="0.5" max="10" step="0.5" value={introDur} onChange={(e) => setIntroDur(Number(e.target.value))} className="w-full accent-orange-500" />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Button onClick={prependIntro} disabled={introBusy || !introPoster} className="w-full bg-orange-600 hover:bg-orange-500">{introBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Film className="mr-2 h-4 w-4" />} Afisi Videonun Onune Ekle</Button>
                        {history.length > 0 && (
                          <Button type="button" onClick={undoLastEdit} variant="outline" className="w-full border-red-800/50 bg-red-950/20 text-red-300 hover:bg-red-950/40">
                            <Trash2 className="mr-2 h-4 w-4" /> Afisi bu videodan kaldir (geri al)
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-sky-500/20 bg-sky-950/10 p-2">
                  <button type="button" onClick={() => setTextOpen((s) => !s)} className="flex w-full items-center gap-2 text-sm font-medium text-sky-300">
                    <Type className="h-4 w-4" /> Sahneye yazi / reklam ekle <span className="ml-auto text-xs text-zinc-500">{textOpen ? 'gizle' : 'ac'}</span>
                  </button>
                  {textOpen && (
                    <OverlayTextForm
                      duration={file.duration}
                      currentTime={videoRef.current?.currentTime || 0}
                      busy={busy}
                      onApply={async (payload) => {
                        setBusy(true)
                        try {
                          const res = await api('/video/overlay-text', { method: 'POST', body: JSON.stringify({ file: file.file, ...payload }) })
                          adoptFile(res, 'Yazili sahne')
                          toast.success('Yazi videoya bindirildi. Oynaticida kontrol edin.')
                        } catch (e) { toast.error(e.message) } finally { setBusy(false) }
                      }}
                    />
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="lg:col-span-2 space-y-3">
        <Card className="border-zinc-800 bg-zinc-900/70">
          <CardHeader className="py-2 px-3"><CardTitle className="flex items-center gap-2 text-sm"><Download className="h-4 w-4 text-emerald-400" /> Sonuclar</CardTitle></CardHeader>
          <CardContent className="space-y-3 px-3 pb-3">
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
  const [showText, setShowText] = useState(false)

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
      <video ref={vidRef} src={r.url} controls className="mx-auto max-h-36 w-auto max-w-full rounded border border-zinc-800 bg-black" />

      {/* Ekstra araclar */}
      <div className="flex flex-wrap gap-1.5">
        <button onClick={grabThumb} disabled={!!working} className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-300 hover:border-amber-500/50 disabled:opacity-50">{working === 'thumb' ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImageIcon className="h-3 w-3" />} Kapak Al</button>
        <button onClick={makeVertical} disabled={!!working} className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-300 hover:border-fuchsia-500/50 disabled:opacity-50">{working === 'vertical' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Smartphone className="h-3 w-3" />} 9:16 Yap</button>
        <button onClick={muteVideo} disabled={!!working} className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-300 hover:border-red-500/50 disabled:opacity-50">{working === 'mute' ? <Loader2 className="h-3 w-3 animate-spin" /> : <VolumeX className="h-3 w-3" />} Sesi Kaldir</button>
        <button onClick={() => setShowMusic((s) => !s)} disabled={!!working} className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-300 hover:border-emerald-500/50 disabled:opacity-50">{working === 'music' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Music className="h-3 w-3" />} Muzik Bindir</button>
        <button onClick={() => setShowText((s) => !s)} disabled={!!working} className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-300 hover:border-sky-500/50 disabled:opacity-50">{working === 'text' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Type className="h-3 w-3" />} Yazi</button>
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

      {showText && (
        <OverlayTextForm
          duration={r.duration || 0}
          currentTime={vidRef.current?.currentTime || 0}
          busy={!!working}
          onApply={async (payload) => {
            setWorking('text')
            try {
              const res = await api('/video/overlay-text', { method: 'POST', body: JSON.stringify({ file: r.file, ...payload }) })
              onNewResult?.({ ...res, label: 'Yazili' })
              setShowText(false)
              toast.success('Yazi bindirildi, sonuclara eklendi.')
            } catch (e) { toast.error(e.message) } finally { setWorking('') }
          }}
        />
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

function OverlayTextForm({ duration = 0, currentTime = 0, busy, onApply }) {
  const [text, setText] = useState('')
  const [start, setStart] = useState(0)
  const [end, setEnd] = useState(Number(duration || 0))
  const [position, setPosition] = useState('bottom')
  const [color, setColor] = useState('#ffffff')
  const [whole, setWhole] = useState(false)

  useEffect(() => {
    setEnd((e) => {
      const d = Number(duration || 0)
      if (!d) return e
      return e > d || e === 0 ? Number(d.toFixed(1)) : e
    })
  }, [duration])

  const apply = () => {
    if (!String(text).trim()) { toast.error('Once yazi yazin (ornek: Yaz kampanyasi)'); return }
    onApply?.({ text: text.trim(), start, end, position, color, whole })
  }

  return (
    <div className="mt-3 space-y-2">
      <p className="text-[11px] text-zinc-500">Bir sahneye reklam/kampanya yazisi. Sureyi slaytla secin veya tum videoya uygulayin.</p>
      <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ornek: Yaz bakiminda %20 / Ucretsiz kesif" className="border-zinc-800 bg-zinc-950 text-sm" />
      <label className="flex items-center gap-2 text-[11px] text-zinc-400">
        <input type="checkbox" checked={whole} onChange={(e) => setWhole(e.target.checked)} />
        Tum videoda goster
      </label>
      {!whole && (
        <>
          <div className="flex items-center justify-between text-[11px] text-zinc-400">
            <span>Baslangic {fmt(start)}</span>
            <button type="button" onClick={() => setStart(Number((currentTime || 0).toFixed(1)))} className="text-sky-300 underline">Oynatici konumu</button>
          </div>
          <input type="range" min="0" max={duration || 0} step="0.1" value={start} onChange={(e) => setStart(Number(e.target.value))} className="w-full accent-sky-500" />
          <div className="flex items-center justify-between text-[11px] text-zinc-400">
            <span>Bitis {fmt(end)}</span>
            <button type="button" onClick={() => setEnd(Number((currentTime || 0).toFixed(1)))} className="text-sky-300 underline">Oynatici konumu</button>
          </div>
          <input type="range" min="0" max={duration || 0} step="0.1" value={end} onChange={(e) => setEnd(Number(e.target.value))} className="w-full accent-emerald-500" />
        </>
      )}
      <div className="flex flex-wrap gap-1.5">
        {[['top', 'Ust'], ['center', 'Orta'], ['bottom', 'Alt']].map(([id, label]) => (
          <button key={id} type="button" onClick={() => setPosition(id)} className={`rounded-md border px-2 py-1 text-[11px] ${position === id ? 'border-sky-500 bg-sky-500/15 text-sky-200' : 'border-zinc-700 text-zinc-400'}`}>{label}</button>
        ))}
        <label className="ml-auto flex items-center gap-1 text-[11px] text-zinc-400">Renk<input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-6 w-8 rounded border-0 bg-transparent" /></label>
      </div>
      <Button type="button" onClick={apply} disabled={busy} className="w-full bg-sky-600 hover:bg-sky-500">{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Type className="mr-2 h-4 w-4" />} Yaziyi Videoya Bindir</Button>
    </div>
  )
}
