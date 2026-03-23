'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, CheckCircle2, MinusCircle, AlertCircle, AlertTriangle,
  ClipboardCheck, Loader2, Search, ThumbsUp, ThumbsDown, XCircle, Download,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn, formatRupiah } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────────────────────────

interface SignoffSessionDetail {
  id: string
  outletId: string
  sessionDate: string
  status: string
  submittedAt: string | null
  signedOffAt: string | null
  signOffComment: string | null
  outlet: { name: string; code: string }
  submitter: { name: string } | null
  signer: { name: string } | null
  _count: { cashierEntries: number; bankMutations: number }
}

interface MatchPair {
  cashierEntry: {
    id: string
    bankName: string
    terminalCode: string | null
    terminalId: string | null
    paymentType: string
    amount: string
    entityNameRaw: string | null
  }
  bankMutation: {
    id: string
    bankName: string
    accountNumber: string | null
    grossAmount: string
    description: string | null
    referenceNo: string | null
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
  status: string
  resolvedBy: string | null
  resolutionNotes: string | null
  cashierEntry: {
    bankName: string
    terminalId: string | null
    terminalCode: string | null
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

type SignoffTab = 'matched' | 'missing' | 'unexpected' | 'mismatch'

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

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function SignoffPage() {
  const params = useParams()
  const sessionId = params.id as string

  // Data state
  const [session, setSession] = useState<SignoffSessionDetail | null>(null)
  const [matches, setMatches] = useState<MatchPair[]>([])
  const [zeroCount, setZeroCount] = useState(0)
  const [discrepancies, setDiscrepancies] = useState<Discrepancy[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Tab state
  const [tab, setTab] = useState<SignoffTab>('matched')

  // Sign-off action state
  const [comment, setComment] = useState('')
  const [actioning, setActioning] = useState(false)
  const [actionError, setActionError] = useState('')

  // PDF download state
  const [downloading, setDownloading] = useState(false)

  // Derived
  const missingDisc = discrepancies.filter((d: Discrepancy) => d.discrepancyType === 'missing_in_bank')
  const unexpectedDisc = discrepancies.filter((d: Discrepancy) => d.discrepancyType === 'unexpected_bank_entry')
  const mismatchDisc = discrepancies.filter((d: Discrepancy) => d.discrepancyType === 'amount_mismatch')

  useEffect(() => {
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

        const sessionData: SignoffSessionDetail = await sRes.json()
        const matchData = await mRes.json()
        const discData: Discrepancy[] = await dRes.json()

        // matches API now returns flat entries; adapt to MatchPair format
        const allEntries: Array<{
          id: string; bankName: string; terminalCode: string | null; terminalId: string | null
          paymentType: string; amount: string; entityNameRaw: string | null; matchStatus: string
          bankMutation: { id: string; bankName: string; accountNumber: string | null; grossAmount: string; description: string | null; referenceNo: string | null } | null
        }> = matchData.entries ?? []
        const pairs: MatchPair[] = allEntries
          .filter(e => e.matchStatus === 'matched' && e.bankMutation)
          .map(e => ({
            cashierEntry: { id: e.id, bankName: e.bankName, terminalCode: e.terminalCode, terminalId: e.terminalId, paymentType: e.paymentType, amount: e.amount, entityNameRaw: e.entityNameRaw },
            bankMutation: e.bankMutation,
            amountDiff: Math.abs(Number(e.amount) - Number(e.bankMutation!.grossAmount)),
          }))

        setSession(sessionData)
        setMatches(pairs)
        setZeroCount(matchData.summary?.zeroCount ?? 0)
        setDiscrepancies(discData)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Terjadi kesalahan.')
      } finally {
        setLoading(false)
      }
    }
    fetchAll()
  }, [sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSignoff(action: 'approve' | 'reject') {
    setActioning(true)
    setActionError('')
    try {
      const res = await fetch(`/api/sessions/${sessionId}/signoff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, comment: comment.trim() || undefined }),
      })
      if (!res.ok) {
        const d = await res.json()
        setActionError(d.error ?? 'Terjadi kesalahan.')
        return
      }
      const data = await res.json()
      setSession(data.session)
      setComment('')
    } finally {
      setActioning(false)
    }
  }

  async function handleDownloadReport() {
    setDownloading(true)
    try {
      const res = await fetch(`/api/sessions/${sessionId}/report`)
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        alert(d.error ?? 'Gagal mengunduh laporan.')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const cd = res.headers.get('content-disposition') ?? ''
      const match = cd.match(/filename="(.+)"/)
      a.download = match ? match[1] : `laporan-rekonsiliasi.pdf`
      a.href = url
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } finally {
      setDownloading(false)
    }
  }

  // ── Loading / Error ──
  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="flex items-center gap-2 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Memuat data sesi...</span>
        </div>
      </div>
    )
  }

  if (error && !session) {
    return (
      <div className="p-6 max-w-xl mx-auto text-center">
        <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-slate-600 font-medium">{error}</p>
          <Link href="/signoff">
            <Button variant="outline" className="mt-4 gap-1.5">
              <ArrowLeft className="w-4 h-4" /> Kembali
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  if (!session) return null

  // ── Status guard for wrong-status sessions ──
  if (session.status === 'uploading' || session.status === 'reviewing') {
    return (
      <div className="p-6 max-w-xl mx-auto text-center">
        <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm">
          <XCircle className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 font-medium">Sesi belum siap untuk ditandatangani</p>
          <p className="text-sm text-slate-400 mt-1">
            Sesi ini masih dalam tahap rekonsiliasi dan belum disubmit untuk tanda tangan.
          </p>
          <Link href="/signoff">
            <Button variant="outline" className="mt-4 gap-1.5">
              <ArrowLeft className="w-4 h-4" /> Kembali ke Antrian
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  const TABS: { id: SignoffTab; label: string; count: number }[] = [
    { id: 'matched', label: 'Cocok', count: matches.length },
    { id: 'missing', label: 'Tidak Ada di Bank', count: missingDisc.length },
    { id: 'unexpected', label: 'Tidak Terduga', count: unexpectedDisc.length },
    { id: 'mismatch', label: 'Selisih', count: mismatchDisc.length },
  ]

  const isSigned = session.status === 'signed_off'
  const isPending = session.status === 'pending_signoff'

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* ── Session Header ── */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Link href="/signoff" className="text-slate-400 hover:text-slate-600 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <h1 className="text-xl font-semibold text-slate-800">Tanda Tangan Sesi</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <Badge variant="outline" className="font-medium">{session.outlet.name}</Badge>
          <Badge variant="outline">
            {new Date(session.sessionDate).toLocaleDateString('id-ID', {
              day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
            })}
          </Badge>
          {statusBadge(session.status)}
        </div>
        {session.submitter && session.submittedAt && (
          <p className="text-xs text-slate-400">
            Disubmit oleh <span className="font-medium text-slate-600">{session.submitter.name}</span>
            {' '}pada{' '}
            <span className="font-medium text-slate-600">
              {new Date(session.submittedAt).toLocaleString('id-ID', {
                day: 'numeric', month: 'long', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
            </span>
          </p>
        )}
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="mb-4 flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <StatCard label="Cocok" value={matches.length} color="emerald" icon={CheckCircle2} />
        <StatCard label="Nol / Skip" value={zeroCount} color="slate" icon={MinusCircle} />
        <StatCard label="Tidak Ada di Bank" value={missingDisc.length} color="red" icon={AlertCircle} />
        <StatCard label="Tidak Terduga" value={unexpectedDisc.length} color="red" icon={AlertCircle} />
        <StatCard label="Selisih Jumlah" value={mismatchDisc.length} color="amber" icon={AlertTriangle} />
      </div>

      {/* ── Tab Bar ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6">
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
          {tab === 'missing' && <MissingTable discrepancies={missingDisc} />}
          {tab === 'unexpected' && <UnexpectedTable discrepancies={unexpectedDisc} />}
          {tab === 'mismatch' && <MismatchTable discrepancies={mismatchDisc} />}
        </div>
      </div>

      {/* ── Sign-off Panel ── */}
      {isPending && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <ClipboardCheck className="w-5 h-5 text-blue-500" />
            <h2 className="text-base font-semibold text-slate-800">Tanda Tangan</h2>
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Catatan (opsional)
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              placeholder="Tambahkan catatan persetujuan atau alasan penolakan..."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>

          {actionError && (
            <div className="mb-4 flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {actionError}
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <Button
              variant="outline"
              onClick={() => handleSignoff('reject')}
              disabled={actioning}
              className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
            >
              {actioning
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <ThumbsDown className="w-4 h-4" />}
              Tolak &amp; Kembalikan
            </Button>
            <Button
              onClick={() => handleSignoff('approve')}
              disabled={actioning}
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {actioning
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <ThumbsUp className="w-4 h-4" />}
              Setujui &amp; Tandatangani
            </Button>
          </div>
        </div>
      )}

      {isSigned && (
        <div className="bg-emerald-50 rounded-xl border border-emerald-200 shadow-sm p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-emerald-800">Sesi telah ditandatangani</p>
              {session.signer && session.signedOffAt && (
                <p className="text-sm text-emerald-700 mt-0.5">
                  Oleh <span className="font-medium">{session.signer.name}</span>
                  {' '}pada{' '}
                  <span className="font-medium">
                    {new Date(session.signedOffAt).toLocaleString('id-ID', {
                      day: 'numeric', month: 'long', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                </p>
              )}
              {session.signOffComment && (
                <p className="text-sm text-emerald-700 mt-2">
                  <span className="font-medium">Catatan:</span> {session.signOffComment}
                </p>
              )}
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <Link href="/signoff">
              <Button variant="outline" size="sm" className="gap-1.5">
                <ArrowLeft className="w-3.5 h-3.5" /> Kembali ke Antrian
              </Button>
            </Link>
            <Button
              size="sm"
              onClick={handleDownloadReport}
              disabled={downloading}
              className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
            >
              {downloading
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Download className="w-3.5 h-3.5" />}
              Unduh Laporan PDF
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

function StatCard({ label, value, color, icon: Icon }: {
  label: string
  value: number
  color: string
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
        <span className="text-xs text-slate-500">{label}</span>
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
        <tr className="bg-slate-50 border-b border-slate-200">
          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Bank</th>
          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Terminal</th>
          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Jenis</th>
          <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Kasir (Rp)</th>
          <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Bank (Rp)</th>
          <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Selisih</th>
          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Ref Bank</th>
        </tr>
      </thead>
      <tbody>
        {pairs.map((p: MatchPair) => {
          const hasAmountDiff = Math.round(Math.abs(p.amountDiff)) > 0
          return (
            <tr
              key={p.cashierEntry.id}
              className={cn(
                'border-b border-slate-100 last:border-0',
                hasAmountDiff ? 'bg-amber-50/50' : 'hover:bg-slate-50',
              )}
            >
              <td className="px-4 py-3">
                <BankBadge name={p.cashierEntry.bankName} />
              </td>
              <td className="px-4 py-3 text-slate-600 text-xs">
                {p.cashierEntry.terminalCode ?? p.cashierEntry.terminalId ?? '—'}
              </td>
              <td className="px-4 py-3 text-slate-600 text-xs font-medium">
                {p.cashierEntry.paymentType}
              </td>
              <td className="px-4 py-3 text-right font-mono text-slate-700 text-xs">
                {formatRupiah(Number(p.cashierEntry.amount))}
              </td>
              <td className="px-4 py-3 text-right font-mono text-slate-700 text-xs">
                {p.bankMutation ? formatRupiah(Number(p.bankMutation.grossAmount)) : '—'}
              </td>
              <td className={cn(
                'px-4 py-3 text-right font-mono text-xs',
                hasAmountDiff ? 'text-amber-700 font-semibold' : 'text-slate-400',
              )}>
                {hasAmountDiff ? formatRupiah(Math.abs(p.amountDiff)) : '✓'}
              </td>
              <td className="px-4 py-3 text-slate-500 text-xs">
                {p.bankMutation?.referenceNo ?? '—'}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ── Missing Table (read-only) ──

function MissingTable({ discrepancies }: { discrepancies: Discrepancy[] }) {
  if (discrepancies.length === 0) return <EmptyState message="Tidak ada entri kasir yang hilang di bank." />
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-slate-50 border-b border-slate-200">
          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Bank</th>
          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Terminal</th>
          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Jenis</th>
          <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Jumlah (Rp)</th>
          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Entitas</th>
          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
        </tr>
      </thead>
      <tbody>
        {discrepancies.map((d: Discrepancy) => (
          <tr key={d.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
            <td className="px-4 py-3">
              {d.cashierEntry ? <BankBadge name={d.cashierEntry.bankName} /> : '—'}
            </td>
            <td className="px-4 py-3 text-slate-600 text-xs">
              {d.cashierEntry?.terminalCode ?? d.cashierEntry?.terminalId ?? '—'}
            </td>
            <td className="px-4 py-3 text-slate-600 text-xs font-medium">
              {d.cashierEntry?.paymentType ?? '—'}
            </td>
            <td className="px-4 py-3 text-right font-mono text-slate-700 text-xs">
              {d.cashierEntry ? formatRupiah(Number(d.cashierEntry.amount)) : '—'}
            </td>
            <td className="px-4 py-3 text-slate-500 text-xs">
              {d.cashierEntry?.entityNameRaw ?? '—'}
            </td>
            <td className="px-4 py-3">{discrepancyStatusBadge(d.status)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── Unexpected Table (read-only) ──

function UnexpectedTable({ discrepancies }: { discrepancies: Discrepancy[] }) {
  if (discrepancies.length === 0) return <EmptyState message="Tidak ada mutasi bank tak terduga." />
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-slate-50 border-b border-slate-200">
          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Bank</th>
          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Rekening</th>
          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Deskripsi</th>
          <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Jumlah (Rp)</th>
          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Referensi</th>
          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
        </tr>
      </thead>
      <tbody>
        {discrepancies.map((d: Discrepancy) => (
          <tr key={d.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
            <td className="px-4 py-3">
              {d.bankMutation ? <BankBadge name={d.bankMutation.bankName} /> : '—'}
            </td>
            <td className="px-4 py-3 text-slate-500 text-xs font-mono">
              {d.bankMutation?.accountNumber ?? '—'}
            </td>
            <td className="px-4 py-3 text-slate-600 text-xs max-w-[200px] truncate">
              {d.bankMutation?.description ?? '—'}
            </td>
            <td className="px-4 py-3 text-right font-mono text-slate-700 text-xs">
              {d.bankMutation ? formatRupiah(Number(d.bankMutation.grossAmount)) : '—'}
            </td>
            <td className="px-4 py-3 text-slate-500 text-xs font-mono">
              {d.bankMutation?.referenceNo ?? '—'}
            </td>
            <td className="px-4 py-3">{discrepancyStatusBadge(d.status)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── Mismatch Table (read-only) ──

function MismatchTable({ discrepancies }: { discrepancies: Discrepancy[] }) {
  if (discrepancies.length === 0) return <EmptyState message="Tidak ada selisih jumlah." />
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-slate-50 border-b border-slate-200">
          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Bank</th>
          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Terminal</th>
          <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Kasir (Rp)</th>
          <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Bank (Rp)</th>
          <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Selisih</th>
          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
        </tr>
      </thead>
      <tbody>
        {discrepancies.map((d: Discrepancy) => (
          <tr key={d.id} className="border-b border-slate-100 last:border-0 bg-amber-50/40 hover:bg-amber-50">
            <td className="px-4 py-3">
              {d.cashierEntry ? <BankBadge name={d.cashierEntry.bankName} /> : '—'}
            </td>
            <td className="px-4 py-3 text-slate-600 text-xs">
              {d.cashierEntry?.terminalCode ?? d.cashierEntry?.terminalId ?? '—'}
            </td>
            <td className="px-4 py-3 text-right font-mono text-slate-700 text-xs">
              {d.cashierEntry ? formatRupiah(Number(d.cashierEntry.amount)) : '—'}
            </td>
            <td className="px-4 py-3 text-right font-mono text-slate-700 text-xs">
              {d.bankMutation ? formatRupiah(Number(d.bankMutation.grossAmount)) : '—'}
            </td>
            <td className="px-4 py-3 text-right font-mono text-amber-700 font-semibold text-xs">
              {d.amountDiff ? formatRupiah(Math.abs(Number(d.amountDiff))) : '—'}
            </td>
            <td className="px-4 py-3">{discrepancyStatusBadge(d.status)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
