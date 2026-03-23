'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  AlertTriangle, ChevronLeft, ChevronRight, RotateCcw,
  Loader2, CheckCircle2, Clock, CircleDot, EyeOff,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { cn, formatRupiah } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────────────────────────

interface DiscrepancySession {
  id: string
  sessionDate: string
  status: string
  outlet: { id: string; name: string; code: string }
}

interface DiscrepancyRow {
  id: string
  sessionId: string
  discrepancyType: string
  amountDiff: string | null
  status: string
  resolutionNotes: string | null
  session: DiscrepancySession
  cashierEntry: {
    bankName: string
    terminalCode: string | null
    terminalId: string | null
    paymentType: string
    amount: string
    entityNameRaw: string | null
  } | null
  bankMutation: {
    bankName: string
    accountNumber: string | null
    grossAmount: string
    description: string | null
    referenceNo: string | null
  } | null
}

interface DiscrepancyResponse {
  discrepancies: DiscrepancyRow[]
  total: number
  page: number
  pages: number
  limit: number
  summary: { open: number; investigating: number; resolved: number; ignored: number }
}

interface OutletOption {
  id: string
  name: string
  code: string
}

// ─── Constants ───────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  missing_in_bank:        'Tidak Ada di Bank',
  unexpected_bank_entry:  'Tidak Terduga',
  amount_mismatch:        'Selisih Jumlah',
  prior_period_settlement: 'Cicilan Periode Lalu',
  duplicate:              'Duplikat',
}

const TYPE_BADGE_COLOR: Record<string, string> = {
  missing_in_bank:        'bg-red-100 text-red-700',
  unexpected_bank_entry:  'bg-orange-100 text-orange-700',
  amount_mismatch:        'bg-amber-100 text-amber-700',
  prior_period_settlement: 'bg-purple-100 text-purple-700',
  duplicate:              'bg-slate-100 text-slate-700',
}

const STATUS_LABELS: Record<string, string> = {
  open:         'Terbuka',
  investigating: 'Investigasi',
  resolved:     'Selesai',
  ignored:      'Diabaikan',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  if (status === 'ignored') {
    return (
      <Badge variant="outline" className="text-[11px] whitespace-nowrap text-slate-400 border-slate-200">
        <EyeOff className="w-3 h-3 mr-1" />Diabaikan
      </Badge>
    )
  }
  const map: Record<string, 'destructive' | 'warning' | 'success'> = {
    open: 'destructive', investigating: 'warning', resolved: 'success',
  }
  return (
    <Badge variant={map[status] ?? 'outline'} className="text-[11px] whitespace-nowrap">
      {STATUS_LABELS[status] ?? status}
    </Badge>
  )
}

function typeBadge(type: string) {
  const color = TYPE_BADGE_COLOR[type] ?? 'bg-slate-100 text-slate-700'
  return (
    <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded whitespace-nowrap', color)}>
      {TYPE_LABELS[type] ?? type}
    </span>
  )
}

function fmtSessionDate(iso: string): string {
  return new Date(iso).toLocaleDateString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  })
}

function bankName(row: DiscrepancyRow): string {
  return row.cashierEntry?.bankName ?? row.bankMutation?.bankName ?? '—'
}

function cashierAmount(row: DiscrepancyRow): number | null {
  if (!row.cashierEntry) return null
  return Number(row.cashierEntry.amount)
}

function bankAmount(row: DiscrepancyRow): number | null {
  if (!row.bankMutation) return null
  return Number(row.bankMutation.grossAmount)
}

// ─── Summary Card ─────────────────────────────────────────────────────────────

