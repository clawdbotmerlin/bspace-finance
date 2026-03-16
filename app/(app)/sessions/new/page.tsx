'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Upload, CheckCircle2, AlertCircle, ArrowLeft, FileSpreadsheet,
  Loader2, Eye, Sparkles, Plus, X,
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
  blockType: string
  outlet: { name: string; code: string }
}

interface SessionPair { reg: Session; ev: Session }

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

interface MatchResult {
  reg: MatchStats
  ev: MatchStats | null   // null when EV had no cashier entries
}

interface UploadedBank {
  bankName: string
  count: number
}

interface SuggestState {
  status: 'idle' | 'analyzing' | 'ready' | 'saving' | 'saved'
  configId: string | null
  editedJson: string
  error: string
}

interface BankUploadRow {
  id: string
  bankName: string
  file: File | null
  uploading: boolean
  error: string
  suggest: SuggestState | null
}

export default function NewSessionPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [outlets, setOutlets] = useState<Outlet[]>([])
  const [bankConfigs, setBankConfigs] = useState<BankConfig[]>([])
  const [outletId, setOutletId] = useState('')
  const [sessionDate, setSessionDate] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [sessions, setSessions] = useState<SessionPair | null>(null)

  // Step 2 – cashier upload
  const [cashierFile, setCashierFile] = useState<File | null>(null)
  const [cashierUploading, setCashierUploading] = useState(false)
  const [cashierResult, setCashierResult] = useState<CashierResult | null>(null)
  const [cashierError, setCashierError] = useState('')

  // Step 3 – bank mutation uploads (multi-row)
  const emptyRow = (): BankUploadRow => ({
    id: String(Date.now() + Math.random()),
    bankName: '', file: null, uploading: false, error: '', suggest: null,
  })
  const [bankRows, setBankRows] = useState<BankUploadRow[]>([emptyRow()])
  const [uploadedBanks, setUploadedBanks] = useState<UploadedBank[]>([])

  // Step 3 – matching
  const [matching, setMatching] = useState(false)
  const [matchError, setMatchError] = useState('')
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null)

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
      body: JSON.stringify({ outletId, sessionDate }),
    })
    setCreating(false)
    if (res.ok) {
      const data = await res.json()
      setSessions({ reg: data.reg, ev: data.ev })
      setStep(2)
    } else {
      const d = await res.json()
      setCreateError(d.error ?? 'Gagal membuat sesi.')
    }
  }

  async function handleCashierUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!cashierFile || !sessions) return
    setCashierError(''); setCashierResult(null); setCashierUploading(true)
    const fd = new FormData(); fd.append('file', cashierFile)
    // Upload to the REG session — the API internally populates both REG and EV
    const res = await fetch(`/api/sessions/${sessions.reg.id}/upload/cashier`, { method: 'POST', body: fd })
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

  function patchSuggest(id: string, patch: Partial<SuggestState>) {
    setBankRows((prev) => prev.map((r) =>
      r.id === id && r.suggest ? { ...r, suggest: { ...r.suggest, ...patch } } : r
    ))
  }

  async function doUploadBankRow(id: string) {
    const row = bankRows.find((r) => r.id === id)
    if (!row || !row.file || !row.bankName || !sessions) return
    updateRow(id, { uploading: true, error: '' })
    const fd = new FormData(); fd.append('file', row.file); fd.append('bankName', row.bankName)
    const res = await fetch(`/api/sessions/${sessions.reg.id}/upload/bankmutation`, { method: 'POST', body: fd })
    updateRow(id, { uploading: false })
    if (res.ok) {
      const data = await res.json()
      setUploadedBanks((prev) => {
        const existing = prev.find((b) => b.bankName === row.bankName)
        if (existing) return prev.map((b) => b.bankName === row.bankName ? { ...b, count: data.parsed } : b)
        return [...prev, { bankName: row.bankName, count: data.parsed }]
      })
      updateRow(id, {
        suggest: data.parsed === 0
          ? { status: 'idle', configId: null, editedJson: '', error: '' }
          : null,
      })
    } else {
      const d = await res.json()
      updateRow(id, { error: d.error ?? 'Gagal mengupload file.' })
    }
  }

  async function handleAnalyzeConfigRow(id: string) {
    const row = bankRows.find((r) => r.id === id)
    if (!row || !row.file || !row.bankName || !sessions) return
    patchSuggest(id, { status: 'analyzing', error: '' })
    const fd = new FormData(); fd.append('file', row.file); fd.append('bankName', row.bankName)
    const res = await fetch(`/api/sessions/${sessions.reg.id}/suggest-bank-config`, { method: 'POST', body: fd })
    if (res.ok) {
      const data = await res.json()
      patchSuggest(id, { status: 'ready', configId: data.configId, editedJson: JSON.stringify(data.suggestion, null, 2) })
    } else {
      const d = await res.json()
      patchSuggest(id, { status: 'idle', error: d.error ?? 'Gagal menganalisis file.' })
    }
  }

  async function handleSaveConfigRow(id: string) {
    const row = bankRows.find((r) => r.id === id)
    if (!row?.suggest?.configId || !row.suggest.editedJson) return
    patchSuggest(id, { status: 'saving', error: '' })
    let parsed: unknown
    try { parsed = JSON.parse(row.suggest.editedJson) } catch {
      patchSuggest(id, { status: 'ready', error: 'JSON tidak valid. Periksa kembali.' })
      return
    }
    const res = await fetch(`/api/bank-configs/${row.suggest.configId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed),
    })
    if (res.ok) {
      patchSuggest(id, { status: 'saved' })
    } else {
      const d = await res.json()
      patchSuggest(id, { status: 'ready', error: d.error ?? 'Gagal menyimpan konfigurasi.' })
    }
  }

  async function handleRunMatching() {
    if (!sessions) return
    setMatchError('')
    setMatching(true)

    const evHasEntries = cashierResult && cashierResult.ev.parsed > 0

    const [regRes, evRes] = await Promise.all([
      fetch(`/api/sessions/${sessions.reg.id}/run-matching`, { method: 'POST' }),
      evHasEntries
        ? fetch(`/api/sessions/${sessions.ev.id}/run-matching`, { method: 'POST' })
        : Promise.resolve(null),
    ])

    setMatching(false)

    if (!regRes.ok) {
      const d = await regRes.json()
      setMatchError(d.error ?? 'Gagal menjalankan rekonsiliasi.')
      return
    }

    const regData: MatchStats = await regRes.json()
    const evData: MatchStats | null = evRes && evRes.ok ? await evRes.json() : null
    setMatchResult({ reg: regData, ev: evData })
  }

  function reset() {
    setStep(1); setSessions(null)
    setCashierFile(null); setCashierResult(null); setCashierError('')
    setBankRows([emptyRow()]); setUploadedBanks([])
    setCreateError(''); setOutletId(''); setSessionDate('')
    setMatchResult(null); setMatchError('')
  }

  const sessionBadges = sessions && (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="font-medium">{sessions.reg.outlet.name}</Badge>
        <Badge variant="outline">
          {new Date(sessions.reg.sessionDate).toLocaleDateString('id-ID', {
            day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
          })}
        </Badge>
        <Badge className="bg-blue-100 text-blue-700 border-0">REG</Badge>
        <Badge className="bg-purple-100 text-purple-700 border-0">EV</Badge>
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
            {/* Blok selector removed — both REG and EV are created and detected automatically */}
            <p className="text-xs text-slate-400 -mt-1">
              Sesi REG dan EV akan dibuat otomatis berdasarkan isi file kasir.
            </p>
            {createError && <ErrorMsg msg={createError} />}
            <Button type="submit" disabled={creating || !outletId || !sessionDate} className="w-full">
              {creating ? 'Membuat...' : 'Buat Sesi →'}
            </Button>
          </form>
        </div>
      )}

      {/* ── Step 2: Cashier upload ─────────────────────────────────── */}
      {step === 2 && sessions && (
        <div className="space-y-4">
          {sessionBadges}
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
      {step === 3 && sessions && (
        <div className="space-y-4">
          {sessionBadges}

          {/* Upload rows */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
            <div>
              <h2 className="font-medium text-slate-700 mb-1">Upload Mutasi Bank</h2>
              <p className="text-xs text-slate-400">
                Tambahkan satu baris per bank — mutasi akan disalin otomatis ke sesi REG dan EV.
              </p>
            </div>

            <div className="space-y-3">
              {bankRows.map((row, idx) => {
                const uploaded = uploadedBanks.find((b) => b.bankName === row.bankName)
                const isDone = uploaded && !row.suggest
                return (
                  <div key={row.id} className="space-y-2">
                    {/* Row: bank select + file + upload btn + remove btn */}
                    <div className="flex items-start gap-2">
                      <div className="flex-shrink-0 w-32">
                        <Select
                          value={row.bankName}
                          onValueChange={(v) => updateRow(row.id, { bankName: v, suggest: null })}
                          disabled={!!isDone}
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
                        isDone ? 'border-green-300 bg-green-50' :
                        row.file ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300',
                      )}>
                        {isDone
                          ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                          : <FileSpreadsheet className="w-4 h-4 text-slate-400 shrink-0" />}
                        <span className={cn(
                          'truncate',
                          isDone ? 'text-green-700' : row.file ? 'text-blue-700 font-medium' : 'text-slate-400',
                        )}>
                          {isDone
                            ? `${uploaded!.count} mutasi`
                            : row.file ? row.file.name : 'Pilih file (.xlsx/.xls/.csv)'}
                        </span>
                        {!isDone && (
                          <input
                            type="file"
                            accept=".xlsx,.xls,.csv"
                            className="hidden"
                            onChange={(e) => updateRow(row.id, { file: e.target.files?.[0] ?? null, error: '', suggest: null })}
                          />
                        )}
                      </label>
                      <Button
                        type="button"
                        size="sm"
                        disabled={!row.file || !row.bankName || row.uploading || !!isDone}
                        onClick={() => doUploadBankRow(row.id)}
                        className="h-9 shrink-0 gap-1.5"
                      >
                        {row.uploading
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <Upload className="w-4 h-4" />}
                        {row.uploading ? 'Upload...' : isDone ? 'Terupload' : 'Upload'}
                      </Button>
                      {bankRows.length > 1 && !isDone && (
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

                    {/* AI Suggest card — appears when 0 mutations parsed */}
                    {row.suggest && row.file && row.bankName && (
                      <div className="ml-0 rounded-lg border border-amber-200 bg-amber-50/60 p-4 space-y-3">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-sm font-medium text-slate-700">
                              0 mutasi terdeteksi untuk {row.bankName}
                            </p>
                            <p className="text-xs text-slate-500 mt-0.5">
                              Format file mungkin berbeda. AI dapat menganalisis dan menyarankan konfigurasi kolom.
                            </p>
                          </div>
                        </div>

                        {row.suggest.status === 'idle' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleAnalyzeConfigRow(row.id)}
                            className="gap-2 border-amber-300 hover:bg-amber-100"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                            Analisis Format dengan AI
                          </Button>
                        )}

                        {row.suggest.status === 'analyzing' && (
                          <div className="flex items-center gap-2 text-sm text-slate-500">
                            <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                            Menganalisis dengan AI...
                          </div>
                        )}

                        {(row.suggest.status === 'ready' || row.suggest.status === 'saving' || row.suggest.status === 'saved') && (
                          <div className="space-y-2">
                            <Label className="text-xs text-slate-500">Konfigurasi Disarankan AI — edit jika perlu</Label>
                            <textarea
                              className="w-full font-mono text-xs border border-slate-200 rounded-lg p-3 bg-white resize-y min-h-[160px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                              value={row.suggest.editedJson}
                              onChange={(e) => patchSuggest(row.id, { editedJson: e.target.value })}
                              disabled={row.suggest.status !== 'ready'}
                              spellCheck={false}
                            />
                            {row.suggest.status === 'saved' ? (
                              <div className="flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                                <span className="text-sm text-green-700 flex-1">Konfigurasi disimpan.</span>
                                <Button size="sm" onClick={() => doUploadBankRow(row.id)} disabled={row.uploading} className="gap-1.5">
                                  <Upload className="w-3 h-3" />
                                  {row.uploading ? 'Mengupload...' : 'Coba Ulang'}
                                </Button>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                onClick={() => handleSaveConfigRow(row.id)}
                                disabled={row.suggest.status === 'saving'}
                                className="gap-1.5"
                              >
                                {row.suggest.status === 'saving'
                                  ? <><Loader2 className="w-3 h-3 animate-spin" /> Menyimpan...</>
                                  : 'Simpan Konfigurasi'}
                              </Button>
                            )}
                            {row.suggest.error && <ErrorMsg msg={row.suggest.error} />}
                          </div>
                        )}
                      </div>
                    )}

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
                  <MatchBlock label="REG — Jam Reguler" color="blue" stats={matchResult.reg} />
                  {matchResult.ev && (
                    <MatchBlock label="EV — Jam Event" color="purple" stats={matchResult.ev} />
                  )}
                  <Link href={`/sessions/${sessions.reg.id}/review`}>
                    <Button className="w-full gap-1.5">
                      <Eye className="w-4 h-4" />
                      Lihat Review REG
                    </Button>
                  </Link>
                  {matchResult.ev && (
                    <Link href={`/sessions/${sessions.ev.id}/review`}>
                      <Button variant="outline" className="w-full gap-1.5">
                        <Eye className="w-4 h-4" />
                        Lihat Review EV
                      </Button>
                    </Link>
                  )}
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
