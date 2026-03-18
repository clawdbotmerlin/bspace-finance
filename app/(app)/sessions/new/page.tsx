'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  Upload, CheckCircle2, AlertCircle, ArrowLeft, FileSpreadsheet,
  Loader2, Eye, Plus, X,
} from 'lucide-react'
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
  outlet: { name: string; code: string }
}

interface CashierResult {
  reg: { parsed: number }
  ev: { parsed: number }
  skipped: number
  errors: string[]
}

interface MatchStats {
  matched: number
  zeros: number
  missingInBank: number
  unexpectedBank: number
  amountMismatches: number
  discrepancies: number
}

interface UploadedBank {
  bankName: string
  count: number
}

interface BankUploadRow {
  id: string
  bankName: string
  files: File[]
  uploading: boolean
  error: string
}

function NewSessionPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [outlets, setOutlets] = useState<Outlet[]>([])
  const [bankConfigs, setBankConfigs] = useState<BankConfig[]>([])
  const [outletId, setOutletId] = useState('')
  const [sessionDate, setSessionDate] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [session, setSession] = useState<Session | null>(null)

  // Step 2 – cashier upload
  const [cashierFile, setCashierFile] = useState<File | null>(null)
  const [cashierUploading, setCashierUploading] = useState(false)
  const [cashierResult, setCashierResult] = useState<CashierResult | null>(null)
  const [cashierError, setCashierError] = useState('')

  const searchParams = useSearchParams()

  // Step 3 – bank mutation uploads (multi-row)
  const emptyRow = (): BankUploadRow => ({
    id: String(Date.now() + Math.random()),
    bankName: '', files: [], uploading: false, error: '',
  })
  const [bankRows, setBankRows] = useState<BankUploadRow[]>([emptyRow()])
  const [uploadedBanks, setUploadedBanks] = useState<UploadedBank[]>([])

  // Step 3 – matching
  const [matching, setMatching] = useState(false)
  const [matchError, setMatchError] = useState('')
  const [matchResult, setMatchResult] = useState<MatchStats | null>(null)

  useEffect(() => {
    fetch('/api/outlets').then((r) => r.json()).then(setOutlets)
    fetch('/api/bank-configs').then((r) => r.json()).then(setBankConfigs)
  }, [])

  // Resume an in-progress session from history
  useEffect(() => {
    const resumeId = searchParams.get('resumeId')
    if (!resumeId) return
    async function loadResume() {
      const res = await fetch(`/api/sessions/${resumeId}`)
      if (!res.ok) return
      const detail = await res.json()
      setSession(detail)
      const hasCashier = (detail._count?.cashierEntries ?? 0) > 0
      setStep(hasCashier ? 3 : 2)
    }
    loadResume()
  }, [searchParams])

  async function handleCreateSession(e: React.FormEvent) {
    e.preventDefault()
    setCreateError('')
    setCreating(true)
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outletId, sessionDate }),
    })
    setCreating(false)
    if (res.ok) {
      const data = await res.json()
      setSession(data.session)
      setStep(2)
    } else {
      const d = await res.json()
      setCreateError(d.error ?? 'Gagal membuat sesi.')
    }
  }

  async function handleCashierUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!cashierFile || !session) return
    setCashierError(''); setCashierResult(null); setCashierUploading(true)
    const fd = new FormData(); fd.append('file', cashierFile)
    const res = await fetch(`/api/sessions/${session.id}/upload/cashier`, { method: 'POST', body: fd })
    setCashierUploading(false)
    if (res.ok) {
      setCashierResult(await res.json())
    } else {
      const d = await res.json(); setCashierError(d.error ?? 'Gagal mengupload file.')
    }
  }

  function updateRow(id: string, patch: Partial<BankUploadRow>) {
    setBankRows((prev) => prev.map((r) => r.id === id ? { ...r, ...patch } : r))
  }

  async function doUploadBankRow(id: string) {
    const row = bankRows.find((r) => r.id === id)
    if (!row || !row.files.length || !row.bankName || !session) return
    updateRow(id, { uploading: true, error: '' })
    let totalParsed = 0
    for (let i = 0; i < row.files.length; i++) {
      const fd = new FormData()
      fd.append('file', row.files[i])
      fd.append('bankName', row.bankName)
      if (i > 0) fd.append('append', 'true')
      const res = await fetch(`/api/sessions/${session.id}/upload/bankmutation`, { method: 'POST', body: fd })
      if (!res.ok) {
        const d = await res.json()
        updateRow(id, { uploading: false, error: d.error ?? 'Gagal mengupload file.' })
        return
      }
      const data = await res.json()
      totalParsed += data.parsed
    }
    updateRow(id, { uploading: false })
    setUploadedBanks((prev) => {
      const existing = prev.find((b) => b.bankName === row.bankName)
      if (existing) return prev.map((b) => b.bankName === row.bankName ? { ...b, count: totalParsed } : b)
      return [...prev, { bankName: row.bankName, count: totalParsed }]
    })
  }

  async function handleRunMatching() {
    if (!session) return
    setMatchError('')
    setMatching(true)
    const res = await fetch(`/api/sessions/${session.id}/run-matching`, { method: 'POST' })
    setMatching(false)
    if (!res.ok) {
      const d = await res.json()
      setMatchError(d.error ?? 'Gagal menjalankan rekonsiliasi.')
      return
    }
    setMatchResult(await res.json())
  }

  function reset() {
    setStep(1); setSession(null)
    setCashierFile(null); setCashierResult(null); setCashierError('')
    setBankRows([emptyRow()]); setUploadedBanks([])
    setCreateError(''); setOutletId(''); setSessionDate('')
    setMatchResult(null); setMatchError('')
    window.history.replaceState({}, '', '/sessions/new')
  }

  const sessionBadge = session && (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="font-medium">{session.outlet.name}</Badge>
        <Badge variant="outline">
          {new Date(session.sessionDate).toLocaleDateString('id-ID', {
            day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
          })}
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
          {sessionBadge}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h2 className="font-medium text-slate-700 mb-1">Upload Laporan Kasir</h2>
            <p className="text-xs text-slate-400 mb-4">
              Upload satu file — blok REG dan EV akan dideteksi otomatis.
            </p>
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
                  <BlockResultRow reg={cashierResult.reg.parsed} ev={cashierResult.ev.parsed} skipped={cashierResult.skipped} />
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
          {sessionBadge}

          {/* Upload rows */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
            <div>
              <h2 className="font-medium text-slate-700 mb-1">Upload Mutasi Bank</h2>
              <p className="text-xs text-slate-400">
                Tambahkan satu baris per bank.
              </p>
            </div>

            <div className="space-y-3">
              {bankRows.map((row, idx) => {
                const uploaded = uploadedBanks.find((b) => b.bankName === row.bankName)
                return (
                  <div key={row.id} className="space-y-2">
                    <div className="flex items-start gap-2">
                      <div className="flex-shrink-0 w-32">
                        <Select
                          value={row.bankName}
                          onValueChange={(v) => updateRow(row.id, { bankName: v })}
                        >
                          <SelectTrigger className="h-9 text-sm">
                            <SelectValue placeholder="Bank..." />
                          </SelectTrigger>
                          <SelectContent>
                            {bankConfigs.map((b) => (
                              <SelectItem key={b.id} value={b.bankName}>{b.bankName}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <label className={cn(
                        'flex items-center gap-2 flex-1 min-w-0 border rounded-lg px-3 h-9 cursor-pointer transition-colors text-sm',
                        uploaded ? 'border-green-300 bg-green-50' :
                        row.files.length ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300',
                      )}>
                        {uploaded
                          ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                          : <FileSpreadsheet className="w-4 h-4 text-slate-400 shrink-0" />}
                        <span className={cn(
                          'truncate',
                          uploaded ? 'text-green-700' : row.files.length ? 'text-blue-700 font-medium' : 'text-slate-400',
                        )}>
                          {uploaded
                            ? `${uploaded.count} mutasi (${row.files.length || '?'} file)`
                            : row.files.length === 1
                              ? row.files[0].name
                              : row.files.length > 1
                                ? `${row.files.length} file dipilih`
                                : 'Pilih satu atau lebih file (.xlsx/.xls/.csv)'}
                        </span>
                        <input
                          type="file"
                          accept=".xlsx,.xls,.csv"
                          multiple
                          className="hidden"
                          onChange={(e) => updateRow(row.id, { files: Array.from(e.target.files ?? []), error: '' })}
                        />
                      </label>
                      <Button
                        type="button"
                        size="sm"
                        disabled={!row.files.length || !row.bankName || row.uploading}
                        onClick={() => doUploadBankRow(row.id)}
                        className="h-9 shrink-0 gap-1.5"
                      >
                        {row.uploading
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <Upload className="w-4 h-4" />}
                        {row.uploading ? 'Upload...' : 'Upload'}
                      </Button>
                      {bankRows.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-9 w-9 p-0 shrink-0 text-slate-400 hover:text-red-500"
                          onClick={() => setBankRows((prev) => prev.filter((r) => r.id !== row.id))}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>

                    {row.error && <ErrorMsg msg={row.error} />}

                    {idx < bankRows.length - 1 && <div className="border-t border-slate-100" />}
                  </div>
                )
              })}
            </div>

            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outline" onClick={reset} className="gap-1.5">
                <ArrowLeft className="w-4 h-4" /> Sesi Baru
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setBankRows((prev) => [...prev, emptyRow()])}
                className="gap-1.5 flex-1"
              >
                <Plus className="w-4 h-4" /> Tambah Bank
              </Button>
            </div>
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
                <div className="space-y-4">
                  <MatchBlock label="Hasil Rekonsiliasi" color="blue" stats={matchResult} />
                  <Link href={`/sessions/${session.id}/review`}>
                    <Button className="w-full gap-1.5">
                      <Eye className="w-4 h-4" />
                      Lihat Review
                    </Button>
                  </Link>
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

export default function Page() {
  return (
    <Suspense>
      <NewSessionPage />
    </Suspense>
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

function BlockResultRow({ reg, ev, skipped }: { reg: number; ev: number; skipped: number }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
          <p className="text-[11px] font-semibold text-blue-600 uppercase tracking-wide mb-1">REG</p>
          <p className="text-sm text-blue-800">
            <span className="font-semibold">{reg}</span> entri diimpor
          </p>
        </div>
        <div className="rounded-lg bg-purple-50 border border-purple-200 p-3">
          <p className="text-[11px] font-semibold text-purple-600 uppercase tracking-wide mb-1">EV</p>
          <p className="text-sm text-purple-800">
            <span className="font-semibold">{ev}</span> entri diimpor
          </p>
        </div>
      </div>
      {skipped > 0 && (
        <p className="text-xs text-slate-500 pl-1">{skipped} baris dilewati</p>
      )}
    </div>
  )
}

function MatchBlock({ label, color, stats }: {
  label: string
  color: 'blue' | 'purple'
  stats: MatchStats
}) {
  const accent = color === 'blue' ? 'text-blue-700' : 'text-purple-700'
  return (
    <div>
      <p className={cn('text-[11px] font-semibold uppercase tracking-wide mb-2', accent)}>{label}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
        <div className="flex items-center gap-1.5 text-green-700">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span><span className="font-semibold">{stats.matched}</span> entri cocok</span>
        </div>
        <div className="flex items-center gap-1.5 text-slate-500">
          <CheckCircle2 className="w-4 h-4 shrink-0 opacity-40" />
          <span><span className="font-semibold">{stats.zeros}</span> nol / skip</span>
        </div>
        <div className="flex items-center gap-1.5 text-red-600">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span><span className="font-semibold">{stats.missingInBank}</span> tidak ada di bank</span>
        </div>
        <div className="flex items-center gap-1.5 text-red-600">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span><span className="font-semibold">{stats.unexpectedBank}</span> tak terduga</span>
        </div>
        {stats.amountMismatches > 0 && (
          <div className="flex items-center gap-1.5 text-amber-600 col-span-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span><span className="font-semibold">{stats.amountMismatches}</span> selisih jumlah</span>
          </div>
        )}
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
