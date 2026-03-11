'use client'

import { useEffect, useState } from 'react'
import { Upload, CheckCircle2, AlertCircle, ArrowLeft, FileSpreadsheet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

interface Outlet { id: string; name: string; code: string }

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

export default function NewSessionPage() {
  const [step, setStep] = useState<1 | 2>(1)
  const [outlets, setOutlets] = useState<Outlet[]>([])
  const [outletId, setOutletId] = useState('')
  const [sessionDate, setSessionDate] = useState('')
  const [blockType, setBlockType] = useState('REG')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [session, setSession] = useState<Session | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null)
  const [uploadError, setUploadError] = useState('')

  useEffect(() => {
    fetch('/api/outlets')
      .then((r) => r.json())
      .then((data) => setOutlets(data))
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
    if (res.ok) {
      const data = await res.json()
      setSession(data)
      setStep(2)
    } else {
      const d = await res.json()
      setCreateError(d.error ?? 'Gagal membuat sesi.')
    }
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!file || !session) return
    setUploadError('')
    setUploadResult(null)
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch(`/api/sessions/${session.id}/upload/cashier`, { method: 'POST', body: fd })
    setUploading(false)
    if (res.ok) {
      setUploadResult(await res.json())
    } else {
      const d = await res.json()
      setUploadError(d.error ?? 'Gagal mengupload file.')
    }
  }

  function reset() {
    setStep(1)
    setSession(null)
    setFile(null)
    setUploadResult(null)
    setUploadError('')
    setCreateError('')
    setOutletId('')
    setSessionDate('')
    setBlockType('REG')
  }

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
        <StepDot n={2} active={step === 2} done={false} label="Upload Kasir" />
      </div>

      {step === 1 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h2 className="font-medium text-slate-700 mb-4">Detail Sesi</h2>
          <form onSubmit={handleCreateSession} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Outlet</Label>
              <Select value={outletId} onValueChange={setOutletId} required>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih outlet..." />
                </SelectTrigger>
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
              <Input
                type="date"
                value={sessionDate}
                onChange={(e) => setSessionDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Blok</Label>
              <Select value={blockType} onValueChange={setBlockType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="REG">REG — Jam Reguler</SelectItem>
                  <SelectItem value="EV">EV — Jam Event</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {createError && (
              <p className="text-sm text-red-600 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {createError}
              </p>
            )}
            <Button type="submit" disabled={creating || !outletId || !sessionDate} className="w-full">
              {creating ? 'Membuat...' : 'Buat Sesi →'}
            </Button>
          </form>
        </div>
      )}

      {step === 2 && session && (
        <div className="space-y-4">
          {/* Session info */}
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

          {/* Upload form */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h2 className="font-medium text-slate-700 mb-4">Upload Laporan Kasir</h2>
            <form onSubmit={handleUpload} className="space-y-4">
              <div className="space-y-1.5">
                <Label>File Excel Kasir <span className="text-slate-400 font-normal">(.xlsx / .xls)</span></Label>
                <label className={cn(
                  'flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-6 cursor-pointer transition-colors',
                  file ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-slate-300 bg-slate-50',
                )}>
                  <FileSpreadsheet className={cn('w-8 h-8', file ? 'text-blue-500' : 'text-slate-400')} />
                  {file ? (
                    <span className="text-sm font-medium text-blue-700">{file.name}</span>
                  ) : (
                    <span className="text-sm text-slate-500">Klik untuk pilih file atau drag &amp; drop</span>
                  )}
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={(e) => { setFile(e.target.files?.[0] ?? null); setUploadResult(null); setUploadError('') }}
                  />
                </label>
              </div>

              {uploadError && (
                <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3">
                  <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-700">{uploadError}</p>
                </div>
              )}

              {uploadResult && (
                <div className="space-y-2">
                  <div className="flex items-start gap-2 rounded-lg bg-green-50 border border-green-200 p-3">
                    <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                    <div className="text-sm text-green-800">
                      <span className="font-semibold">{uploadResult.parsed} entri</span> berhasil diimpor
                      {uploadResult.skipped > 0 && (
                        <span className="text-green-600">, {uploadResult.skipped} baris dilewati</span>
                      )}
                    </div>
                  </div>
                  {uploadResult.errors.length > 0 && (
                    <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-1">
                      {uploadResult.errors.map((err, i) => (
                        <p key={i} className="text-xs text-amber-800">{err}</p>
                      ))}
                    </div>
                  )}
                  <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                    <p className="text-xs text-slate-600 flex items-center gap-1.5">
                      <Upload className="w-3.5 h-3.5" />
                      Selanjutnya: upload mutasi bank untuk melanjutkan rekonsiliasi.
                    </p>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={reset} className="gap-1.5">
                  <ArrowLeft className="w-4 h-4" />
                  Sesi Baru
                </Button>
                <Button type="submit" disabled={!file || uploading} className="flex-1 gap-1.5">
                  <Upload className="w-4 h-4" />
                  {uploading ? 'Mengupload...' : 'Upload'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
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
