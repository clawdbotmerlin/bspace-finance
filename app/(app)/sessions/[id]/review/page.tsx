'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, CheckCircle2, MinusCircle, AlertCircle, AlertTriangle,
  RefreshCw, Send, Loader2, Eye, Search,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { cn, formatRupiah } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────────────────────────

interface SessionDetail {
  id: string
  outletId: string
  sessionDate: string
  blockType: string
  status: string
  submittedAt: string | null
  signedOffAt: string | null
  outlet: { name: string; code: string }
  _count: { cashierEntries: number; bankMutations: number }
}

interface MatchPair {
  cashierEntry: {
    id: string; bankName: string; terminalCode: string | null
    terminalId: string | null; paymentType: string
    amount: string; entityNameRaw: string | null
    matchedMutationId: string
  }
  bankMutation: {
    id: string; bankName: string; accountNumber: string | null
    grossAmount: string; netAmount: string | null
    mdrAmount: string | null; description: string | null
    referenceNo: string | null; direction: string
  } | null
  amountDiff: number
}

interface Discrepancy {
  id: string
  sessionId: string
  cashierEntryId: string | null
  bankMutationId: string | null
  discrepancyType: string
  amountDiff: string | null
  notes: string | null
  status: string
  resolvedBy: string | null
  resolutionNotes: string | null
  cashierEntry: {
    bankName: string; terminalId: string | null; terminalCode: string | null
    paymentType: string; amount: string; entityNameRaw: string | null
  } | null
  bankMutation: {
    bankName: string; accountNumber: string | null; grossAmount: string
    description: string | null; referenceNo: string | null; direction: string
  } | null
}

type ReviewTab = 'matched' | 'missing' | 'unexpected' | 'mismatch'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function bankColorClass(name: string): string {
  const upper = name.toUpperCase()
  if (upper.startsWith('BCA')) return 'bg-blue-50 text-blue-700'
  if (upper.startsWith('MANDIRI')) return 'bg-yellow-50 text-yellow-700'
  if (upper.startsWith('BNI')) return 'bg-orange-50 text-orange-700'
  if (upper.startsWith('BRI')) return 'bg-sky-50 text-sky-700'
  return 'bg-slate-100 text-slate-600'
}

function BankBadge({ name }: { name: string }) {
  return (
    <span className={cn('text-xs font-semibold px-2 py-0.5 rounded', bankColorClass(name))}>
      {name}
    </span>
  )
}

function statusBadge(status: string) {
  const map: Record<string, { variant: 'warning' | 'info' | 'success' | 'outline'; label: string }> = {
    uploading: { variant: 'outline', label: 'Uploading' },
    reviewing: { variant: 'warning', label: 'Menunggu Review' },
    pending_signoff: { variant: 'info', label: 'Menunggu Tanda Tangan' },
    signed_off: { variant: 'success', label: 'Sudah Ditandatangani' },
  }
  const s = map[status] ?? { variant: 'outline' as const, label: status }
  return <Badge variant={s.variant}>{s.label}</Badge>
}

function discrepancyStatusBadge(status: string) {
  const map: Record<string, { variant: 'destructive' | 'warning' | 'success'; label: string }> = {
    open: { variant: 'destructive', label: 'Terbuka' },
    investigating: { variant: 'warning', label: 'Investigasi' },
    resolved: { variant: 'success', label: 'Selesai' },
  }
  const s = map[status] ?? { variant: 'destructive' as const, label: status }
  return <Badge variant={s.variant} className="text-[11px]">{s.label}</Badge>
}