function SummaryCard({ label, value, icon: Icon, color, activeFilter, onClick }: {
  label: string
  value: number
  icon: React.ComponentType<{ className?: string }>
  color: 'red' | 'amber' | 'emerald' | 'slate'
  activeFilter: boolean
  onClick: () => void
}) {
  const colorMap = {
    red:     { icon: 'text-red-500',     value: 'text-red-700',     ring: 'ring-red-300',     bg: activeFilter ? 'bg-red-50'     : 'bg-white' },
    amber:   { icon: 'text-amber-500',   value: 'text-amber-700',   ring: 'ring-amber-300',   bg: activeFilter ? 'bg-amber-50'   : 'bg-white' },
    emerald: { icon: 'text-emerald-500', value: 'text-emerald-700', ring: 'ring-emerald-300', bg: activeFilter ? 'bg-emerald-50' : 'bg-white' },
    slate:   { icon: 'text-slate-400',   value: 'text-slate-500',   ring: 'ring-slate-300',   bg: activeFilter ? 'bg-slate-50'   : 'bg-white' },
  }
  const c = colorMap[color]
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-xl border border-slate-200 p-4 shadow-sm text-left transition-all hover:shadow-md',
        c.bg,
        activeFilter && `ring-2 ${c.ring}`,
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <Icon className={cn('w-4 h-4', c.icon)} />
        <span className="text-xs text-slate-500">{label}</span>
      </div>
      <p className={cn('text-3xl font-bold leading-tight', c.value)}>{value.toLocaleString('id-ID')}</p>
    </button>
  )
}

// ─── Resolve Dialog ───────────────────────────────────────────────────────────

