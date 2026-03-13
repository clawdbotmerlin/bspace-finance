'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import {
  History, Loader2, AlertCircle, Eye, ClipboardCheck,
  Search, X, ChevronUp, ChevronDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────────────────────────

interface SessionRow {
  id: string
  sessionDate: string
  blockType: string
  status: string
  submittedAt: string | null
  signedOffAt: string | null
  createdAt: string
  outlet: { name: string; code: string }
  submitter: { name: string } | null
  _count: { cashierEntries: number; bankMutations: number }
}

type SortField = 'sessionDate' | 'outlet' | 'status' | 'createdAt'
type SortDir = 'asc' | 'desc'

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: '', label: 'Semua Status' },
  { value: 'uploading', label: 'Uploading' },
  { value: 'reviewing', label: 'Menunggu Review' },
  { value: 'pending_signoff', label: 'Menunggu TTD' },
  { value: 'signed_off', label: 'Selesai' },
]

const BLOCK_OPTIONS = [
  { value: '', label: 'Semua Blok' },
  { value: 'REG', label: 'REG' },
  { value: 'EV', label: 'EV' },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  const map: Record<string, { variant: 'warning' | 'info' | 'success' | 'outline'; label: string }> = {
    uploading: { variant: 'outline', label: 'Uploading' },
    reviewing: { variant: 'warning', label: 'Menunggu Review' },
    pending_signoff: { variant: 'info', label: 'Menunggu TTD' },
    signed_off: { variant: 'success', label: 'Selesai' },
  }
  const s = map[status] ?? { variant: 'outline' as const, label: status }
  return <Badge variant={s.variant} className="text-[11px] whitespace-nowrap">{s.label}</Badge>
}

