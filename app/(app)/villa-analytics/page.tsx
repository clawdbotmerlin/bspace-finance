'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { BarChart3, Upload, Download, X, FileText, AlertCircle, CheckCircle2, Loader2, Search, Calendar, ChevronDown, Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'

// ─── Types ────────────────────────────────────────────────────────────────────

interface VillaHost {
  id: string
  name: string
  isActive: boolean
  _count?: { bookings: number }
}

interface VillaBooking {
  id: string
  status: string
  checkIn: string
  checkOut: string
  source: string
  accommodationFare: string
  totalPayout: string
  listing: string
  listingId: string
  guestName: string
  numberOfNights: number
  numberOfGuests: number
}

interface UploadResult {
  uploadId: string
  parsed: number
  created: number
  updated: number
  upserted: number
  skipped: number
  errors: string[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  })
}

function fmtIDR(n: string | number) {
  const v = typeof n === 'string' ? parseFloat(n) : n
  return new Intl.NumberFormat('id-ID', { style: 'decimal' }).format(v)
}

// YYYY-MM-DD of a local date
function toYMD(d: Date): string {
  return d.toLocaleDateString('en-CA') // returns YYYY-MM-DD
}

type Preset = 'today' | 'yesterday' | 'last7' | 'month' | 'lastmonth' | ''

function presetRange(p: Preset): { from: string; to: string } {
  const now = new Date()
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate()
  if (p === 'today')     { const t = new Date(y, m, d); return { from: toYMD(t), to: toYMD(t) } }
  if (p === 'yesterday') { const t = new Date(y, m, d - 1); return { from: toYMD(t), to: toYMD(t) } }
  if (p === 'last7')     { return { from: toYMD(new Date(y, m, d - 6)), to: toYMD(new Date(y, m, d)) } }
  if (p === 'month')     { return { from: toYMD(new Date(y, m, 1)), to: toYMD(new Date(y, m + 1, 0)) } }
  if (p === 'lastmonth') { return { from: toYMD(new Date(y, m - 1, 1)), to: toYMD(new Date(y, m, 0)) } }
  return { from: '', to: '' }
}

const PRESETS: { key: Preset; label: string }[] = [
  { key: 'today',     label: 'Hari ini' },
  { key: 'yesterday', label: 'Kemarin' },
  { key: 'last7',     label: '7 Hari Terakhir' },
  { key: 'month',     label: 'Bulan ini' },
  { key: 'lastmonth', label: 'Bulan lalu' },
]

function statusVariant(s: string): 'success' | 'warning' | 'outline' {
  if (s === 'confirmed') return 'success'
  if (s === 'inquiry') return 'warning'
  return 'outline'
}

// ─── Upload Modal ─────────────────────────────────────────────────────────────

