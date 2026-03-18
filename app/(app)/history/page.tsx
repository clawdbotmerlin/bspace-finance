'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import {
  History, Loader2, AlertCircle, Eye, ClipboardCheck,
  Search, X, ChevronUp, ChevronDown, ArrowRight,
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

// One row in the table = REG + EV pair for the same outlet + date
interface SessionGroup {
  key: string
  sessionDate: string
  outlet: { name: string; code: string }
  reg: SessionRow | null
  ev: SessionRow | null
}

type SortField = 'sessionDate' | 'outlet' | 'status'
type SortDir = 'asc' | 'desc'

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Canonical status priority (higher = more progressed)
const STATUS_RANK: Record<string, number> = {
  uploading: 0, reviewing: 1, pending_signoff: 2, signed_off: 3,
}

function groupSessions(sessions: SessionRow[]): SessionGroup[] {
  const map = new Map<string, SessionGroup>()
  for (const s of sessions) {
    const key = `${s.outlet.code}|${s.sessionDate}`
    if (!map.has(key)) {
      map.set(key, { key, sessionDate: s.sessionDate, outlet: s.outlet, reg: null, ev: null })
    }
    const g = map.get(key)!
    // Keep the most-progressed session for each blockType (in case of duplicates from FRO-30)
    if (s.blockType === 'REG') {
      if (!g.reg || (STATUS_RANK[s.status] ?? 0) > (STATUS_RANK[g.reg.status] ?? 0)) g.reg = s
    } else {
      if (!g.ev || (STATUS_RANK[s.status] ?? 0) > (STATUS_RANK[g.ev.status] ?? 0)) g.ev = s
    }
  }
  return Array.from(map.values())
}

// "Overall" status of a group = highest-priority block's status
function groupStatus(g: SessionGroup): string {
  const statuses = [g.reg?.status, g.ev?.status].filter(Boolean) as string[]
  if (statuses.length === 0) return 'uploading'
  return statuses.reduce((best, s) => (STATUS_RANK[s] ?? 0) > (STATUS_RANK[best] ?? 0) ? s : best)
}

function statusBadge(status: string | undefined) {
  if (!status) return <span className="text-slate-300 text-xs">—</span>
  const map: Record<string, { variant: 'warning' | 'info' | 'success' | 'outline'; label: string }> = {
    uploading: { variant: 'outline', label: 'Uploading' },
    reviewing: { variant: 'warning', label: 'Menunggu Review' },
    pending_signoff: { variant: 'info', label: 'Menunggu TTD' },
    signed_off: { variant: 'success', label: 'Selesai' },
  }
  const s = map[status] ?? { variant: 'outline' as const, label: status }
  return <Badge variant={s.variant} className="text-[11px] whitespace-nowrap">{s.label}</Badge>
}

