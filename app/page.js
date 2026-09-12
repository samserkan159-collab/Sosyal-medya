'use client'

import { useEffect, useState, useCallback } from 'react'
import { Toaster, toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog'
import {
  LayoutDashboard, ShieldCheck, Sparkles, Users, Settings2, Facebook, Instagram,
  Youtube, Copy, RefreshCw, Send, Plus, Zap, MessageSquare, CheckCircle2, XCircle,
  Bot, Cpu, Radio, Upload, Wand2, Phone, Globe, Info, TrendingUp, AlertTriangle,
} from 'lucide-react'

const MEDIA = [
  'https://images.unsplash.com/photo-1680798790180-540f147976d7?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMjV8MHwxfHNlYXJjaHwxfHxjcmFmdHNtYW4lMjB3b3Jrc2hvcHxlbnwwfHx8fDE3ODkyMzkxODd8MA&ixlib=rb-4.1.0&q=85',
  'https://images.unsplash.com/photo-1633419946251-6d8b5dd33170?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMjV8MHwxfHNlYXJjaHwzfHxjcmFmdHNtYW4lMjB3b3Jrc2hvcHxlbnwwfHx8fDE3ODkyMzkxODd8MA&ixlib=rb-4.1.0&q=85',
  'https://images.unsplash.com/photo-1768884919494-da73f9c71b70?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NTZ8MHwxfHNlYXJjaHw0fHxwcm9kdWN0JTIwc2hvd2Nhc2V8ZW58MHx8fHwxNzg5MjM5MTk1fDA&ixlib=rb-4.1.0&q=85',
]

const api = async (path, opts) => {
  const res = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || data.message || 'Istek basarisiz')
  return data
}

// ---------------- Health Gauge (SVG) ----------------
function HealthGauge({ score = 0, size = 160 }) {
  const r = size / 2 - 14
  const c = 2 * Math.PI * r
  const offset = c - (score / 100) * c
  const color = score >= 75 ? '#22c55e' : score >= 45 ? '#eab308' : '#ef4444'
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#27272a" strokeWidth="12" fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth="12" fill="none"
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold" style={{ color }}>{score}</span>
        <span className="text-xs text-zinc-500">/100 Saglik</span>
      </div>
    </div>
  )
}

const sevColor = { HIGH: 'bg-red-500/15 text-red-400 border-red-500/30', MEDIUM: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30', LOW: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30' }
const statusColor = { NEW: 'bg-blue-500/15 text-blue-400 border-blue-500/30', CONTACTED: 'bg-purple-500/15 text-purple-400 border-purple-500/30', QUALIFIED: 'bg-green-500/15 text-green-400 border-green-500/30', CLOSED: 'bg-zinc-600/20 text-zinc-400 border-zinc-600/30', LOST: 'bg-red-500/15 text-red-400 border-red-500/30' }