function ResolveDialog({ disc, onClose, onSaved }: {
  disc: DiscrepancyRow
  onClose: () => void
  onSaved: (updated: DiscrepancyRow) => void
}) {
  const [status, setStatus]   = useState<'open' | 'investigating' | 'resolved' | 'ignored'>(
    disc.status as 'open' | 'investigating' | 'resolved' | 'ignored',
  )
  const [notes, setNotes]     = useState(disc.resolutionNotes ?? '')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  async function handleSave() {
    setSaving(true)
    setError('')
    const res = await fetch(
      `/api/sessions/${disc.sessionId}/discrepancies/${disc.id}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, resolutionNotes: notes.trim() || undefined }),
      },
    )
    setSaving(false)
    if (!res.ok) {
      const d = await res.json()
      setError(d.error ?? 'Gagal menyimpan.')
      return
    }
    const updated = await res.json()
    // Merge back session info (not returned by the PUT endpoint)
    onSaved({ ...disc, ...updated, session: disc.session })
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tindak Diskrepansi</DialogTitle>
        </DialogHeader>

        <div className="mt-1 space-y-1 text-sm text-slate-600 bg-slate-50 rounded-lg p-3">
          <p><span className="font-medium">Sesi:</span> {disc.session.outlet.name} · {fmtSessionDate(disc.session.sessionDate)}</p>
          <p><span className="font-medium">Tipe:</span> {TYPE_LABELS[disc.discrepancyType] ?? disc.discrepancyType}</p>
          {disc.cashierEntry && (
            <p><span className="font-medium">Kasir:</span> {disc.cashierEntry.bankName} — {formatRupiah(Number(disc.cashierEntry.amount))}</p>
          )}
          {disc.bankMutation && (
            <p><span className="font-medium">Bank:</span> {disc.bankMutation.bankName} — {formatRupiah(Number(disc.bankMutation.grossAmount))}</p>
          )}
        </div>

        <div className="space-y-3 mt-2">
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Terbuka</SelectItem>
                <SelectItem value="investigating">Investigasi</SelectItem>
                <SelectItem value="resolved">Selesai</SelectItem>
                <SelectItem value="ignored">Diabaikan</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Catatan Resolusi</Label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Tambahkan catatan penanganan..."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Batal</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Menyimpan...' : 'Simpan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function DiscrepanciesPage() {
  // Filter state
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter]     = useState('')
  const [outletId, setOutletId]         = useState('')
  const [dateFrom, setDateFrom]         = useState('')
  const [dateTo, setDateTo]             = useState('')

  // Data state
  const [data, setData]           = useState<DiscrepancyResponse | null>(null)
  const [outlets, setOutlets]     = useState<OutletOption[]>([])
  const [loading, setLoading]     = useState(true)
  const [page, setPage]           = useState(1)

  // Dialog state
  const [resolving, setResolving]   = useState<DiscrepancyRow | null>(null)
  const [ignoringIds, setIgnoringIds] = useState<Set<string>>(new Set())
  const [ignoringAll, setIgnoringAll] = useState(false)

  // ── Outlets ──
  useEffect(() => {
    fetch('/api/outlets')
      .then((r) => r.json())
      .then((data) => {
        // Flatten all outlets from all entities
        const list: OutletOption[] = []
        if (Array.isArray(data)) {
          for (const item of data) {
            if (item.outlets) {
              for (const o of item.outlets) list.push(o)
            } else if (item.id) {
              list.push(item)
            }
          }
        }
        setOutlets(list)
      })
      .catch(() => {})
  }, [])

  // ── Fetch ──
  const fetchDisc = useCallback(async (pg: number) => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(pg), limit: '25' })
    if (statusFilter) params.set('status', statusFilter)
    if (typeFilter)   params.set('type', typeFilter)
    if (outletId)     params.set('outletId', outletId)
    if (dateFrom)     params.set('dateFrom', dateFrom)
    if (dateTo)       params.set('dateTo', dateTo)

    const res = await fetch(`/api/discrepancies?${params.toString()}`)
    if (res.ok) setData(await res.json())
    setLoading(false)
  }, [statusFilter, typeFilter, outletId, dateFrom, dateTo])

  useEffect(() => {
    setPage(1)
    fetchDisc(1)
  }, [fetchDisc])

  function handlePageChange(next: number) {
    setPage(next)
    fetchDisc(next)
  }

  function handleReset() {
    setStatusFilter('')
    setTypeFilter('')
    setOutletId('')
    setDateFrom('')
    setDateTo('')
    setPage(1)
  }

  function handleResolved(updated: DiscrepancyRow) {
    setResolving(null)
    // Optimistically update the row in place
    setData((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        discrepancies: prev.discrepancies.map((d) =>
          d.id === updated.id ? updated : d,
        ),
        summary: {
          open:          prev.summary.open          + (updated.status === 'open'          ? 1 : 0) - (prev.discrepancies.find(d => d.id === updated.id)?.status === 'open'          ? 1 : 0),
          investigating: prev.summary.investigating + (updated.status === 'investigating' ? 1 : 0) - (prev.discrepancies.find(d => d.id === updated.id)?.status === 'investigating' ? 1 : 0),
          resolved:      prev.summary.resolved      + (updated.status === 'resolved'      ? 1 : 0) - (prev.discrepancies.find(d => d.id === updated.id)?.status === 'resolved'      ? 1 : 0),
          ignored:       prev.summary.ignored       + (updated.status === 'ignored'       ? 1 : 0) - (prev.discrepancies.find(d => d.id === updated.id)?.status === 'ignored'       ? 1 : 0),
        },
      }
    })
  }

  async function handleIgnore(disc: DiscrepancyRow) {
    setIgnoringIds(prev => new Set(prev).add(disc.id))
    const res = await fetch(`/api/sessions/${disc.sessionId}/discrepancies/${disc.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ignored', resolutionNotes: 'Diabaikan' }),
    })
    setIgnoringIds(prev => { const s = new Set(prev); s.delete(disc.id); return s })
    if (res.ok) {
      const updated = await res.json()
      handleResolved({ ...disc, ...updated, session: disc.session })
    }
  }

  async function handleIgnoreAll() {
    const openIds = data?.discrepancies.filter(d => d.status === 'open' || d.status === 'investigating').map(d => d.id) ?? []
    if (openIds.length === 0) return
    setIgnoringAll(true)
    const res = await fetch('/api/discrepancies', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: openIds }),
    })
    setIgnoringAll(false)
    if (res.ok) fetchDisc(page)
  }

  const hasFilter = !!(statusFilter || typeFilter || outletId || dateFrom || dateTo)
  const summary   = data?.summary ?? { open: 0, investigating: 0, resolved: 0, ignored: 0 }

  return (
    <div className="p-6 max-w-7xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <h1 className="text-xl font-bold text-slate-800">Manajemen Diskrepansi</h1>
          </div>
          <p className="text-slate-500 text-sm">Pantau dan tindak diskrepansi dari semua sesi rekonsiliasi.</p>
        </div>
        <div className="flex items-center gap-3 mt-1">
          {data && (
            <span className="text-xs text-slate-400">
              {data.total.toLocaleString('id-ID')} diskrepansi
            </span>
          )}
          {data && data.discrepancies.some(d => d.status === 'open' || d.status === 'investigating') && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleIgnoreAll}
              disabled={ignoringAll}
              className="gap-1.5 text-slate-500 border-slate-300 hover:bg-slate-50"
            >
              {ignoringAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <EyeOff className="w-3.5 h-3.5" />}
              Abaikan Semua
            </Button>
          )}
        </div>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <SummaryCard
          label="Terbuka"
          value={summary.open}
          icon={CircleDot}
          color="red"
          activeFilter={statusFilter === 'open'}
          onClick={() => setStatusFilter(statusFilter === 'open' ? '' : 'open')}
        />
        <SummaryCard
          label="Investigasi"
          value={summary.investigating}
          icon={Clock}
          color="amber"
          activeFilter={statusFilter === 'investigating'}
          onClick={() => setStatusFilter(statusFilter === 'investigating' ? '' : 'investigating')}
        />
        <SummaryCard
          label="Selesai"
          value={summary.resolved}
          icon={CheckCircle2}
          color="emerald"
          activeFilter={statusFilter === 'resolved'}
          onClick={() => setStatusFilter(statusFilter === 'resolved' ? '' : 'resolved')}
        />
        <SummaryCard
          label="Diabaikan"
          value={summary.ignored ?? 0}
          icon={EyeOff}
          color="slate"
          activeFilter={statusFilter === 'ignored'}
          onClick={() => setStatusFilter(statusFilter === 'ignored' ? '' : 'ignored')}
        />
      </div>

      {/* ── Filter Bar ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4">
        <div className="flex flex-wrap gap-3 items-end">

          {/* Status */}
          <div className="flex flex-col gap-1 min-w-[160px]">
            <label className="text-xs font-medium text-slate-600">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 rounded-md border border-slate-200 px-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">Semua Status</option>
              <option value="open">Terbuka</option>
              <option value="investigating">Investigasi</option>
              <option value="resolved">Selesai</option>
              <option value="ignored">Diabaikan</option>
            </select>
          </div>

          {/* Type */}
          <div className="flex flex-col gap-1 min-w-[200px]">
            <label className="text-xs font-medium text-slate-600">Tipe</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="h-9 rounded-md border border-slate-200 px-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">Semua Tipe</option>
              <option value="missing_in_bank">Tidak Ada di Bank</option>
              <option value="unexpected_bank_entry">Tidak Terduga</option>
              <option value="amount_mismatch">Selisih Jumlah</option>
            </select>
          </div>

          {/* Outlet */}
          {outlets.length > 0 && (
            <div className="flex flex-col gap-1 min-w-[200px]">
              <label className="text-xs font-medium text-slate-600">Outlet</label>
              <select
                value={outletId}
                onChange={(e) => setOutletId(e.target.value)}
                className="h-9 rounded-md border border-slate-200 px-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">Semua Outlet</option>
                {outlets.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Date From */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">Dari Tanggal</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-9 rounded-md border border-slate-200 px-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>

          {/* Date To */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">Sampai Tanggal</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-9 rounded-md border border-slate-200 px-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>

          {/* Reset */}
          {hasFilter && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              className="gap-1.5 h-9 text-slate-500"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </Button>
          )}
        </div>
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Sesi</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Bank</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Tipe</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Kasir (Rp)</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Bank (Rp)</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center">
                    <div className="flex items-center justify-center gap-2 text-slate-400">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm">Memuat diskrepansi...</span>
                    </div>
                  </td>
                </tr>
              ) : !data || data.discrepancies.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <AlertTriangle className="w-8 h-8 opacity-30" />
                      <p className="text-sm">
                        {hasFilter
                          ? 'Tidak ada diskrepansi yang sesuai filter.'
                          : 'Tidak ada diskrepansi ditemukan.'}
                      </p>
                      {hasFilter && (
                        <button
                          onClick={handleReset}
                          className="text-blue-500 hover:text-blue-700 text-xs underline"
                        >
                          Hapus filter
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                data.discrepancies.map((d: DiscrepancyRow) => {
                  const cAmt = cashierAmount(d)
                  const bAmt = bankAmount(d)
                  return (
                    <tr
                      key={d.id}
                      className={cn(
                        'border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors',
                        d.status === 'open' && 'bg-red-50/30',
                        d.status === 'ignored' && 'opacity-50',
                      )}
                    >
                      {/* Sesi */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <Link
                            href={`/sessions/${d.session.id}/review`}
                            className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            {d.session.outlet.name}
                          </Link>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-slate-400">
                              {fmtSessionDate(d.session.sessionDate)}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Bank */}
                      <td className="px-4 py-3">
                        <span className="text-xs font-medium text-slate-700">{bankName(d)}</span>
                        {d.cashierEntry?.terminalCode && (
                          <p className="text-[10px] text-slate-400">{d.cashierEntry.terminalCode}</p>
                        )}
                      </td>

                      {/* Tipe */}
                      <td className="px-4 py-3">{typeBadge(d.discrepancyType)}</td>

                      {/* Kasir */}
                      <td className="px-4 py-3 text-right font-mono text-xs text-slate-700">
                        {cAmt !== null ? formatRupiah(cAmt) : <span className="text-slate-400">—</span>}
                      </td>

                      {/* Bank */}
                      <td className="px-4 py-3 text-right font-mono text-xs text-slate-700">
                        {bAmt !== null ? formatRupiah(bAmt) : <span className="text-slate-400">—</span>}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">{statusBadge(d.status)}</td>

                      {/* Aksi */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setResolving(d)}
                            className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                          >
                            Tindak
                          </button>
                          {d.status !== 'ignored' && (
                            <button
                              onClick={() => handleIgnore(d)}
                              disabled={ignoringIds.has(d.id)}
                              className="text-xs font-medium text-slate-400 hover:text-slate-600 px-2 py-1 rounded hover:bg-slate-100 transition-colors disabled:opacity-50"
                            >
                              {ignoringIds.has(d.id) ? '...' : 'Abaikan'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ── */}
        {data && data.pages > 1 && (
          <div className={cn(
            'flex items-center justify-between px-4 py-3 border-t border-slate-200',
            loading && 'opacity-50 pointer-events-none',
          )}>
            <span className="text-xs text-slate-500">
              Halaman{' '}
              <span className="font-semibold text-slate-700">{data.page}</span>
              {' '}dari{' '}
              <span className="font-semibold text-slate-700">{data.pages}</span>
              {' · '}
              {((data.page - 1) * data.limit + 1).toLocaleString('id-ID')}–
              {Math.min(data.page * data.limit, data.total).toLocaleString('id-ID')}
              {' '}dari{' '}
              {data.total.toLocaleString('id-ID')}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(data.page - 1)}
                disabled={data.page <= 1 || loading}
                className="gap-1 h-8 px-2.5"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Sebelumnya
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(data.page + 1)}
                disabled={data.page >= data.pages || loading}
                className="gap-1 h-8 px-2.5"
              >
                Selanjutnya
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Resolve Dialog ── */}
      {resolving && (
        <ResolveDialog
          disc={resolving}
          onClose={() => setResolving(null)}
          onSaved={handleResolved}
        />
      )}

    </div>
  )
}