function ActionCell({ s }: { s: SessionRow }) {
  if (s.status === 'reviewing') {
    return (
      <Link href={`/sessions/${s.id}/review`}>
        <Button size="sm" variant="outline" className="gap-1 text-xs h-7 px-2.5">
          <Eye className="w-3 h-3" /> Buka Review
        </Button>
      </Link>
    )
  }
  if (s.status === 'pending_signoff') {
    return (
      <Link href={`/sessions/${s.id}/signoff`}>
        <Button size="sm" className="gap-1 text-xs h-7 px-2.5">
          <ClipboardCheck className="w-3 h-3" /> Tanda Tangani
        </Button>
      </Link>
    )
  }
  if (s.status === 'signed_off') {
    return (
      <Link href={`/sessions/${s.id}/signoff`}>
        <Button size="sm" variant="outline" className="gap-1 text-xs h-7 px-2.5">
          <Eye className="w-3 h-3" /> Lihat
        </Button>
      </Link>
    )
  }
  return <span className="text-xs text-slate-300">—</span>
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function HistoryPage() {
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Filters
  const [searchOutlet, setSearchOutlet] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterBlock, setFilterBlock] = useState('')

  // Sort
  const [sortField, setSortField] = useState<SortField>('sessionDate')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  useEffect(() => {
    async function fetchSessions() {
      setLoading(true)
      setError('')
      try {
        const res = await fetch('/api/sessions')
        if (!res.ok) throw new Error('Gagal memuat riwayat sesi.')
        const data: SessionRow[] = await res.json()
        setSessions(data)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Terjadi kesalahan.')
      } finally {
        setLoading(false)
      }
    }
    fetchSessions()
  }, [])

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  const filtered = useMemo(() => {
    const result = sessions.filter((s: SessionRow) => {
      if (filterStatus && s.status !== filterStatus) return false
      if (filterBlock && s.blockType !== filterBlock) return false
      if (searchOutlet && !s.outlet.name.toLowerCase().includes(searchOutlet.toLowerCase())) return false
      return true
    })

    return [...result].sort((a: SessionRow, b: SessionRow) => {
      let cmp = 0
      if (sortField === 'sessionDate') {
        cmp = new Date(a.sessionDate).getTime() - new Date(b.sessionDate).getTime()
      } else if (sortField === 'outlet') {
        cmp = a.outlet.name.localeCompare(b.outlet.name)
      } else if (sortField === 'status') {
        cmp = a.status.localeCompare(b.status)
      } else if (sortField === 'createdAt') {
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [sessions, filterStatus, filterBlock, searchOutlet, sortField, sortDir])

  const hasFilters = !!(searchOutlet || filterStatus || filterBlock)

  const counts = useMemo(() => ({
    reviewing: sessions.filter((s: SessionRow) => s.status === 'reviewing').length,
    pending_signoff: sessions.filter((s: SessionRow) => s.status === 'pending_signoff').length,
    signed_off: sessions.filter((s: SessionRow) => s.status === 'signed_off').length,
  }), [sessions])

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ChevronUp className="w-3 h-3 opacity-20" />
    return sortDir === 'asc'
      ? <ChevronUp className="w-3 h-3 text-blue-500" />
      : <ChevronDown className="w-3 h-3 text-blue-500" />
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* ── Header ── */}
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-1">
          <History className="w-5 h-5 text-slate-500" />
          <h1 className="text-xl font-semibold text-slate-800">Riwayat Rekonsiliasi</h1>
        </div>
        <p className="text-sm text-slate-500">Semua sesi rekonsiliasi yang pernah dibuat.</p>
      </div>

      {/* ── Quick-filter status chips ── */}
      {!loading && !error && sessions.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {[
            { value: 'reviewing', dot: 'bg-amber-400', label: 'Review', count: counts.reviewing, active: 'bg-amber-100 border-amber-300 text-amber-700' },
            { value: 'pending_signoff', dot: 'bg-blue-400', label: 'Menunggu TTD', count: counts.pending_signoff, active: 'bg-blue-100 border-blue-300 text-blue-700' },
            { value: 'signed_off', dot: 'bg-emerald-400', label: 'Selesai', count: counts.signed_off, active: 'bg-emerald-100 border-emerald-300 text-emerald-700' },
          ].map((chip) => (
            <button
              key={chip.value}
              onClick={() => setFilterStatus(filterStatus === chip.value ? '' : chip.value)}
              className={cn(
                'flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border transition-colors',
                filterStatus === chip.value
                  ? chip.active + ' font-semibold'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50',
              )}
            >
              <span className={cn('w-1.5 h-1.5 rounded-full inline-block', chip.dot)} />
              {chip.label}
              <span className="font-bold ml-0.5">{chip.count}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Filter Bar ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 mb-5 flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchOutlet}
            onChange={(e) => setSearchOutlet(e.target.value)}
            placeholder="Cari outlet..."
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={filterBlock}
          onChange={(e) => setFilterBlock(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          {BLOCK_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {hasFilters && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setSearchOutlet(''); setFilterStatus(''); setFilterBlock('') }}
            className="gap-1 text-xs h-8"
          >
            <X className="w-3 h-3" /> Reset
          </Button>
        )}
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div className="flex items-center justify-center py-24 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          <span className="text-sm">Memuat riwayat...</span>
        </div>
      )}

      {/* ── Error ── */}
      {!loading && error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* ── Empty ── */}
      {!loading && !error && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-slate-400 bg-white rounded-xl border border-slate-200 shadow-sm">
          <History className="w-12 h-12 mb-3 opacity-20" />
          <p className="text-sm font-medium text-slate-500">
            {sessions.length === 0
              ? 'Belum ada sesi rekonsiliasi'
              : 'Tidak ada sesi yang cocok dengan filter'}
          </p>
          {hasFilters && (
            <button
              onClick={() => { setSearchOutlet(''); setFilterStatus(''); setFilterBlock('') }}
              className="mt-2 text-xs text-blue-500 hover:underline"
            >
              Hapus semua filter
            </button>
          )}
        </div>
      )}

      {/* ── Table ── */}
      {!loading && !error && filtered.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-2 border-b border-slate-100 bg-slate-50/50 flex items-center">
            <span className="text-xs text-slate-500">
              <span className="font-semibold text-slate-700">{filtered.length}</span> sesi
              {filtered.length !== sessions.length && (
                <> dari <span className="font-semibold text-slate-700">{sessions.length}</span> total</>
              )}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th
                    className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer select-none hover:text-slate-700"
                    onClick={() => toggleSort('sessionDate')}
                  >
                    <span className="flex items-center gap-1">
                      Tanggal <SortIcon field="sessionDate" />
                    </span>
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer select-none hover:text-slate-700"
                    onClick={() => toggleSort('outlet')}
                  >
                    <span className="flex items-center gap-1">
                      Outlet <SortIcon field="outlet" />
                    </span>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Blok
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer select-none hover:text-slate-700"
                    onClick={() => toggleSort('status')}
                  >
                    <span className="flex items-center gap-1">
                      Status <SortIcon field="status" />
                    </span>
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Kasir
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Bank
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Disubmit
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s: SessionRow) => (
                  <tr
                    key={s.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70 transition-colors"
                  >
                    <td className="px-4 py-3 text-slate-700 text-xs font-medium whitespace-nowrap">
                      {new Date(s.sessionDate).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                        timeZone: 'UTC',
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800 text-xs">{s.outlet.name}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5 font-mono">{s.outlet.code}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        'text-[11px] font-bold px-2 py-0.5 rounded',
                        s.blockType === 'REG'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-purple-100 text-purple-700',
                      )}>
                        {s.blockType}
                      </span>
                    </td>
                    <td className="px-4 py-3">{statusBadge(s.status)}</td>
                    <td className="px-4 py-3 text-center text-xs">
                      {s._count.cashierEntries > 0
                        ? <span className="font-semibold text-slate-700">{s._count.cashierEntries}</span>
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center text-xs">
                      {s._count.bankMutations > 0
                        ? <span className="font-semibold text-slate-700">{s._count.bankMutations}</span>
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {s.submitter ? (
                        <>
                          <p className="text-xs text-slate-600">{s.submitter.name}</p>
                          {s.submittedAt && (
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              {new Date(s.submittedAt).toLocaleDateString('id-ID', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </p>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ActionCell s={s} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