function discrepancyTypeLabel(type: string) {
  const map: Record<string, string> = {
    missing_in_bank: 'Tidak ada di bank',
    unexpected_bank_entry: 'Mutasi tak terduga',
    amount_mismatch: 'Selisih jumlah',
    prior_period_settlement: 'Settlement periode lalu',
    duplicate: 'Duplikat',
    other: 'Lainnya',
  }
  return map[type] ?? type
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function ReviewPage() {
  const params = useParams()
  const router = useRouter()
  const sessionId = params.id as string

  // Data state
  const [session, setSession] = useState<SessionDetail | null>(null)
  const [matches, setMatches] = useState<MatchPair[]>([])
  const [zeroCount, setZeroCount] = useState(0)
  const [discrepancies, setDiscrepancies] = useState<Discrepancy[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Tab state
  const [tab, setTab] = useState<ReviewTab>('matched')

  // Action states
  const [rerunning, setRerunning] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [showRerunConfirm, setShowRerunConfirm] = useState(false)

  // Resolve dialog
  const [resolveTarget, setResolveTarget] = useState<Discrepancy | null>(null)

  // Derived counts
  const missingDisc = discrepancies.filter((d) => d.discrepancyType === 'missing_in_bank')
  const unexpectedDisc = discrepancies.filter((d) => d.discrepancyType === 'unexpected_bank_entry')
  const mismatchDisc = discrepancies.filter((d) => d.discrepancyType === 'amount_mismatch')

  async function fetchAll() {
    setLoading(true)
    setError('')
    try {
      const [sRes, mRes, dRes] = await Promise.all([
        fetch(`/api/sessions/${sessionId}`),
        fetch(`/api/sessions/${sessionId}/matches`),
        fetch(`/api/sessions/${sessionId}/discrepancies`),
      ])
      if (!sRes.ok) throw new Error('Gagal memuat data sesi.')
      if (!mRes.ok) throw new Error('Gagal memuat data kecocokan.')
      if (!dRes.ok) throw new Error('Gagal memuat data diskrepansi.')

      const sessionData = await sRes.json()
      const matchData = await mRes.json()
      const discData = await dRes.json()

      setSession(sessionData)
      setMatches(matchData.pairs)
      setZeroCount(matchData.zeroCount)
      setDiscrepancies(discData)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll() }, [sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleReRunMatching() {
    setShowRerunConfirm(false)
    setRerunning(true)
    try {
      const res = await fetch(`/api/sessions/${sessionId}/run-matching`, { method: 'POST' })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? 'Gagal menjalankan ulang rekonsiliasi.')
        return
      }
      await fetchAll()
    } finally {
      setRerunning(false)
    }
  }

  async function handleSubmitForSignoff() {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/sessions/${sessionId}/submit`, { method: 'POST' })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? 'Gagal mengirim untuk tanda tangan.')
        return
      }
      const data = await res.json()
      setSession(data.session)
    } finally {
      setSubmitting(false)
    }
  }

  function handleDiscrepancyUpdated(updated: Discrepancy) {
    setDiscrepancies((prev) => prev.map((d) => (d.id === updated.id ? updated : d)))
    setResolveTarget(null)
  }

  // ── Loading / Error states ──
  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="flex items-center gap-2 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Memuat data review...</span>
        </div>
      </div>
    )
  }

  if (error && !session) {
    return (
      <div className="p-6 max-w-xl mx-auto">
        <ErrorMsg msg={error} />
        <div className="mt-4 text-center">
          <Link href="/sessions/new">
            <Button variant="outline" className="gap-1.5">
              <ArrowLeft className="w-4 h-4" /> Kembali
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  if (!session) return null

  // ── Status guard ──
  if (session.status === 'uploading') {
    return (
      <div className="p-6 max-w-xl mx-auto text-center">
        <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm">
          <AlertCircle className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 font-medium">Sesi masih dalam tahap upload</p>
          <p className="text-sm text-slate-400 mt-1">
            Silakan upload file kasir dan mutasi bank, lalu jalankan rekonsiliasi.
          </p>
          <Link href="/sessions/new">
            <Button className="mt-4 gap-1.5">
              <ArrowLeft className="w-4 h-4" /> Kembali ke Upload
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  const isReadOnly = session.status !== 'reviewing'

  const TABS: { id: ReviewTab; label: string; count: number }[] = [
    { id: 'matched', label: 'Cocok', count: matches.length },
    { id: 'missing', label: 'Tidak Ada di Bank', count: missingDisc.length },
    { id: 'unexpected', label: 'Tidak Terduga', count: unexpectedDisc.length },
    { id: 'mismatch', label: 'Selisih', count: mismatchDisc.length },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* ── Session Header ── */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Link href="/sessions/new" className="text-slate-400 hover:text-slate-600 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <h1 className="text-xl font-semibold text-slate-800">Review Rekonsiliasi</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="font-medium">{session.outlet.name}</Badge>
          <Badge variant="outline">
            {new Date(session.sessionDate).toLocaleDateString('id-ID', {
              day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
            })}
          </Badge>
          <Badge className={cn(
            session.blockType === 'REG' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700',
            'border-0',
          )}>
            {session.blockType}
          </Badge>
          {statusBadge(session.status)}
        </div>
      </div>

      {/* ── Inline error ── */}
      {error && <div className="mb-4"><ErrorMsg msg={error} /></div>}

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <StatCard label="Cocok" value={matches.length} color="emerald" icon={CheckCircle2} />
        <StatCard label="Nol / Skip" value={zeroCount} color="slate" icon={MinusCircle} />
        <StatCard label="Tidak Ada di Bank" value={missingDisc.length} color="red" icon={AlertCircle} />
        <StatCard label="Tidak Terduga" value={unexpectedDisc.length} color="red" icon={AlertCircle} />
        <StatCard label="Selisih Jumlah" value={mismatchDisc.length} color="amber" icon={AlertTriangle} />
      </div>

      {/* ── Tab Bar ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex gap-0 border-b border-slate-200">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                tab === t.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700',
              )}
            >
              {t.label}
              <span className={cn(
                'text-[11px] font-semibold px-1.5 py-0.5 rounded-full',
                tab === t.id ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500',
              )}>
                {t.count}
              </span>
            </button>
          ))}
        </div>

        {/* ── Tab Content ── */}
        <div className="overflow-x-auto">
          {tab === 'matched' && <MatchedTable pairs={matches} />}
          {tab === 'missing' && (
            <MissingTable discrepancies={missingDisc} onResolve={setResolveTarget} readOnly={isReadOnly} />
          )}
          {tab === 'unexpected' && (
            <UnexpectedTable discrepancies={unexpectedDisc} onResolve={setResolveTarget} readOnly={isReadOnly} />
          )}
          {tab === 'mismatch' && (
            <MismatchTable discrepancies={mismatchDisc} onResolve={setResolveTarget} readOnly={isReadOnly} />
          )}
        </div>
      </div>

      {/* ── Action Bar ── */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center justify-between mt-6">
        <Button
          variant="outline"
          onClick={() => setShowRerunConfirm(true)}
          disabled={rerunning || isReadOnly}
          className="gap-1.5"
        >
          {rerunning
            ? <><Loader2 className="w-4 h-4 animate-spin" />Memproses...</>
            : <><RefreshCw className="w-4 h-4" />Jalankan Ulang Rekonsiliasi</>}
        </Button>
        <Button
          onClick={handleSubmitForSignoff}
          disabled={submitting || isReadOnly}
          className="gap-1.5"
        >
          {submitting
            ? <><Loader2 className="w-4 h-4 animate-spin" />Mengirim...</>
            : <><Send className="w-4 h-4" />Submit untuk Tanda Tangan</>}
        </Button>
      </div>

      {/* ── Re-run Confirmation Dialog ── */}
      <Dialog open={showRerunConfirm} onOpenChange={setShowRerunConfirm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Jalankan Ulang Rekonsiliasi?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600 mt-2">
            Semua hasil kecocokan dan catatan resolusi diskrepansi akan dihapus dan dihitung ulang.
            Tindakan ini tidak bisa dibatalkan.
          </p>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowRerunConfirm(false)}>Batal</Button>
            <Button variant="destructive" onClick={handleReRunMatching} className="gap-1.5">
              <RefreshCw className="w-4 h-4" /> Ya, Jalankan Ulang
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Resolve Dialog ── */}
      {resolveTarget && (
        <ResolveDialog
          discrepancy={resolveTarget}
          open={!!resolveTarget}
          onClose={() => setResolveTarget(null)}
          onSaved={handleDiscrepancyUpdated}
        />
      )}
    </div>
  )
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

function StatCard({ label, value, color, icon: Icon }: {
  label: string; value: number; color: string
  icon: React.ComponentType<{ className?: string }>
}) {
  const colorMap: Record<string, { icon: string; value: string }> = {
    emerald: { icon: 'text-emerald-500', value: 'text-emerald-700' },
    slate: { icon: 'text-slate-400', value: 'text-slate-600' },
    red: { icon: 'text-red-500', value: 'text-red-700' },
    amber: { icon: 'text-amber-500', value: 'text-amber-700' },
  }
  const c = colorMap[color] ?? colorMap.slate
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={cn('w-4 h-4', c.icon)} />
        <span className="stat-label">{label}</span>
      </div>
      <p className={cn('text-2xl font-bold leading-tight', c.value)}>{value}</p>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-slate-400">
      <Search className="w-8 h-8 mb-2 opacity-40" />
      <p className="text-sm">{message}</p>
    </div>
  )
}

// ── Matched Table ──

function MatchedTable({ pairs }: { pairs: MatchPair[] }) {
  if (pairs.length === 0) return <EmptyState message="Tidak ada entri yang cocok." />
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b bg-slate-50 text-slate-600 text-left">
          <th className="px-4 py-3 font-medium">Bank</th>
          <th className="px-4 py-3 font-medium">Terminal</th>
          <th className="px-4 py-3 font-medium">Jenis</th>
          <th className="px-4 py-3 font-medium text-right">Kasir (Rp)</th>
          <th className="px-4 py-3 font-medium text-right">Bank (Rp)</th>
          <th className="px-4 py-3 font-medium text-right">Selisih</th>
          <th className="px-4 py-3 font-medium">Ref Bank</th>
        </tr>
      </thead>
      <tbody>
        {pairs.map((p) => (
          <tr
            key={p.cashierEntry.id}
            className={cn(
              'border-b last:border-0',
              Math.round(Math.abs(p.amountDiff)) > 0 && 'bg-amber-50/50',
            )}
          >
            <td className="px-4 py-3"><BankBadge name={p.cashierEntry.bankName} /></td>
            <td className="px-4 py-3 font-mono text-xs text-slate-600">{p.cashierEntry.terminalId ?? '—'}</td>
            <td className="px-4 py-3">{p.cashierEntry.paymentType}</td>
            <td className="px-4 py-3 text-right font-mono num">{formatRupiah(p.cashierEntry.amount)}</td>
            <td className="px-4 py-3 text-right font-mono num">{formatRupiah(p.bankMutation?.grossAmount)}</td>
            <td className={cn(
              'px-4 py-3 text-right font-mono num',
              Math.round(Math.abs(p.amountDiff)) > 0 ? 'text-amber-600 font-semibold' : 'text-slate-400',
            )}>
              {formatRupiah(p.amountDiff)}
            </td>
            <td className="px-4 py-3 text-xs text-slate-500">{p.bankMutation?.referenceNo ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── Missing in Bank Table ──

function MissingTable({ discrepancies, onResolve, readOnly }: {
  discrepancies: Discrepancy[]; onResolve: (d: Discrepancy) => void; readOnly: boolean
}) {
  if (discrepancies.length === 0) return <EmptyState message="Tidak ada entri yang hilang di bank." />
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b bg-slate-50 text-slate-600 text-left">
          <th className="px-4 py-3 font-medium">Bank</th>
          <th className="px-4 py-3 font-medium">Terminal</th>
          <th className="px-4 py-3 font-medium">Jenis</th>
          <th className="px-4 py-3 font-medium text-right">Jumlah (Rp)</th>
          <th className="px-4 py-3 font-medium">Entitas</th>
          <th className="px-4 py-3 font-medium">Status</th>
          <th className="px-4 py-3 font-medium">Aksi</th>
        </tr>
      </thead>
      <tbody>
        {discrepancies.map((d) => (
          <tr key={d.id} className="border-b last:border-0">
            <td className="px-4 py-3">{d.cashierEntry ? <BankBadge name={d.cashierEntry.bankName} /> : '—'}</td>
            <td className="px-4 py-3 font-mono text-xs text-slate-600">{d.cashierEntry?.terminalId ?? '—'}</td>
            <td className="px-4 py-3">{d.cashierEntry?.paymentType ?? '—'}</td>
            <td className="px-4 py-3 text-right font-mono num">{formatRupiah(d.cashierEntry?.amount)}</td>
            <td className="px-4 py-3 text-xs text-slate-500">{d.cashierEntry?.entityNameRaw ?? '—'}</td>
            <td className="px-4 py-3">{discrepancyStatusBadge(d.status)}</td>
            <td className="px-4 py-3">
              <Button size="sm" variant="outline" onClick={() => onResolve(d)} disabled={readOnly} className="text-xs">
                Tindak
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── Unexpected Bank Table ──

function UnexpectedTable({ discrepancies, onResolve, readOnly }: {
  discrepancies: Discrepancy[]; onResolve: (d: Discrepancy) => void; readOnly: boolean
}) {
  if (discrepancies.length === 0) return <EmptyState message="Tidak ada mutasi bank tak terduga." />
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b bg-slate-50 text-slate-600 text-left">
          <th className="px-4 py-3 font-medium">Bank</th>
          <th className="px-4 py-3 font-medium">Rekening</th>
          <th className="px-4 py-3 font-medium">Deskripsi</th>
          <th className="px-4 py-3 font-medium text-right">Jumlah (Rp)</th>
          <th className="px-4 py-3 font-medium">Referensi</th>
          <th className="px-4 py-3 font-medium">Status</th>
          <th className="px-4 py-3 font-medium">Aksi</th>
        </tr>
      </thead>
      <tbody>
        {discrepancies.map((d) => (
          <tr key={d.id} className="border-b last:border-0">
            <td className="px-4 py-3">{d.bankMutation ? <BankBadge name={d.bankMutation.bankName} /> : '—'}</td>
            <td className="px-4 py-3 font-mono text-xs text-slate-600">{d.bankMutation?.accountNumber ?? '—'}</td>
            <td className="px-4 py-3 text-xs text-slate-500 max-w-[200px] truncate">{d.bankMutation?.description ?? '—'}</td>
            <td className="px-4 py-3 text-right font-mono num">{formatRupiah(d.bankMutation?.grossAmount)}</td>
            <td className="px-4 py-3 text-xs text-slate-500">{d.bankMutation?.referenceNo ?? '—'}</td>
            <td className="px-4 py-3">{discrepancyStatusBadge(d.status)}</td>
            <td className="px-4 py-3">
              <Button size="sm" variant="outline" onClick={() => onResolve(d)} disabled={readOnly} className="text-xs">
                Tindak
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── Amount Mismatch Table ──

function MismatchTable({ discrepancies, onResolve, readOnly }: {
  discrepancies: Discrepancy[]; onResolve: (d: Discrepancy) => void; readOnly: boolean
}) {
  if (discrepancies.length === 0) return <EmptyState message="Tidak ada selisih jumlah." />
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b bg-slate-50 text-slate-600 text-left">
          <th className="px-4 py-3 font-medium">Bank</th>
          <th className="px-4 py-3 font-medium">Terminal</th>
          <th className="px-4 py-3 font-medium text-right">Kasir (Rp)</th>
          <th className="px-4 py-3 font-medium text-right">Bank (Rp)</th>
          <th className="px-4 py-3 font-medium text-right">Selisih</th>
          <th className="px-4 py-3 font-medium">Status</th>
          <th className="px-4 py-3 font-medium">Aksi</th>
        </tr>
      </thead>
      <tbody>
        {discrepancies.map((d) => (
          <tr key={d.id} className="border-b last:border-0 bg-amber-50/30">
            <td className="px-4 py-3">{d.cashierEntry ? <BankBadge name={d.cashierEntry.bankName} /> : '—'}</td>
            <td className="px-4 py-3 font-mono text-xs text-slate-600">{d.cashierEntry?.terminalId ?? '—'}</td>
            <td className="px-4 py-3 text-right font-mono num">{formatRupiah(d.cashierEntry?.amount)}</td>
            <td className="px-4 py-3 text-right font-mono num">{formatRupiah(d.bankMutation?.grossAmount)}</td>
            <td className="px-4 py-3 text-right font-mono num text-amber-600 font-semibold">
              {formatRupiah(d.amountDiff)}
            </td>
            <td className="px-4 py-3">{discrepancyStatusBadge(d.status)}</td>
            <td className="px-4 py-3">
              <Button size="sm" variant="outline" onClick={() => onResolve(d)} disabled={readOnly} className="text-xs">
                Tindak
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── Resolve Dialog ──

function ResolveDialog({ discrepancy, open, onClose, onSaved }: {
  discrepancy: Discrepancy; open: boolean
  onClose: () => void; onSaved: (d: Discrepancy) => void
}) {
  const [status, setStatus] = useState(discrepancy.status)
  const [resolutionNotes, setResolutionNotes] = useState(discrepancy.resolutionNotes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Reset when discrepancy changes
  useEffect(() => {
    setStatus(discrepancy.status)
    setResolutionNotes(discrepancy.resolutionNotes ?? '')
    setError('')
  }, [discrepancy])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const res = await fetch(
        `/api/sessions/${discrepancy.sessionId}/discrepancies/${discrepancy.id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status, resolutionNotes }),
        },
      )
      if (res.ok) {
        onSaved(await res.json())
      } else {
        const d = await res.json()
        setError(d.error ?? 'Gagal menyimpan.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tindak Lanjut Diskrepansi</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Summary */}
          <div className="bg-slate-50 rounded-lg p-3 text-sm space-y-1">
            <p className="text-slate-600">
              <span className="font-medium">Tipe:</span> {discrepancyTypeLabel(discrepancy.discrepancyType)}
            </p>
            {discrepancy.amountDiff && (
              <p className="text-slate-600">
                <span className="font-medium">Selisih:</span>{' '}
                <span className="font-mono text-amber-600">{formatRupiah(discrepancy.amountDiff)}</span>
              </p>
            )}
            {discrepancy.cashierEntry && (
              <p className="text-slate-500 text-xs">
                Kasir: {discrepancy.cashierEntry.bankName} — {discrepancy.cashierEntry.paymentType} — {formatRupiah(discrepancy.cashierEntry.amount)}
              </p>
            )}
            {discrepancy.bankMutation && (
              <p className="text-slate-500 text-xs">
                Bank: {discrepancy.bankMutation.bankName} — {formatRupiah(discrepancy.bankMutation.grossAmount)}
                {discrepancy.bankMutation.referenceNo && ` — ${discrepancy.bankMutation.referenceNo}`}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Terbuka</SelectItem>
                <SelectItem value="investigating">Investigasi</SelectItem>
                <SelectItem value="resolved">Selesai</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Catatan Resolusi</Label>
            <textarea
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
              rows={3}
              placeholder="Jelaskan alasan atau tindakan yang diambil..."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
            />
          </div>

          {error && <ErrorMsg msg={error} />}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Shared ──

function ErrorMsg({ msg }: { msg: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3">
      <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
      <p className="text-sm text-red-700">{msg}</p>
    </div>
  )
}