function IntPill({ ok, label }) {
  return (
    <div className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${ok ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-zinc-700 bg-zinc-800/50 text-zinc-500'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} />
      {label}
    </div>
  )
}

export default function App() {
  const [tab, setTab] = useState('overview')
  const [config, setConfig] = useState({ integrations: {}, permissions: [] })
  const [stats, setStats] = useState(null)
  const [pages, setPages] = useState([])
  const [pageId, setPageId] = useState('')
  const [leads, setLeads] = useState([])
  const [content, setContent] = useState([])

  const selectedPage = pages.find((p) => p.id === pageId)

  const refreshAll = useCallback(async () => {
    try {
      const [cfg, st, pg] = await Promise.all([api('/config'), api('/stats'), api('/pages')])
      setConfig(cfg); setStats(st); setPages(pg)
      if (!pageId && pg[0]) setPageId(pg[0].id)
    } catch (e) { console.error(e) }
  }, [pageId])

  useEffect(() => { refreshAll() }, []) // eslint-disable-line

  const loadLeads = async () => { try { setLeads(await api('/leads')) } catch (e) { toast.error(e.message) } }
  const loadContent = async () => { try { setContent(await api('/content')) } catch (e) { toast.error(e.message) } }

  useEffect(() => { if (tab === 'leads') loadLeads() }, [tab])

  const NAV = [
    { id: 'overview', label: 'Genel Bakis', icon: LayoutDashboard },
    { id: 'audit', label: 'FB Denetim', icon: ShieldCheck },
    { id: 'content', label: 'Icerik Fabrikasi', icon: Sparkles },
    { id: 'leads', label: 'Musteri Masasi', icon: Users },
    { id: 'settings', label: 'Ayarlar', icon: Settings2 },
  ]

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
      <Toaster theme="dark" position="top-right" richColors />
      <div className="flex">
        {/* Sidebar */}
        <aside className="fixed left-0 top-0 z-30 flex h-screen w-64 flex-col border-r border-zinc-800 bg-zinc-900/60 backdrop-blur">
          <div className="flex items-center gap-2.5 px-5 py-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-fuchsia-600 shadow-lg shadow-indigo-500/30">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold leading-none">Command Cockpit</p>
              <p className="mt-1 text-[11px] text-zinc-500">Otomasyon Motoru</p>
            </div>
          </div>
          <Separator className="bg-zinc-800" />
          <nav className="flex-1 space-y-1 px-3 py-4">
            {NAV.map((n) => {
              const Icon = n.icon
              const active = tab === n.id
              return (
                <button key={n.id} onClick={() => setTab(n.id)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all ${active ? 'bg-indigo-500/15 text-indigo-300 shadow-inner ring-1 ring-indigo-500/30' : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'}`}>
                  <Icon className="h-4 w-4" /> {n.label}
                </button>
              )
            })}
          </nav>
          <div className="space-y-2 px-4 py-4">
            <p className="text-[10px] uppercase tracking-wider text-zinc-600">Entegrasyonlar</p>
            <div className="flex flex-col gap-1.5">
              <IntPill ok={config.integrations?.ai} label="AI Motoru (GPT-4o)" />
              <IntPill ok={config.integrations?.meta} label="Meta Graph API" />
              <IntPill ok={config.integrations?.telegram} label="Telegram Bot" />
            </div>
          </div>
        </aside>

        {/* Main */}
        <main className="ml-64 w-full">
          <header className="sticky top-0 z-20 flex items-center justify-between border-b border-zinc-800 bg-zinc-950/80 px-8 py-4 backdrop-blur">
            <div>
              <h1 className="text-lg font-semibold">{NAV.find((n) => n.id === tab)?.label}</h1>
              <p className="text-xs text-zinc-500">Facebook Denetim · Comment-to-DM · Coklu Platform Dagitim</p>
            </div>
            <div className="flex items-center gap-3">
              {pages.length > 0 && (
                <select value={pageId} onChange={(e) => setPageId(e.target.value)}
                  className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-indigo-500">
                  {pages.map((p) => <option key={p.id} value={p.id}>{p.pageName}</option>)}
                </select>
              )}
              <Button variant="outline" size="sm" onClick={refreshAll} className="border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800">
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Yenile
              </Button>
            </div>
          </header>

          <div className="p-8">
            {tab === 'overview' && <Overview stats={stats} pages={pages} onSimulate={refreshAll} pageId={pageId} />}
            {tab === 'audit' && <AuditModule pages={pages} pageId={pageId} config={config} onPageAdded={refreshAll} />}
            {tab === 'content' && <ContentModule pageId={pageId} config={config} content={content} loadContent={loadContent} />}
            {tab === 'leads' && <LeadsModule leads={leads} reload={loadLeads} />}
            {tab === 'settings' && <SettingsModule page={selectedPage} reload={refreshAll} />}
          </div>
        </main>
      </div>
    </div>
  )
}

// ==================== OVERVIEW ====================
function Overview({ stats, pages, onSimulate, pageId }) {
  const [simMsg, setSimMsg] = useState('Merhaba, bu urunun fiyati ne kadar?')
  const [simUser, setSimUser] = useState('Ahmet Yilmaz')
  const [busy, setBusy] = useState(false)

  const runSim = async () => {
    setBusy(true)
    try {
      const r = await api('/simulate/comment', { method: 'POST', body: JSON.stringify({ pageId, message: simMsg, userName: simUser }) })
      const res = r.processed?.[0]
      if (res?.sentiment === 'PRICE_INQUIRY') {
        toast.success(`Motor tetiklendi! ${simUser} yakalandi. Yorum: ${res.replySent ? 'gonderildi' : 'atlandi'} · DM: ${res.dmSent ? 'gonderildi' : 'atlandi'}`)
      } else {
        toast.success('Yorum islendi ve Lead olarak kaydedildi.')
      }
      onSimulate()
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  const cards = [
    { label: 'Toplam Sayfa', value: stats?.totalPages ?? 0, icon: Facebook, color: 'text-blue-400' },
    { label: 'Yakalanan Musteri', value: stats?.totalLeads ?? 0, icon: Users, color: 'text-fuchsia-400' },
    { label: 'Fiyat Sorgusu', value: stats?.priceInquiries ?? 0, icon: MessageSquare, color: 'text-emerald-400' },
    { label: 'Yayinlanan Icerik', value: stats?.publishedPosts ?? 0, icon: Send, color: 'text-indigo-400' },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => {
          const Icon = c.icon
          return (
            <Card key={c.label} className="border-zinc-800 bg-zinc-900/70">
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <p className="text-xs text-zinc-500">{c.label}</p>
                  <p className="mt-1 text-3xl font-bold">{c.value}</p>
                </div>
                <Icon className={`h-8 w-8 ${c.color}`} />
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="border-zinc-800 bg-zinc-900/70 lg:col-span-1">
          <CardHeader><CardTitle className="text-base">Ortalama Sayfa Sagligi</CardTitle></CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            <HealthGauge score={stats?.avgHealth ?? 0} />
            <p className="text-center text-xs text-zinc-500">Tum sayfalarin denetim skoru ortalamasi</p>
          </CardContent>
        </Card>

        {/* Comment-to-DM motor test */}
        <Card className="border-indigo-500/30 bg-gradient-to-br from-zinc-900/80 to-indigo-950/30 lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Radio className="h-4 w-4 text-indigo-400" /> Comment-to-DM Motoru — Canli Test
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-zinc-400">Bir videoya gelen "fiyat" yorumunu simule edin. Motor; yorumu tarar, otomatik public yanit + Messenger DM tetikler, Telegram alarmi atar ve Lead olusturur.</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Input value={simUser} onChange={(e) => setSimUser(e.target.value)} placeholder="Kullanici adi" className="border-zinc-800 bg-zinc-950 sm:col-span-1" />
              <Input value={simMsg} onChange={(e) => setSimMsg(e.target.value)} placeholder="Yorum metni" className="border-zinc-800 bg-zinc-950 sm:col-span-2" />
            </div>
            <div className="flex flex-wrap gap-2">
              {['Fiyat nedir?', 'kaç tl acaba?', 'Katalog gonderir misiniz?', 'Guzel olmus'].map((s) => (
                <button key={s} onClick={() => setSimMsg(s)} className="rounded-full border border-zinc-700 bg-zinc-800/50 px-3 py-1 text-xs text-zinc-400 hover:border-indigo-500/50 hover:text-indigo-300">{s}</button>
              ))}
            </div>
            <Button onClick={runSim} disabled={busy} className="w-full bg-indigo-600 hover:bg-indigo-500">
              <Zap className="mr-2 h-4 w-4" /> {busy ? 'Motor calisiyor...' : 'Yorumu Simule Et & Motoru Tetikle'}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="border-zinc-800 bg-zinc-900/70">
        <CardHeader><CardTitle className="text-base">Son Yakalanan Musteriler</CardTitle></CardHeader>
        <CardContent>
          {stats?.recentLeads?.length ? (
            <div className="space-y-2">
              {stats.recentLeads.map((l) => (
                <div key={l.id} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/50 px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-xs font-medium">{(l.userName || '?').charAt(0)}</div>
                    <div>
                      <p className="text-sm font-medium">{l.userName}</p>
                      <p className="text-xs text-zinc-500">{l.userMessage?.slice(0, 60)}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className={l.sentiment === 'PRICE_INQUIRY' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-zinc-700 text-zinc-400'}>{l.sentiment}</Badge>
                </div>
              ))}
            </div>
          ) : <p className="py-6 text-center text-sm text-zinc-600">Henuz musteri yok. Yukaridaki motoru test edin.</p>}
        </CardContent>
      </Card>
    </div>
  )
}

// ==================== AUDIT ====================
function AuditModule({ pages, pageId, config, onPageAdded }) {
  const [report, setReport] = useState(null)
  const [busy, setBusy] = useState(false)
  const [vision, setVision] = useState(null)
  const [visionBusy, setVisionBusy] = useState(false)
  const callbackUrl = typeof window !== 'undefined' ? `${window.location.origin}/api/webhooks/meta` : '/api/webhooks/meta'

  const copy = (t) => { navigator.clipboard.writeText(t); toast.success('Kopyalandi') }

  const crawl = async () => {
    if (!pageId) { toast.error('Once bir sayfa ekleyin/secin'); return }
    setBusy(true)
    try { setReport(await api('/audit/crawl', { method: 'POST', body: JSON.stringify({ pageId }) })); toast.success('Denetim tamamlandi') }
    catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  const onVision = async (e) => {
    const file = e.target.files?.[0]; if (!file) return
    setVisionBusy(true)
    try {
      const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file) })
      setVision(await api('/audit/vision', { method: 'POST', body: JSON.stringify({ image: dataUrl }) }))
      toast.success('Gorsel analiz edildi')
    } catch (err) { toast.error(err.message) } finally { setVisionBusy(false) }
  }

  const fixField = async (field, value) => {
    try { await api('/audit/fix', { method: 'POST', body: JSON.stringify({ pageId, field, value }) }); toast.success(`${field} Facebook'a gonderildi`) }
    catch (e) { toast.error(e.message) }
  }

  return (
    <div className="space-y-6">
      {pages.length === 0 && <AddPageDialog onDone={onPageAdded} trigger={<Button className="bg-indigo-600 hover:bg-indigo-500"><Plus className="mr-2 h-4 w-4" /> Ilk Facebook Sayfani Ekle</Button>} />}

      {/* Meta Developer Guide */}
      <Card className="border-zinc-800 bg-zinc-900/70">
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Info className="h-4 w-4 text-indigo-400" /> Meta Developer Kurulum Rehberi</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Uygulama Turu</p>
              <Badge className="bg-indigo-500/15 text-indigo-300">Business</Badge>
              <p className="mt-3 mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Webhook Abonelikleri</p>
              <div className="flex gap-2"><Badge variant="outline" className="border-zinc-700 text-zinc-300">feed</Badge><Badge variant="outline" className="border-zinc-700 text-zinc-300">messages</Badge></div>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Zorunlu Izinler</p>
              <div className="flex flex-wrap gap-1.5">
                {(config.permissions || []).map((p) => <Badge key={p} variant="outline" className="border-zinc-700 font-mono text-[10px] text-zinc-400">{p}</Badge>)}
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
              <span className="text-xs text-zinc-500">Callback URL</span>
              <code className="flex-1 truncate text-xs text-emerald-400">{callbackUrl}</code>
              <Button size="sm" variant="ghost" onClick={() => copy(callbackUrl)} className="h-7 text-zinc-400"><Copy className="h-3.5 w-3.5" /></Button>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
              <span className="text-xs text-zinc-500">Verify Token</span>
              <code className="flex-1 truncate text-xs text-emerald-400">{config.integrations?.verifyToken || '—'}</code>
              <Button size="sm" variant="ghost" onClick={() => copy(config.integrations?.verifyToken || '')} className="h-7 text-zinc-400"><Copy className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Scanner */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="border-zinc-800 bg-zinc-900/70 lg:col-span-1">
          <CardHeader><CardTitle className="text-base">Otomatik Sayfa Tarayici</CardTitle></CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <HealthGauge score={report?.score ?? 0} />
            <Button onClick={crawl} disabled={busy} className="w-full bg-indigo-600 hover:bg-indigo-500">
              <RefreshCw className={`mr-2 h-4 w-4 ${busy ? 'animate-spin' : ''}`} /> {busy ? 'Taraniyor...' : 'Sayfayi Tara (Graph API)'}
            </Button>
            <AddPageDialog onDone={onPageAdded} trigger={<Button variant="outline" className="w-full border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-800"><Plus className="mr-2 h-4 w-4" /> Sayfa Ekle</Button>} />
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/70 lg:col-span-2">
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-4 w-4 text-yellow-400" /> Eksik Alanlar & Tek Tikla Onarim</CardTitle></CardHeader>
          <CardContent>
            {report?.missingFields?.length ? (
              <div className="space-y-2">
                {report.missingFields.map((m) => (
                  <div key={m.key} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/50 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className={sevColor[m.severity]}>{m.severity}</Badge>
                      <span className="text-sm">{m.title}</span>
                    </div>
                    {m.key === 'about' && report.aiSuggestions?.aboutText ? (
                      <Button size="sm" onClick={() => fixField('about', report.aiSuggestions.aboutText)} className="bg-emerald-600 text-xs hover:bg-emerald-500"><Wand2 className="mr-1 h-3 w-3" /> Meta'ya Gonder</Button>
                    ) : <span className="text-xs text-zinc-600">Manuel</span>}
                  </div>
                ))}
              </div>
            ) : report ? <p className="py-6 text-center text-sm text-emerald-400">Tebrikler! Eksik alan bulunamadi.</p> : <p className="py-6 text-center text-sm text-zinc-600">Denetim icin "Sayfayi Tara" butonuna basin.</p>}

            {report?.aiSuggestions?.aboutText && (
              <div className="mt-4 rounded-lg border border-indigo-500/20 bg-indigo-950/20 p-4">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-indigo-300"><Sparkles className="h-3.5 w-3.5" /> AI Onerileri</p>
                <p className="text-xs text-zinc-400"><b className="text-zinc-300">Bio:</b> {report.aiSuggestions.bio}</p>
                <p className="mt-1 text-xs text-zinc-400"><b className="text-zinc-300">Hakkinda:</b> {report.aiSuggestions.aboutText}</p>
                <p className="mt-1 text-xs text-zinc-400"><b className="text-zinc-300">Onerilen CTA:</b> {report.aiSuggestions.recommendedCta}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Vision */}
      <Card className="border-zinc-800 bg-zinc-900/70">
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Upload className="h-4 w-4 text-fuchsia-400" /> Ekran Goruntusu / OCR Vision Analizoru</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-zinc-700 bg-zinc-950/40 py-8 text-center hover:border-indigo-500/50">
            <Upload className="mb-2 h-6 w-6 text-zinc-500" />
            <span className="text-sm text-zinc-400">{visionBusy ? 'AI analiz ediyor...' : 'Sayfanin mobil ekran goruntusunu yukle'}</span>
            <input type="file" accept="image/*" onChange={onVision} className="hidden" disabled={visionBusy} />
          </label>
          {vision && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
                <p className="mb-2 text-xs font-semibold text-zinc-400">Denetim</p>
                <div className="space-y-1.5 text-xs">
                  <Chk ok={vision.pageNameVisible} label="Sayfa adi gorunur" />
                  <Chk ok={vision.profilePhotoOk} label="Profil fotografi uygun" />
                  <Chk ok={!vision.coverPhotoCropped} label="Kapak mobilde kesilmiyor" />
                  <Chk ok={vision.ctaButtonPresent} label="CTA butonu mevcut" />
                </div>
                <div className="mt-3 flex items-center gap-2"><span className="text-xs text-zinc-500">Mobil Skor:</span><Badge className="bg-indigo-500/15 text-indigo-300">{vision.score ?? 0}/100</Badge></div>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
                <p className="mb-2 text-xs font-semibold text-zinc-400">Oneriler</p>
                <ul className="space-y-1 text-xs text-zinc-400">
                  {(vision.recommendations || []).map((r, i) => <li key={i}>• {r}</li>)}
                  {(!vision.recommendations || !vision.recommendations.length) && <li className="text-zinc-600">Oneri yok</li>}
                </ul>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Chk({ ok, label }) {
  return <div className="flex items-center gap-2">{ok ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <XCircle className="h-3.5 w-3.5 text-red-400" />}<span className={ok ? 'text-zinc-300' : 'text-zinc-500'}>{label}</span></div>
}

function AddPageDialog({ onDone, trigger }) {
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ pageId: '', pageName: '', accessToken: '', whatsappNumber: '' })
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try { await api('/pages', { method: 'POST', body: JSON.stringify(f) }); toast.success('Sayfa eklendi'); setOpen(false); setF({ pageId: '', pageName: '', accessToken: '', whatsappNumber: '' }); onDone() }
    catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="border-zinc-800 bg-zinc-900 text-zinc-100">
        <DialogHeader><DialogTitle>Facebook Sayfasi Ekle</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Sayfa Adi" value={f.pageName} onChange={(e) => setF({ ...f, pageName: e.target.value })} className="border-zinc-800 bg-zinc-950" />
          <Input placeholder="Page ID" value={f.pageId} onChange={(e) => setF({ ...f, pageId: e.target.value })} className="border-zinc-800 bg-zinc-950" />
          <Input placeholder="Page Access Token (bos birakirsan .env kullanilir)" value={f.accessToken} onChange={(e) => setF({ ...f, accessToken: e.target.value })} className="border-zinc-800 bg-zinc-950" />
          <Input placeholder="WhatsApp Numarasi (905xxxxxxxxx)" value={f.whatsappNumber} onChange={(e) => setF({ ...f, whatsappNumber: e.target.value })} className="border-zinc-800 bg-zinc-950" />
        </div>
        <DialogFooter><Button onClick={save} disabled={busy} className="bg-indigo-600 hover:bg-indigo-500">{busy ? 'Kaydediliyor...' : 'Kaydet'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ==================== CONTENT ====================
function ContentModule({ pageId, content, loadContent }) {
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [preview, setPreview] = useState('facebook')

  useEffect(() => { loadContent() }, []) // eslint-disable-line

  const generate = async () => {
    if (!input.trim()) { toast.error('Bir metin veya video linki girin'); return }
    setBusy(true)
    try { const r = await api('/content/generate', { method: 'POST', body: JSON.stringify({ inputText: input, pageId }) }); setResult(r); loadContent(); toast.success('4 platform icerigi uretildi') }
    catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  const sendApproval = async () => {
    if (!result) return
    try { await api('/content/telegram-approval', { method: 'POST', body: JSON.stringify({ id: result.id }) }); toast.success("Telegram'a onaya gonderildi"); loadContent() }
    catch (e) { toast.error(e.message) }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      <div className="space-y-6 lg:col-span-3">
        <Card className="border-zinc-800 bg-zinc-900/70">
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Wand2 className="h-4 w-4 text-indigo-400" /> AI Varyasyon Motoru</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Textarea value={input} onChange={(e) => setInput(e.target.value)} rows={4} placeholder="Ham metin veya video linki girin... (or: 'Yeni ahsap masa modelimiz cikti, el yapimi, ceviz agacindan')" className="border-zinc-800 bg-zinc-950" />
            <Button onClick={generate} disabled={busy} className="w-full bg-indigo-600 hover:bg-indigo-500"><Sparkles className="mr-2 h-4 w-4" /> {busy ? 'Uretiliyor...' : '4 Platform Icin Uret'}</Button>
          </CardContent>
        </Card>

        {result && (
          <div className="space-y-3">
            <PlatformCard icon={Facebook} color="text-blue-400" title="Facebook" text={result.fbCaption} />
            <PlatformCard icon={Instagram} color="text-fuchsia-400" title="Instagram Reels" text={result.igCaption} />
            <PlatformCard icon={Youtube} color="text-red-400" title="YouTube Shorts" text={`${result.ytTitle}\n\n${result.ytDescription}`} />
            <PlatformCard icon={Sparkles} color="text-cyan-400" title="TikTok" text={result.tiktokCaption} />
            {result.hashtags?.length > 0 && <div className="flex flex-wrap gap-1.5">{result.hashtags.map((h, i) => <Badge key={i} variant="outline" className="border-indigo-500/30 bg-indigo-500/10 text-indigo-300">{h}</Badge>)}</div>}
            <Button onClick={sendApproval} className="w-full bg-gradient-to-r from-sky-500 to-indigo-600 hover:opacity-90"><Send className="mr-2 h-4 w-4" /> Telegram'a Onaya Gonder</Button>
          </div>
        )}
      </div>

      {/* Phone Simulator */}
      <div className="lg:col-span-2">
        <div className="sticky top-24 flex flex-col items-center gap-3">
          <div className="flex gap-2">
            {[{ id: 'facebook', icon: Facebook }, { id: 'instagram', icon: Instagram }, { id: 'youtube', icon: Youtube }].map((p) => {
              const Icon = p.icon
              return <button key={p.id} onClick={() => setPreview(p.id)} className={`flex h-9 w-9 items-center justify-center rounded-lg border transition ${preview === p.id ? 'border-indigo-500 bg-indigo-500/15 text-indigo-300' : 'border-zinc-800 bg-zinc-900 text-zinc-500'}`}><Icon className="h-4 w-4" /></button>
            })}
          </div>
          <PhoneMockup platform={preview} result={result} />
        </div>
      </div>
    </div>
  )
}

function PlatformCard({ icon: Icon, color, title, text }) {
  return (
    <Card className="border-zinc-800 bg-zinc-900/70">
      <CardContent className="p-4">
        <div className="mb-2 flex items-center gap-2"><Icon className={`h-4 w-4 ${color}`} /><span className="text-sm font-medium">{title}</span></div>
        <p className="whitespace-pre-wrap text-sm text-zinc-400">{text}</p>
      </CardContent>
    </Card>
  )
}

function PhoneMockup({ platform, result }) {
  const media = MEDIA[0]
  const caption = platform === 'facebook' ? result?.fbCaption : platform === 'instagram' ? result?.igCaption : result?.ytTitle
  return (
    <div className="relative h-[560px] w-[280px] rounded-[2.5rem] border-[10px] border-zinc-800 bg-black shadow-2xl shadow-black/60">
      <div className="absolute left-1/2 top-0 z-10 h-6 w-32 -translate-x-1/2 rounded-b-2xl bg-zinc-800" />
      <div className="h-full w-full overflow-hidden rounded-[1.8rem] bg-zinc-950">
        {/* header bar */}
        <div className={`flex items-center gap-2 px-3 py-3 ${platform === 'youtube' ? 'bg-black' : 'bg-zinc-900'}`}>
          <div className="h-7 w-7 rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-600" />
          <div className="flex-1"><div className="h-2 w-20 rounded bg-zinc-700" /><div className="mt-1 h-1.5 w-12 rounded bg-zinc-800" /></div>
          {platform === 'facebook' && <Facebook className="h-4 w-4 text-blue-500" />}
          {platform === 'instagram' && <Instagram className="h-4 w-4 text-fuchsia-500" />}
          {platform === 'youtube' && <Youtube className="h-4 w-4 text-red-500" />}
        </div>
        {/* media */}
        <div className="relative h-[300px] w-full">
          <img src={media} alt="preview" className="h-full w-full object-cover" />
          {(platform === 'instagram' || platform === 'youtube') && (
            <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/70 to-transparent p-3">
              <p className="text-xs text-white line-clamp-4">{caption || 'Uretilen icerik burada gorunecek...'}</p>
            </div>
          )}
        </div>
        {/* caption / actions */}
        {platform === 'facebook' && (
          <div className="p-3">
            <p className="text-xs text-zinc-300 line-clamp-6">{caption || 'Uretilen Facebook metni burada canli onizlenir. WhatsApp linki ve guven odakli cagri iceren metin gorunur.'}</p>
            <div className="mt-3 flex justify-around border-t border-zinc-800 pt-2 text-[10px] text-zinc-500"><span>👍 Begen</span><span>💬 Yorum</span><span>↗ Paylas</span></div>
          </div>
        )}
        {platform === 'youtube' && <div className="p-3"><p className="text-xs font-semibold text-white line-clamp-2">{result?.ytTitle || 'Video Basligi'}</p><p className="mt-1 text-[10px] text-zinc-500">Shorts · 12B goruntulenme</p></div>}
        {platform === 'instagram' && <div className="flex gap-4 p-3 text-[10px] text-zinc-400"><span>❤️ 1.2K</span><span>💬 84</span><span>➤ Paylas</span></div>}
      </div>
    </div>
  )
}

// ==================== LEADS ====================
function LeadsModule({ leads, reload }) {
  const setStatus = async (id, status) => {
    try { await api(`/leads/${id}`, { method: 'PUT', body: JSON.stringify({ status }) }); reload() } catch (e) { toast.error(e.message) }
  }
  return (
    <Card className="border-zinc-800 bg-zinc-900/70">
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4 text-fuchsia-400" /> Gelen Musteri / Lead Masasi</CardTitle></CardHeader>
      <CardContent>
        {leads.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                <th className="py-2 pr-4">Musteri</th><th className="py-2 pr-4">Mesaj</th><th className="py-2 pr-4">Platform</th><th className="py-2 pr-4">Bot Islemi</th><th className="py-2 pr-4">Durum</th><th className="py-2">Aksiyon</th>
              </tr></thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id} className="border-b border-zinc-800/60 hover:bg-zinc-800/30">
                    <td className="py-3 pr-4 font-medium">{l.userName}</td>
                    <td className="py-3 pr-4 text-zinc-400">{l.userMessage?.slice(0, 50)}</td>
                    <td className="py-3 pr-4"><Badge variant="outline" className="border-zinc-700 text-[10px] text-zinc-400">{l.platform}</Badge></td>
                    <td className="py-3 pr-4"><div className="flex gap-1">{l.replySent && <Badge className="bg-blue-500/15 text-[10px] text-blue-300">Yanit</Badge>}{l.dmSent && <Badge className="bg-emerald-500/15 text-[10px] text-emerald-300">DM</Badge>}{!l.replySent && !l.dmSent && <span className="text-xs text-zinc-600">—</span>}</div></td>
                    <td className="py-3 pr-4">
                      <select value={l.status} onChange={(e) => setStatus(l.id, e.target.value)} className={`rounded border px-2 py-1 text-xs ${statusColor[l.status] || 'border-zinc-700 text-zinc-400'}`}>
                        {['NEW', 'CONTACTED', 'QUALIFIED', 'CLOSED', 'LOST'].map((s) => <option key={s} value={s} className="bg-zinc-900 text-zinc-200">{s}</option>)}
                      </select>
                    </td>
                    <td className="py-3">
                      {l.whatsappNumber ? <a href={`https://wa.me/${(l.whatsappNumber || '').replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer"><Button size="sm" className="bg-green-600 text-xs hover:bg-green-500"><Phone className="mr-1 h-3 w-3" /> WhatsApp</Button></a> : <span className="text-xs text-zinc-600">No tel</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="py-10 text-center text-sm text-zinc-600">Henuz lead yok. "Genel Bakis" sekmesinden motoru test edin.</p>}
      </CardContent>
    </Card>
  )
}

// ==================== SETTINGS ====================
function SettingsModule({ page, reload }) {
  const [f, setF] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (page) setF({ commentTemplate: page.commentTemplate || '', dmTemplate: page.dmTemplate || '', whatsappNumber: page.whatsappNumber || '', autoReplyActive: page.autoReplyActive !== false }) }, [page])

  if (!page) return <Card className="border-zinc-800 bg-zinc-900/70"><CardContent className="py-10 text-center text-sm text-zinc-600">Ayarlari duzenlemek icin once "FB Denetim" sekmesinden bir sayfa ekleyin.</CardContent></Card>
  if (!f) return null

  const save = async () => {
    setBusy(true)
    try { await api(`/pages/${page.id}`, { method: 'PUT', body: JSON.stringify(f) }); toast.success('Ayarlar kaydedildi'); reload() }
    catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <Card className="border-zinc-800 bg-zinc-900/70">
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><MessageSquare className="h-4 w-4 text-indigo-400" /> Otomatik Yanit Sablonlari — {page.pageName}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
            <div><p className="text-sm font-medium">Otomatik Yanit Motoru</p><p className="text-xs text-zinc-500">Fiyat yorumlarina otomatik public + DM yaniti</p></div>
            <Switch checked={f.autoReplyActive} onCheckedChange={(v) => setF({ ...f, autoReplyActive: v })} />
          </div>
          <div><label className="mb-1.5 block text-xs text-zinc-500">Public Yorum Sablonu</label><Textarea rows={3} value={f.commentTemplate} onChange={(e) => setF({ ...f, commentTemplate: e.target.value })} className="border-zinc-800 bg-zinc-950" /></div>
          <div><label className="mb-1.5 block text-xs text-zinc-500">Messenger DM Sablonu</label><Textarea rows={3} value={f.dmTemplate} onChange={(e) => setF({ ...f, dmTemplate: e.target.value })} className="border-zinc-800 bg-zinc-950" /></div>
          <div><label className="mb-1.5 block text-xs text-zinc-500">WhatsApp Numarasi</label><Input value={f.whatsappNumber} onChange={(e) => setF({ ...f, whatsappNumber: e.target.value })} placeholder="905xxxxxxxxx" className="border-zinc-800 bg-zinc-950" /></div>
          <Button onClick={save} disabled={busy} className="bg-indigo-600 hover:bg-indigo-500">{busy ? 'Kaydediliyor...' : 'Ayarlari Kaydet'}</Button>
        </CardContent>
      </Card>
    </div>
  )
}