function BlockActionCell({ s, label }: { s: SessionRow; label: string }) {
  const blockColor = label === 'REG'
    ? 'bg-blue-100 text-blue-700'
    : 'bg-purple-100 text-purple-700'

  let action = null
  if (s.status === 'uploading') {
    action = (
      <Link href={`/sessions/new?resumeId=${s.id}`}>
        <Button size="sm" variant="outline" className="gap-1 text-xs h-7 px-2.5">
          <ArrowRight className="w-3 h-3" /> Lanjutkan
        </Button>
      </Link>
    )
  } else if (s.status === 'reviewing') {
    action = (
      <Link href={`/sessions/${s.id}/review`}>
        <Button size="sm" variant="outline" className="gap-1 text-xs h-7 px-2.5">
          <Eye className="w-3 h-3" /> Review
        </Button>
      </Link>
    )
  } else if (s.status === 'pending_signoff') {
    action = (
      <Link href={`/sessions/${s.id}/signoff`}>
        <Button size="sm" className="gap-1 text-xs h-7 px-2.5">
          <ClipboardCheck className="w-3 h-3" /> TTD
        </Button>
      </Link>
    )
  } else if (s.status === 'signed_off') {
    action = (
      <Link href={`/sessions/${s.id}/signoff`}>
        <Button size="sm" variant="outline" className="gap-1 text-xs h-7 px-2.5">
          <Eye className="w-3 h-3" /> Lihat
        </Button>
      </Link>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0', blockColor)}>
        {label}
      </span>
      {action ?? <span className="text-xs text-slate-300">—</span>}
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function HistoryPage() {
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [searchOutlet, setSearchOutlet] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  const [sortField, setSortField] = useState<SortField>('sessionDate')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  useEffect(() => {
    async function fetchSessions() {
      setLoading(true)
      setError('')
      try {
        const res = await fetch('/api/sessions')
        if (!res.ok) throw new Error('Gagal memuat riwayat sesi.')
        setSessions(await res.json())
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

  const groups = useMemo(() => groupSessions(sessions), [sessions])

  const filtered = useMemo(() => {
    const result = groups.filter((g) => {
      if (searchOutlet && !g.outlet.name.toLowerCase().includes(searchOutlet.toLowerCase())) return false
      if (filterStatus) {
        // Show group if either REG or EV matches the status
        const hasMatch = (g.reg?.status === filterStatus) || (g.ev?.status === filterStatus)
        if (!hasMatch) return false
      }
      return true
    })

    return [...result].sort((a, b) => {
      let cmp = 0
      if (sortField === 'sessionDate') {
        cmp = new Date(a.sessionDate).getTime() - new Date(b.sessionDate).getTime()
      } else if (sortField === 'outlet') {
        cmp = a.outlet.name.localeCompare(b.outlet.name)
      } else if (sortField === 'status') {
        cmp = (STATUS_RANK[groupStatus(a)] ?? 0) - (STATUS_RANK[groupStatus(b)] ?? 0)
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [groups, filterStatus, searchOutlet, sortField, sortDir])

  const hasFilters = !!(searchOutlet || filterStatus)

  // Counts based on individual sessions (for status chips)
  const counts = useMemo(() => ({
    uploading: sessions.filter((s) => s.status === 'uploading').length,
    reviewing: sessions.filter((s) => s.status === 'reviewing').length,
    pending_signoff: sessions.filter((s) => s.status === 'pending_signoff').length,
    signed_off: sessions.filter((s) => s.status === 'signed_off').length,
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

      {/* ── Quick-filter chips ── */}
      {!loading && !error && sessions.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {[
            { value: 'uploading', dot: 'bg-slate-400', label: 'Dalam Proses', count: counts.uploading, active: 'bg-slate-100 border-slate-300 text-slate-700' },
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
          <option value="">Semua Status</option>
          <option value="uploading">Uploading</option>
          <option value="reviewing">Menunggu Review</option>
          <option value="pending_signoff">Menunggu TTD</option>
          <option value="signed_off">Selesai</option>
        </select>
        {hasFilters && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setSearchOutlet(''); setFilterStatus('') }}
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
            {groups.length === 0
              ? 'Belum ada sesi rekonsiliasi'
              : 'Tidak ada sesi yang cocok dengan filter'}
          </p>
          {hasFilters && (
            <button
              onClick={() => { setSearchOutlet(''); setFilterStatus('') }}
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
          <div className="px-4 py-2 border-b border-slate-100 bg-slate-50/50">
            <span className="text-xs text-slate-500">
              <span className="font-semibold text-slate-700">{filtered.length}</span> sesi
              {filtered.length !== groups.length && (
                <> dari <span className="font-semibold text-slate-700">{groups.length}</span> total</>
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
                    <span className="flex items-center gap-1">Tanggal <SortIcon field="sessionDate" /></span>
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer select-none hover:text-slate-700"
                    onClick={() => toggleSort('outlet')}
                  >
                    <span className="flex items-center gap-1">Outlet <SortIcon field="outlet" /></span>
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer select-none hover:text-slate-700"
                    onClick={() => toggleSort('status')}
                  >
                    <span className="flex items-center gap-1">Status <SortIcon field="status" /></span>
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
                {filtered.map((g) => {
                  const submitter = g.reg?.submitter ?? g.ev?.submitter ?? null
                  const submittedAt = g.reg?.submittedAt ?? g.ev?.submittedAt ?? null
                  // Bank mutations are mirrored — show the count from whichever session has data
                  const bankCount = Math.max(
                    g.reg?._count.bankMutations ?? 0,
                    g.ev?._count.bankMutations ?? 0,
                  )

                  return (
                    <tr
                      key={g.key}
                      className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70 transition-colors"
                    >
                      {/* Date */}
                      <td className="px-4 py-3 text-slate-700 text-xs font-medium whitespace-nowrap">
                        {new Date(g.sessionDate).toLocaleDateString('id-ID', {
                          day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
                        })}
                      </td>

                      {/* Outlet */}
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800 text-xs">{g.outlet.name}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5 font-mono">{g.outlet.code}</p>
                      </td>

                      {/* Status — stacked REG + EV */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          {g.reg && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded shrink-0">REG</span>
                              {statusBadge(g.reg.status)}
                            </div>
                          )}
                          {g.ev && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-bold bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded shrink-0">EV</span>
                              {statusBadge(g.ev.status)}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Kasir — stacked REG + EV counts */}
                      <td className="px-4 py-3 text-center">
                        <div className="flex flex-col gap-0.5 items-center">
                          {g.reg && (
                            <span className="text-xs">
                              {g.reg._count.cashierEntries > 0
                                ? <span className="font-semibold text-slate-700">{g.reg._count.cashierEntries}</span>
                                : <span className="text-slate-300">—</span>}
                            </span>
                          )}
                          {g.ev && (
                            <span className="text-xs text-slate-400">
                              {g.ev._count.cashierEntries > 0
                                ? <span className="font-semibold text-slate-500">{g.ev._count.cashierEntries}</span>
                                : <span className="text-slate-300">—</span>}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Bank — shared count */}
                      <td className="px-4 py-3 text-center text-xs">
                        {bankCount > 0
                          ? <span className="font-semibold text-slate-700">{bankCount}</span>
                          : <span className="text-slate-300">—</span>}
                      </td>

                      {/* Submitted */}
                      <td className="px-4 py-3">
                        {submitter ? (
                          <>
                            <p className="text-xs text-slate-600">{submitter.name}</p>
                            {submittedAt && (
                              <p className="text-[10px] text-slate-400 mt-0.5">
                                {new Date(submittedAt).toLocaleDateString('id-ID', {
                                  day: 'numeric', month: 'short', year: 'numeric',
                                })}
                              </p>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>

                      {/* Actions — stacked REG + EV */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1 items-end">
                          {g.reg && <BlockActionCell s={g.reg} label="REG" />}
                          {g.ev && <BlockActionCell s={g.ev} label="EV" />}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
