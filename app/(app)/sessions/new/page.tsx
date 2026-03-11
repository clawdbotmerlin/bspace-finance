'use client'

import { useEffect, useState } from 'react'
import { Upload, CheckCircle2, AlertCircle, ArrowLeft, FileSpreadsheet, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

interface Outlet { id: string; name: string; code: string }
interface BankConfig { id: string; bankName: string }

interface Session {
  id: string
  outletId: string
  sessionDate: string
  blockType: string
  outlet: { name: string; code: string }
}

interface UploadResult {
  parsed: number
  skipped: number
  errors: string[]
}

interface UploadedBank {
  bankName: string
  count: number
}

export default function NewSessionPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [outlets, setOutlets] = useState<Outlet[]>([])
  const [bankConfigs, setBankConfigs] = useState<BankConfig[]>([])
  const [outletId, setOutletId] = useState('')
  const [sessionDate, setSessionDate] = useState('')
  const [blockType, setBlockType] = useState('REG')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [session, setSession] = useState<Session | null>(null)

  // Step 2 – cashier upload
  const [cashierFile, setCashierFile] = useState<File | null>(null)
  const [cashierUploading, setCashierUploading] = useState(false)
  const [cashierResult, setCashierResult] = useState<UploadResult | null>(null)
  const [cashierError, setCashierError] = useState('')

  // Step 3 – bank mutation uploads
  const [bankName, setBankName] = useState('')
  const [bankFile, setBankFile] = useState<File | null>(null)
  const [bankUploading, setBankUploading] = useState(false)
  const [bankError, setBankError] = useState('')
  const [uploadedBanks, setUploadedBanks] = useState<UploadedBank[]>([])

  // Step 3 – matching
  const [matching, setMatching] = useState(false)
  const [matchError, setMatchError] = useState('')
  const [matchResult, setMatchResult] = useState<{
    matched: number; zeros: number; missingInBank: number
    unexpectedBank: number; amountMismatches: number; discrepancies: number
  } | null>(null)

  useEffect(() => {
    fetch('/api/outlets').then((r) => r.json()).then(setOutlets)
    fetch('/api/bank-configs').then((r) => r.json()).then(setBankConfigs)
  }, [])

  async function handleCreateSession(e: React.FormEvent) {
    e.preventDefault()
    setCreateError('')
    setCreating(true)
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outletId, sessionDate, blockType }),
    })
    setCreating(false)
    if (res.ok) { setSession(await res.json()); setStep(2) }
    else { const d = await res.json(); setCreateError(d.error ?? 'Gagal membuat sesi.') }
  }

  async function handleCashierUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!cashierFile || !session) return
    setCashierError(''); setCashierResult(null); setCashierUploading(true)
    const fd = new FormData(); fd.append('file', cashierFile)
    const res = await fetch(`/api/sessions/${session.id}/upload/cashier`, { method: 'POST', body: fd })
    setCashierUploading(false)
    if (res.ok) { setCashierResult(await res.json()) }
    else { const d = await res.json(); setCashierError(d.error ?? 'Gagal mengupload file.') }
  }

  async function handleBankUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!bankFile || !session || !bankName) return
    setBankError(''); setBankUploading(true)
    const fd = new FormData(); fd.append('file', bankFile); fd.append('bankName', bankName)
    const res = await fetch(`/api/sessions/${session.id}/upload/bankmutation`, { method: 'POST', body: fd })
    setBankUploading(false)
    if (res.ok) {
      const data: UploadResult = await res.json()
      setUploadedBanks((prev) => {
        const existing = prev.find((b) => b.bankName === bankName)
        if (existing) return prev.map((b) => b.bankName === bankName ? { ...b, count: data.parsed } : b)
        return [...prev, { bankName, count: data.parsed }]
      })
      setBankFile(null); setBankName('')
    } else {
      const d = await res.json(); setBankError(d.error ?? 'Gagal mengupload file.')
    }
  }

  async function handleRunMatching() {
    if (!session) return
    setMatchError('')
    setMatching(true)
    const res = await fetch(`/api/sessions/${session.id}/run-matching`, { method: 'POST' })
    setMatching(false)
    if (res.ok) { setMatchResult(await res.json()) }
    else { const d = await res.json(); setMatchError(d.error ?? 'Gagal menjalankan rekonsiliasi.') }
  }

  function reset() {
    setStep(1); setSession(null)
    setCashierFile(null); setCashierResult(null); setCashierError('')
    setBankFile(null); setBankName(''); setBankError(''); setUploadedBanks([])
    setCreateError(''); setOutletId(''); setSessionDate(''); setBlockType('REG')
    setMatchResult(null); setMatchError('')
  }

  const sessionBadges = session && (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="font-medium">{session.outlet.name}</Badge>
        <Badge variant="outline">
          {new Date(session.sessionDate).toLocaleDateString('id-ID', {
            day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
          })}
        </Badge>
        <Badge className={cn(session.blockType === 'REG' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700', 'border-0')}>
          {session.blockType}
        </Badge>
      </div>
    </div>
  )

  return (
    <div className="p-6 max-w-xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-800">Rekonsiliasi Baru</h1>
        <p className="text-sm text-slate-500 mt-0.5">Upload laporan kasir dan mutasi bank.</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6 text-sm">
        <StepDot n={1} active={step === 1} done={step > 1} label="Buat Sesi" />
        <div className="flex-1 h-px bg-slate-200" />
        <StepDot n={2} active={step === 2} done={step > 2} label="Upload Kasir" />
        <div className="flex-1 h-px bg-slate-200" />
        <StepDot n={3} active={step === 3} done={false} label="Upload Bank" />
      </div>

      {/* ── Step 1: Create session ─────────────────────────────────── */}
      {step === 1 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h2 className="font-medium text-slate-700 mb-4">Detail Sesi</h2>
          <form onSubmit={handleCreateSession} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Outlet</Label>
              <Select value={outletId} onValueChange={setOutletId} required>
                <SelectTrigger><SelectValue placeholder="Pilih outlet..." /></SelectTrigger>
                <SelectContent>
                  {outlets.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name} <span className="text-slate-400 ml-1">({o.code})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tanggal</Label>
              <Input type="date" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Blok</Label>
              <Select value={blockType} onValueChange={setBlockType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="REG">REG — Jam Reguler</SelectItem>
                  <SelectItem value="EV">EV — Jam Event</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {createError && <ErrorMsg msg={createError} />}
            <Button type="submit" disabled={creating || !outletId || !sessionDate} className="w-full">
              {creating ? 'Membuat...' : 'Buat Sesi →'}
            </Button>
          </form>
        </div>
      )}

      {/* ── Step 2: Cashier upload ─────────────────────────────────── */}
      {step === 2 && session && (
        <div className="space-y-4">
          {sessionBadges}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h2 className="font-medium text-slate-700 mb-4">Upload Laporan Kasir</h2>
            <form onSubmit={handleCashierUpload} className="space-y-4">
              <FileDrop
                file={cashierFile}
                accept=".xlsx,.xls"
                label="File Excel Kasir (.xlsx / .xls)"
                onChange={(f) => { setCashierFile(f); setCashierResult(null); setCashierError('') }}
              />
              {cashierError && <ErrorMsg msg={cashierError} />}
              {cashierResult && (
                <div className="space-y-2">
                  <SuccessRow parsed={cashierResult.parsed} skipped={cashierResult.skipped} />
                  <ErrorList errors={cashierResult.errors} />
                </div>
              )}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={reset} className="gap-1.5">
                  <ArrowLeft className="w-4 h-4" /> Sesi Baru
                </Button>
                <Button type="submit" disabled={!cashierFile || cashierUploading} className="flex-1 gap-1.5">
                  <Upload className="w-4 h-4" />
                  {cashierUploading ? 'Mengupload...' : 'Upload'}
                </Button>
              </div>
              {cashierResult && (
                <Button type="button" className="w-full" onClick={() => setStep(3)}>
                  Lanjutkan ke Upload Mutasi Bank →
                </Button>
              )}
            </form>
          </div>
        </div>
      )}

      {/* ── Step 3: Bank mutation uploads ─────────────────────────── */}
      {step === 3 && session && (
        <div className="space-y-4">
          {sessionBadges}

          {/* Uploaded banks list */}
          {uploadedBanks.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <p className="text-xs font-medium text-slate-500 mb-2 uppercase tracking-wide">Mutasi terupload</p>
              <div className="space-y-1.5">
                {uploadedBanks.map((b) => (
                  <div key={b.bankName} className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                    <span className="font-mono font-medium text-slate-700">{b.bankName}</span>
                    <span className="text-slate-400">—</span>
                    <span className="text-slate-600">{b.count} mutasi</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upload form */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h2 className="font-medium text-slate-700 mb-4">Upload Mutasi Bank</h2>
            <form onSubmit={handleBankUpload} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Bank</Label>
                <Select value={bankName} onValueChange={setBankName}>
                  <SelectTrigger><SelectValue placeholder="Pilih bank..." /></SelectTrigger>
                  <SelectContent>
                    {bankConfigs.map((b) => (
                      <SelectItem key={b.id} value={b.bankName}>{b.bankName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <FileDrop
                file={bankFile}
                accept=".xlsx,.xls,.csv"
                label="File Mutasi (.xlsx / .xls / .csv)"
                onChange={(f) => { setBankFile(f); setBankError('') }}
              />
              {bankError && <ErrorMsg msg={bankError} />}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={reset} className="gap-1.5">
                  <ArrowLeft className="w-4 h-4" /> Sesi Baru
                </Button>
                <Button type="submit" disabled={!bankFile || !bankName || bankUploading} className="flex-1 gap-1.5">
                  <Upload className="w-4 h-4" />
                  {bankUploading ? 'Mengupload...' : 'Upload Bank'}
                </Button>
              </div>
            </form>
          </div>

          {uploadedBanks.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-3">
              <div>
                <p className="text-sm font-medium text-slate-700">Rekonsiliasi Otomatis</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Upload selesai. Jalankan rekonsiliasi untuk mencocokkan data kasir dengan mutasi bank.
                </p>
              </div>
              {matchError && <ErrorMsg msg={matchError} />}
              {matchResult ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div className="flex items-center gap-1.5 text-green-700">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span><span className="font-semibold">{matchResult.matched}</span> entri cocok</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-500">
                      <CheckCircle2 className="w-4 h-4 shrink-0 opacity-40" />
                      <span><span className="font-semibold">{matchResult.zeros}</span> nol / skip</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-red-600">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span><span className="font-semibold">{matchResult.missingInBank}</span> tidak ada di bank</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-red-600">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span><span className="font-semibold">{matchResult.unexpectedBank}</span> tak terduga</span>
                    </div>
                    {matchResult.amountMismatches > 0 && (
                      <div className="flex items-center gap-1.5 text-amber-600 col-span-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span><span className="font-semibold">{matchResult.amountMismatches}</span> selisih jumlah</span>
                      </div>
                    )}
                  </div>
                  <Button variant="outline" size="sm" className="w-full" onClick={reset}>
                    Mulai Sesi Baru
                  </Button>
                </div>
              ) : (
                <Button className="w-full gap-2" onClick={handleRunMatching} disabled={matching}>
                  {matching
                    ? <><Loader2 className="w-4 h-4 animate-spin" />Memproses...</>
                    : 'Jalankan Rekonsiliasi'}
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function FileDrop({ file, accept, label, onChange }: {
  file: File | null
  accept: string
  label: string
  onChange: (f: File | null) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <label className={cn(
        'flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-6 cursor-pointer transition-colors',
        file ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-slate-300 bg-slate-50',
      )}>
        <FileSpreadsheet className={cn('w-8 h-8', file ? 'text-blue-500' : 'text-slate-400')} />
        {file
          ? <span className="text-sm font-medium text-blue-700">{file.name}</span>
          : <span className="text-sm text-slate-500">Klik untuk pilih file atau drag &amp; drop</span>}
        <input type="file" accept={accept} className="hidden"
          onChange={(e) => onChange(e.target.files?.[0] ?? null)} />
      </label>
    </div>
  )
}

function ErrorMsg({ msg }: { msg: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3">
      <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
      <p className="text-sm text-red-700">{msg}</p>
    </div>
  )
}

function SuccessRow({ parsed, skipped }: { parsed: number; skipped: number }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-green-50 border border-green-200 p-3">
      <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
      <div className="text-sm text-green-800">
        <span className="font-semibold">{parsed} entri</span> berhasil diimpor
        {skipped > 0 && <span className="text-green-600">, {skipped} baris dilewati</span>}
      </div>
    </div>
  )
}

function ErrorList({ errors }: { errors: string[] }) {
  if (!errors.length) return null
  return (
    <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-1">
      {errors.map((err, i) => <p key={i} className="text-xs text-amber-800">{err}</p>)}
    </div>
  )
}

function StepDot({ n, active, done, label }: { n: number; active: boolean; done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <div className={cn(
        'w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold',
        done ? 'bg-green-500 text-white' : active ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500',
      )}>
        {done ? '✓' : n}
      </div>
      <span className={cn('text-sm', active ? 'text-slate-800 font-medium' : 'text-slate-400')}>{label}</span>
    </div>
  )
}
