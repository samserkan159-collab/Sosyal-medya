'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Zap, Loader2, Lock } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setErr('')
    setBusy(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Giris basarisiz')
      router.replace('/')
      router.refresh()
    } catch (e2) {
      setErr(e2.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 text-zinc-100">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(99,102,241,0.18),_transparent_55%)]" />
      <form onSubmit={submit} className="relative w-full max-w-sm space-y-5 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6 shadow-2xl shadow-indigo-950/40 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-fuchsia-600 shadow-lg shadow-indigo-500/30">
            <Zap className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold">ASM Cockpit</p>
            <p className="text-[11px] text-zinc-500">Panel sifresi</p>
          </div>
        </div>
        <div className="space-y-3">
          <label className="block text-[11px] uppercase tracking-wider text-zinc-500">Sifre</label>
          <Input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border-zinc-800 bg-zinc-950"
            required
          />
        </div>
        {err && <p className="text-xs text-red-400">{err}</p>}
        <Button type="submit" disabled={busy} className="w-full bg-indigo-600 hover:bg-indigo-500">
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
          Giris yap
        </Button>
      </form>
    </div>
  )
}