function UploadModal({
  open,
  onClose,
  onSuccess,
  hosts,
}: {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  hosts: VillaHost[]
}) {
  const [file, setFile] = useState<File | null>(null)
  const [hostId, setHostId] = useState('')
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const activeHosts = hosts.filter((h) => h.isActive)

  // Pre-select if only one active host
  useEffect(() => {
    if (open && activeHosts.length === 1 && !hostId) {
      setHostId(activeHosts[0].id)
    }
  }, [open, activeHosts, hostId])

  function reset() {
    setFile(null)
    setHostId(activeHosts.length === 1 ? activeHosts[0].id : '')
    setResult(null)
    setError('')
    setUploading(false)
  }

  function handleClose() {
    reset()
    onClose()
  }

  function handleFile(f: File) {
    if (!f.name.endsWith('.csv')) {
      setError('Hanya file .csv yang diterima.')
      return
    }
    setError('')
    setResult(null)
    setFile(f)
  }

  async function handleUpload() {
    if (!file || !hostId) return
    setUploading(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('hostId', hostId)
      const res = await fetch('/api/villa/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Upload gagal.')
      } else {
        setResult(data)
        onSuccess()
      }
    } catch {
      setError('Terjadi kesalahan jaringan.')
    } finally {
      setUploading(false)
    }
  }

  const selectedHost = activeHosts.find((h) => h.id === hostId)

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Upload className="w-4 h-4 text-emerald-600" />
            Upload Guesty CSV
          </DialogTitle>
        </DialogHeader>

        {result ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-emerald-50 border border-emerald-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-emerald-800">Upload berhasil</p>
                {selectedHost && (
                  <p className="text-xs text-emerald-700 mt-0.5">Host: <span className="font-semibold">{selectedHost.name}</span></p>
                )}
                <p className="text-xs text-emerald-700 mt-1">
                  <span className="font-semibold">{result.created}</span> booking baru ditambahkan
                </p>
                {result.updated > 0 && (
                  <p className="text-xs text-emerald-600 mt-0.5">
                    <span className="font-semibold">{result.updated}</span> sudah ada — diperbarui, tidak duplikat
                  </p>
                )}
                {result.skipped > 0 && (
                  <p className="text-xs text-amber-600 mt-0.5">
                    {result.skipped} baris dilewati
                  </p>
                )}
              </div>
            </div>
            {result.errors.length > 0 && (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                <p className="text-xs font-semibold text-amber-800 mb-1">Peringatan ({result.errors.length})</p>
                <ul className="text-xs text-amber-700 space-y-0.5 max-h-28 overflow-y-auto">
                  {result.errors.map((e, i) => <li key={i}>• {e}</li>)}
                </ul>
              </div>
            )}
            <Button className="w-full" onClick={handleClose}>Tutup</Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Host selector */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Host <span className="text-red-500">*</span>
              </label>
              {activeHosts.length === 0 ? (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  Belum ada host aktif. Tambahkan di halaman Kelola Host.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {activeHosts.map((h) => (
                    <button
                      key={h.id}
                      onClick={() => setHostId(h.id)}
                      className={cn(
                        'px-3 py-2 rounded-lg border text-sm font-medium transition-colors text-left',
                        hostId === h.id
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:bg-slate-50'
                      )}
                    >
                      {h.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Drop zone */}
            <div
              className={cn(
                'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors',
                dragging ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 hover:border-emerald-300 hover:bg-slate-50',
                file ? 'border-emerald-400 bg-emerald-50' : ''
              )}
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragging(false)
                const f = e.dataTransfer.files[0]
                if (f) handleFile(f)
              }}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
              />
              {file ? (
                <div className="flex items-center justify-center gap-2">
                  <FileText className="w-5 h-5 text-emerald-600" />
                  <span className="text-sm font-medium text-emerald-800">{file.name}</span>
                  <button
                    className="p-0.5 rounded hover:bg-emerald-100"
                    onClick={(e) => { e.stopPropagation(); setFile(null) }}
                  >
                    <X className="w-3.5 h-3.5 text-emerald-600" />
                  </button>
                </div>
              ) : (
                <>
                  <Upload className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">
                    Drag &amp; drop file CSV di sini, atau <span className="text-emerald-600 font-medium">pilih file</span>
                  </p>
                  <p className="text-xs text-slate-400 mt-1">Hanya .csv (Guesty export)</p>
                </>
              )}
            </div>

            {error && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={handleClose} disabled={uploading}>
                Batal
              </Button>
              <Button
                className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                disabled={!file || !hostId || uploading}
                onClick={handleUpload}
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {uploading ? 'Mengupload…' : 'Upload & Simpan'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function VillaAnalyticsPage() {
  const [hosts, setHosts] = useState<VillaHost[]>([])
  const [bookings, setBookings] = useState<VillaBooking[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [filterListing, setFilterListing] = useState('')
  const [filterHostId, setFilterHostId] = useState('')
  const [activePreset, setActivePreset] = useState<Preset>('')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportingSummary, setExportingSummary] = useState(false)
  const [exportingTable, setExportingTable] = useState(false)

  useEffect(() => {
    fetch('/api/villa/hosts')
      .then((r) => r.json())
      .then(setHosts)
      .catch(() => {})
  }, [])

  const fetchBookings = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (filterFrom)   params.set('from', filterFrom)
      if (filterTo)     params.set('to', filterTo)
      if (filterListing) params.set('listing', filterListing)
      if (filterHostId) params.set('hostId', filterHostId)
      const res = await fetch(`/api/villa/bookings?${params}`)
      if (!res.ok) throw new Error('Gagal memuat data.')
      setBookings(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Terjadi kesalahan.')
    } finally {
      setLoading(false)
    }
  }, [filterFrom, filterTo, filterListing, filterHostId])

  useEffect(() => {
    const t = setTimeout(fetchBookings, filterListing ? 300 : 0)
    return () => clearTimeout(t)
  }, [fetchBookings])

  function buildParams() {
    const params = new URLSearchParams()
    if (filterFrom)   params.set('from', filterFrom)
    if (filterTo)     params.set('to', filterTo)
    if (filterListing) params.set('listing', filterListing)
    if (filterHostId) params.set('hostId', filterHostId)
    return params
  }

  async function handleExport() {
    setExporting(true)
    try {
      const res = await fetch(`/api/villa/bookings/export?${buildParams()}`)
      if (!res.ok) { const d = await res.json(); alert(d.error ?? 'Export gagal.'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ?? 'villa-report.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  async function handleTableExport() {
    setExportingTable(true)
    try {
      const res = await fetch(`/api/villa/bookings/table-export?${buildParams()}`)
      if (!res.ok) { const d = await res.json(); alert(d.error ?? 'Export gagal.'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ?? 'data-booking.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExportingTable(false)
    }
  }

  async function handleSummaryExport() {
    setExportingSummary(true)
    try {
      const res = await fetch(`/api/villa/bookings/summary-report?${buildParams()}`)
      if (!res.ok) { const d = await res.json(); alert(d.error ?? 'Export gagal.'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ?? 'laporan-mingguan.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExportingSummary(false)
    }
  }

  function applyPreset(p: Preset) {
    const { from, to } = presetRange(p)
    setFilterFrom(from)
    setFilterTo(to)
    setActivePreset(p)
  }

  function resetFilters() {
    setFilterFrom('')
    setFilterTo('')
    setFilterListing('')
    setFilterHostId('')
    setActivePreset('')
  }

  const uniqueListings = Array.from(new Set(bookings.map((b) => b.listing))).sort()

  async function handleExportListing(listing: string) {
    const params = buildParams()
    params.set('listing', listing)
    const res = await fetch(`/api/villa/bookings/export?${params}`)
    if (!res.ok) { alert('Export gagal.'); return }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ?? 'villa-report.xlsx'
    a.click()
    URL.revokeObjectURL(url)
  }

  const confirmedCount = bookings.filter((b) => b.status === 'confirmed').length
  const totalGross = bookings.reduce((s, b) => s + parseFloat(b.accommodationFare), 0)
  const totalPayout = bookings.reduce((s, b) => s + parseFloat(b.totalPayout), 0)

  const selectedHostName = hosts.find((h) => h.id === filterHostId)?.name

  const hasFilters = filterFrom || filterTo || filterListing || filterHostId

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-800">Villa Report Analytics</h1>
            <p className="text-sm text-slate-500 mt-0.5">Data booking Guesty — upload harian &amp; laporan keuangan</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={bookings.length === 0 || exportingTable}
            onClick={handleTableExport}
          >
            {exportingTable ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            Export Tabel
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={bookings.length === 0 || exportingSummary}
            onClick={handleSummaryExport}
          >
            {exportingSummary ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            Laporan Mingguan
          </Button>
          <Button
            size="sm"
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
            onClick={() => setUploadOpen(true)}
          >
            <Upload className="w-3.5 h-3.5" />
            Upload CSV
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      {!loading && bookings.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total Booking', value: bookings.length, sub: `${confirmedCount} confirmed` },
            { label: 'Listing Unik', value: uniqueListings.length, sub: 'dalam filter ini' },
            { label: 'Gross Revenue', value: `Rp ${fmtIDR(totalGross)}`, sub: 'Accommodation Fare' },
            { label: 'Total Payout', value: `Rp ${fmtIDR(totalPayout)}`, sub: 'Setelah biaya OTA' },
          ].map((c) => (
            <div key={c.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{c.label}</p>
              <p className="text-xl font-bold text-slate-800 leading-none">{c.value}</p>
              <p className="text-xs text-slate-400 mt-1">{c.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 space-y-3 shadow-sm">
        {/* Quick presets */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-500 mr-1">Cepat:</span>
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => applyPreset(p.key)}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium transition-colors border',
                activePreset === p.key
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-400 hover:text-emerald-700'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Date range + listing search + host filter */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Host filter */}
          {hosts.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    'gap-1.5 h-8 text-xs',
                    filterHostId ? 'border-emerald-400 text-emerald-700 bg-emerald-50' : ''
                  )}
                >
                  <Building2 className="w-3.5 h-3.5" />
                  {selectedHostName ?? 'Semua Host'}
                  <ChevronDown className="w-3 h-3 ml-0.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[180px]">
                <DropdownMenuItem
                  onClick={() => setFilterHostId('')}
                  className={cn('text-xs cursor-pointer', !filterHostId && 'font-semibold text-emerald-700')}
                >
                  Semua Host
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {hosts.map((h) => (
                  <DropdownMenuItem
                    key={h.id}
                    onClick={() => setFilterHostId(h.id)}
                    className={cn('text-xs cursor-pointer', filterHostId === h.id && 'font-semibold text-emerald-700')}
                  >
                    {h.name}
                    {!h.isActive && <span className="ml-1 text-slate-400">(nonaktif)</span>}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Calendar className="w-3.5 h-3.5" />
            Check-in dari
          </div>
          <Input
            type="date"
            value={filterFrom}
            onChange={(e) => { setFilterFrom(e.target.value); setActivePreset('') }}
            className="h-8 text-xs w-36"
          />
          <span className="text-xs text-slate-400">s/d</span>
          <Input
            type="date"
            value={filterTo}
            onChange={(e) => { setFilterTo(e.target.value); setActivePreset('') }}
            className="h-8 text-xs w-36"
          />
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <Input
              placeholder="Cari listing…"
              value={filterListing}
              onChange={(e) => setFilterListing(e.target.value)}
              className="h-8 text-xs pl-8 w-52"
            />
          </div>
          {hasFilters && (
            <button
              onClick={resetFilters}
              className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1"
            >
              <X className="w-3 h-3" /> Reset
            </button>
          )}

          {/* Per-listing export dropdown */}
          {uniqueListings.length > 0 && (
            <div className="ml-auto">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs">
                    <Download className="w-3.5 h-3.5" />
                    Detail per Listing
                    <ChevronDown className="w-3 h-3 ml-0.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto min-w-[280px]">
                  <div className="px-2 py-1.5 border-b">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                      {uniqueListings.length} listing dalam filter ini
                    </p>
                  </div>
                  {uniqueListings.map((l) => (
                    <DropdownMenuItem
                      key={l}
                      onClick={() => handleExportListing(l)}
                      className="gap-2 cursor-pointer text-xs"
                    >
                      <Download className="w-3 h-3 text-emerald-600 shrink-0" />
                      <span className="truncate">{l}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 mb-4">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Memuat data…</span>
          </div>
        ) : bookings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <BarChart3 className="w-10 h-10 mb-2 opacity-20" />
            <p className="text-sm">Belum ada data booking.</p>
            <p className="text-xs mt-1 text-slate-400">Upload file CSV Guesty untuk memulai.</p>
            <Button
              size="sm"
              className="mt-4 gap-1.5 bg-emerald-600 hover:bg-emerald-700"
              onClick={() => setUploadOpen(true)}
            >
              <Upload className="w-3.5 h-3.5" /> Upload Sekarang
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {['Check-in', 'Check-out', 'Tamu', 'Listing', 'Malam', 'OTA', 'Gross (IDR)', 'Payout (IDR)', 'Status'].map((h) => (
                    <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bookings.map((b) => (
                  <tr key={b.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70 transition-colors">
                    <td className="px-3 py-2.5 text-xs font-medium text-slate-700 whitespace-nowrap">
                      {fmtDate(b.checkIn)}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                      {fmtDate(b.checkOut)}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-700 max-w-[140px] truncate">
                      {b.guestName || '—'}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-600 max-w-[200px]">
                      <span className="line-clamp-2 leading-tight">{b.listing}</span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-center text-slate-600">
                      {b.numberOfNights}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-600 uppercase whitespace-nowrap">
                      {b.source}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-right font-medium text-slate-700 whitespace-nowrap">
                      {fmtIDR(b.accommodationFare)}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-right text-slate-600 whitespace-nowrap">
                      {fmtIDR(b.totalPayout)}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge variant={statusVariant(b.status)} className="text-[10px] capitalize">
                        {b.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Row count */}
      {!loading && bookings.length > 0 && (
        <p className="text-xs text-slate-400 mt-2 text-right">
          {bookings.length} booking ditampilkan
        </p>
      )}

      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onSuccess={fetchBookings}
        hosts={hosts}
      />
    </div>
  )
}
