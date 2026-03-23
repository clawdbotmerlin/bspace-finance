'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import {
  History, Loader2, AlertCircle, Eye, ClipboardCheck,
  Search, X, ChevronUp, ChevronDown, ArrowRight, Trash2, AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────────────────────────

interface SessionRow {
  id: string
  sessionDate: string
  status: string
  submittedAt: string | null
  signedOffAt: string | null
  createdAt: string
  outlet: { name: string; code: string }
  submitter: { name: string } | null
  _count: { cashierEntries: number; bankMutations: number }
}

type SortField = 'sessionDate' | 'outlet' | 'status'
type SortDir = 'asc' | 'desc'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_RANK: Record<string, number> = {
  uploading: 0, reviewing: 1, pending_signoff: 2, signed_off: 3,
}

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

function canDelete(status: string, role: string) {
  if (status === 'signed_off') return false
  if (role === 'admin') return true
  if (role === 'finance') return status === 'uploading' || status === 'reviewing'
  return false
}

function ActionCell({ s, userRole, onDelete }: { s: SessionRow; userRole: string; onDelete: (s: SessionRow) => void }) {
  const deletable = canDelete(s.status, userRole)
  return (
    <div className="flex items-center justify-end gap-1.5">
      {s.status === 'uploading' && (
        <Link href={`/sessions/new?resumeId=${s.id}`}>
          <Button size="sm" variant="outline" className="gap-1 text-xs h-7 px-2.5">
            <ArrowRight className="w-3 h-3" /> Lanjutkan
          </Button>
        </Link>
      )}
      {s.status === 'reviewing' && (
        <Link href={`/sessions/${s.id}/review`}>
          <Button size="sm" variant="outline" className="gap-1 text-xs h-7 px-2.5">
            <Eye className="w-3 h-3" /> Review
          </Button>
        </Link>
      )}
      {s.status === 'pending_signoff' && (
        <Link href={`/sessions/${s.id}/signoff`}>
          <Button size="sm" className="gap-1 text-xs h-7 px-2.5">
            <ClipboardCheck className="w-3 h-3" /> TTD
          </Button>
        </Link>
      )}
      {s.status === 'signed_off' && (
        <Link href={`/sessions/${s.id}/signoff`}>
          <Button size="sm" variant="outline" className="gap-1 text-xs h-7 px-2.5">
            <Eye className="w-3 h-3" /> Lihat
          </Button>
        </Link>
      )}
      {deletable && (
        <button
          onClick={() => onDelete(s)}
          className="text-slate-400 hover:text-red-500 hover:bg-red-50 p-1.5 rounded transition-colors"
          title="Hapus sesi"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}

// ─── Delete Confirm Dialog ────────────────────────────────────────────────────

function DeleteConfirmDialog({ session, onClose, onDeleted }: {
  session: SessionRow
  onClose: () => void
  onDeleted: (id: string) => void
}) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  async function handleDelete() {
    setDeleting(true)
    setError('')
    const res = await fetch(`/api/sessions/${session.id}`, { method: 'DELETE' })
    setDeleting(false)
    if (res.ok) {
      onDeleted(session.id)
    } else {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Gagal menghapus sesi.')
    }
  }

  const sessionDateStr = new Date(session.sessionDate).toLocaleDateString('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  })

  return (
    <Dialog open onOpenChange={(v) => !v && !deleting && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <Trash2 className="w-4 h-4" />
            Hapus Sesi Rekonsiliasi?
          </DialogTitle>
        </DialogHeader>

        <div className="mt-1 space-y-1 text-sm text-slate-600 bg-slate-50 rounded-lg p-3">
          <p><span className="font-medium">Outlet:</span> {session.outlet.name}</p>
          <p><span className="font-medium">Tanggal:</span> {sessionDateStr}</p>
          <p><span className="font-medium">Status:</span> {session.status}</p>
          <p><span className="font-medium">Entri Kasir:</span> {session._count.cashierEntries}</p>
          <p><span className="font-medium">Mutasi Bank:</span> {session._count.bankMutations}</p>
        </div>

        <div className="flex items-start gap-2.5 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Semua data kasir, mutasi bank, dan diskrepansi untuk sesi ini akan <strong>ikut terhapus permanen</strong>.
            Anda dapat membuat ulang sesi dengan tanggal yang sama setelahnya.
          </span>
        </div>

        {error && (
          <p className="text-sm text-red-600 font-medium">{error}</p>
        )}

        <DialogFooter className="mt-1">
          <Button variant="outline" onClick={onClose} disabled={deleting}>Batal</Button>
          <Button variant="destructive" onClick={handleDelete} disabled={deleting} className="gap-1.5">
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            {deleting ? 'Menghapus...' : 'Hapus Sesi'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function HistoryPage() {
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [userRole, setUserRole] = useState('')

  const [searchOutlet, setSearchOutlet] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  const [sortField, setSortField] = useState<SortField>('sessionDate')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const [deleteTarget, setDeleteTarget] = useState<SessionRow | null>(null)

  useEffect(() => {
    async function init() {
      setLoading(true)
      setError('')
      try {
        const [sessRes, authRes] = await Promise.all([
          fetch('/api/sessions'),
          fetch('/api/auth/session'),
        ])
        if (!sessRes.ok) throw new Error('Gagal memuat riwayat sesi.')
        setSessions(await sessRes.json())
        if (authRes.ok) {
          const s = await authRes.json()
          setUserRole((s?.user as { role?: string })?.role ?? '')
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Terjadi kesalahan.')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  function handleDeleted(id: string) {
    setSessions((prev) => prev.filter((s) => s.id !== id))
    setDeleteTarget(null)
  }

  const filtered = useMemo(() => {
    const result = sessions.filter((s) => {
      if (searchOutlet && !s.outlet.name.toLowerCase().includes(searchOutlet.toLowerCase())) return false
      if (filterStatus && s.status !== filterStatus) return false
      return true
    })

    return [...result].sort((a, b) => {
      let cmp = 0
      if (sortField === 'sessionDate') {
        cmp = new Date(a.sessionDate).getTime() - new Date(b.sessionDate).getTime()
      } else if (sortField === 'outlet') {
        cmp = a.outlet.name.localeCompare(b.outlet.name)
      } else if (sortField === 'status') {
        cmp = (STATUS_RANK[a.status] ?? 0) - (STATUS_RANK[b.status] ?? 0)
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [sessions, filterStatus, searchOutlet, sortField, sortDir])

  const hasFilters = !!(searchOutlet || filterStatus)

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
            {sessions.length === 0
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
                {filtered.map((s) => (
                  <tr
                    key={s.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70 transition-colors"
                  >
                    {/* Date */}
                    <td className="px-4 py-3 text-slate-700 text-xs font-medium whitespace-nowrap">
                      {new Date(s.sessionDate).toLocaleDateString('id-ID', {
                        day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
                      })}
                    </td>

                    {/* Outlet */}
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800 text-xs">{s.outlet.name}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5 font-mono">{s.outlet.code}</p>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      {statusBadge(s.status)}
                    </td>

                    {/* Kasir */}
                    <td className="px-4 py-3 text-center text-xs">
                      {s._count.cashierEntries > 0
                        ? <span className="font-semibold text-slate-700">{s._count.cashierEntries}</span>
                        : <span className="text-slate-300">—</span>}
                    </td>

                    {/* Bank */}
                    <td className="px-4 py-3 text-center text-xs">
                      {s._count.bankMutations > 0
                        ? <span className="font-semibold text-slate-700">{s._count.bankMutations}</span>
                        : <span className="text-slate-300">—</span>}
                    </td>

                    {/* Submitted */}
                    <td className="px-4 py-3">
                      {s.submitter ? (
                        <>
                          <p className="text-xs text-slate-600">{s.submitter.name}</p>
                          {s.submittedAt && (
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              {new Date(s.submittedAt).toLocaleDateString('id-ID', {
                                day: 'numeric', month: 'short', year: 'numeric',
                              })}
                            </p>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>

                    {/* Action */}
                    <td className="px-4 py-3 text-right">
                      <ActionCell s={s} userRole={userRole} onDelete={setDeleteTarget} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Dialog ── */}
      {deleteTarget && (
        <DeleteConfirmDialog
          session={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  )
}
