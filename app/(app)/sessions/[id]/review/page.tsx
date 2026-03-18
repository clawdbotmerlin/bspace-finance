'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, CheckCircle2, XCircle, AlertTriangle, MinusCircle,
  RefreshCw, Send, Loader2, AlertCircle, ArrowRightLeft,
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
  outlet: { name: string; code: string }
}

interface BankMutationLinked {
  id: string
  bankName: string
  accountNumber: string | null
  transactionDate: string
  grossAmount: string
  netAmount: string | null
  mdrAmount: string | null
  description: string | null
  referenceNo: string | null
  direction: string
}

interface CashierEntryFull {
  id: string
  bankName: string
  terminalCode: string | null
  terminalId: string | null
  paymentType: string
  amount: string
  entityNameRaw: string | null
  matchStatus: string
  matchedMutationId: string | null
  bankMutation: BankMutationLinked | null
}

interface UnexpectedMutation {
  id: string
  bankName: string
  accountNumber: string | null
  transactionDate: string
  grossAmount: string
  description: string | null
  referenceNo: string | null
  direction: string
  matchStatus: string
}

interface MatchSummary {
  cashierTotal: number
  matchedAmount: number
  unmatchedAmount: number
  zeroCount: number
  unexpectedCount: number
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

type ReviewTab = 'all' | 'attention' | 'matched'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function bankBg(name: string): string {
  const u = name.toUpperCase()
  if (u.startsWith('BCA')) return 'bg-blue-50 text-blue-700 border-blue-200'
  if (u.startsWith('MANDIRI')) return 'bg-yellow-50 text-yellow-700 border-yellow-200'
  if (u.startsWith('BNI')) return 'bg-orange-50 text-orange-700 border-orange-200'
  if (u.startsWith('BRI')) return 'bg-sky-50 text-sky-700 border-sky-200'
  return 'bg-slate-50 text-slate-600 border-slate-200'
}

function BankBadge({ name }: { name: string }) {
  return (
    <span className={cn('text-xs font-bold px-2 py-0.5 rounded border', bankBg(name))}>
      {name}
    </span>
  )
}

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    QR: 'bg-violet-100 text-violet-700',
    DEBIT: 'bg-blue-100 text-blue-700',
    KK: 'bg-pink-100 text-pink-700',
    CASH: 'bg-emerald-100 text-emerald-700',
    VOUCHER: 'bg-amber-100 text-amber-700',
  }
  return (
    <span className={cn('text-[11px] font-semibold px-1.5 py-0.5 rounded', colors[type] ?? 'bg-slate-100 text-slate-600')}>
      {type}
    </span>
  )
}

function statusBadge(status: string) {
  const map: Record<string, { variant: 'warning' | 'info' | 'success' | 'outline'; label: string }> = {
    uploading: { variant: 'outline', label: 'Uploading' },
    reviewing: { variant: 'warning', label: 'Menunggu Review' },
    pending_signoff: { variant: 'info', label: 'Menunggu TTD' },
    signed_off: { variant: 'success', label: 'Sudah TTD' },
  }
  const s = map[status] ?? { variant: 'outline' as const, label: status }
  return <Badge variant={s.variant}>{s.label}</Badge>
}

function discStatusBadge(status: string) {
  const map: Record<string, { variant: 'destructive' | 'warning' | 'success'; label: string }> = {
    open: { variant: 'destructive', label: 'Terbuka' },
    investigating: { variant: 'warning', label: 'Investigasi' },
    resolved: { variant: 'success', label: 'Selesai' },
  }
  const s = map[status] ?? { variant: 'destructive' as const, label: status }
  return <Badge variant={s.variant} className="text-[11px]">{s.label}</Badge>
}

function discTypeLabel(type: string) {
  const map: Record<string, string> = {
    missing_in_bank: 'Tidak ada di bank',
    unexpected_bank_entry: 'Mutasi tak terduga',
    amount_mismatch: 'Selisih jumlah',
    prior_period_settlement: 'Periode lalu',
    duplicate: 'Duplikat',
    other: 'Lainnya',
  }
  return map[type] ?? type
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function ReviewPage() {
  const params = useParams()
  const sessionId = params.id as string

  const [session, setSession] = useState<SessionDetail | null>(null)
  const [entries, setEntries] = useState<CashierEntryFull[]>([])
  const [unexpected, setUnexpected] = useState<UnexpectedMutation[]>([])
  const [summary, setSummary] = useState<MatchSummary | null>(null)
  const [discrepancies, setDiscrepancies] = useState<Discrepancy[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<ReviewTab>('all')
  const [rerunning, setRerunning] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [showRerunConfirm, setShowRerunConfirm] = useState(false)
  const [resolveTarget, setResolveTarget] = useState<Discrepancy | null>(null)

  // Maps for quick discrepancy lookup
  const discByEntryId = useMemo(
    () => new Map(discrepancies.filter((d) => d.cashierEntryId).map((d) => [d.cashierEntryId!, d])),
    [discrepancies],
  )
  const discByMutationId = useMemo(
    () => new Map(discrepancies.filter((d) => d.bankMutationId).map((d) => [d.bankMutationId!, d])),
    [discrepancies],
  )

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

      const sData = await sRes.json()
      const mData = await mRes.json()
      const dData = await dRes.json()

      setSession(sData)
      setEntries(mData.entries ?? [])
      setUnexpected(mData.unexpectedMutations ?? [])
      setSummary(mData.summary ?? null)
      setDiscrepancies(dData)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll() }, [sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRerun() {
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

  async function handleSubmit() {
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

  function handleDiscUpdated(updated: Discrepancy) {
    setDiscrepancies((prev) => prev.map((d) => (d.id === updated.id ? updated : d)))
    setResolveTarget(null)
  }

  // ── Loading / Error ──
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

  if (session.status === 'uploading') {
    return (
      <div className="p-6 max-w-xl mx-auto text-center">
        <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm">
          <AlertCircle className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 font-medium">Sesi masih dalam tahap upload</p>
          <p className="text-sm text-slate-400 mt-1 mb-4">
            Silakan upload file kasir dan mutasi bank, lalu jalankan rekonsiliasi.
          </p>
          <Link href="/sessions/new">
            <Button className="gap-1.5">
              <ArrowLeft className="w-4 h-4" /> Kembali ke Upload
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  const isReadOnly = session.status !== 'reviewing'

  // Attention items: unmatched entries + unexpected mutations
  const needsAttentionEntries = entries.filter(
    (e) => e.matchStatus === 'unmatched' || discByEntryId.get(e.id)?.discrepancyType === 'amount_mismatch',
  )
  const needsAttentionCount = needsAttentionEntries.length + unexpected.length
  const openDiscCount = discrepancies.filter((d) => d.status === 'open').length

  // Tab-filtered entries
  const visibleEntries = tab === 'matched'
    ? entries.filter((e) => e.matchStatus === 'matched')
    : tab === 'attention'
      ? needsAttentionEntries
      : entries

  const showUnexpected = tab === 'all' || tab === 'attention'

  // Bank groups
  const banks = Array.from(new Set(visibleEntries.map((e) => e.bankName))).sort()
  const unexpectedBanks = showUnexpected
    ? Array.from(new Set(unexpected.map((m) => m.bankName))).sort()
    : []

  const TABS: { id: ReviewTab; label: string; count: number }[] = [
    { id: 'all', label: 'Semua Entri', count: entries.length + unexpected.length },
    { id: 'attention', label: 'Perlu Perhatian', count: needsAttentionCount },
    { id: 'matched', label: 'Cocok Saja', count: entries.filter((e) => e.matchStatus === 'matched').length },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* ── Header ── */}
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-2">
          <Link href="/history" className="text-slate-400 hover:text-slate-600 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <h1 className="text-xl font-semibold text-slate-800">Review Rekonsiliasi</h1>
        </div>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="font-medium">{session.outlet.name}</Badge>
            <Badge variant="outline">
              {new Date(session.sessionDate).toLocaleDateString('id-ID', {
                day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
              })}
            </Badge>
            <Badge className={cn(
              'border-0',
              session.blockType === 'REG' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700',
            )}>
              {session.blockType}
            </Badge>
            {statusBadge(session.status)}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowRerunConfirm(true)}
              disabled={rerunning || isReadOnly}
              className="gap-1.5"
            >
              {rerunning
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Memproses...</>
                : <><RefreshCw className="w-3.5 h-3.5" />Jalankan Ulang</>}
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={submitting || isReadOnly}
              className="gap-1.5"
            >
              {submitting
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Mengirim...</>
                : <><Send className="w-3.5 h-3.5" />Submit TTD</>}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Error ── */}
      {error && <div className="mb-4"><ErrorMsg msg={error} /></div>}

      {/* ── Summary Cards ── */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <SummaryCard
            label="Total Kasir"
            amount={summary.cashierTotal}
            sub={`${entries.length} entri`}
            color="slate"
          />
          <SummaryCard
            label="Cocok dengan Bank"
            amount={summary.matchedAmount}
            sub={`${entries.filter((e) => e.matchStatus === 'matched').length} entri`}
            color="emerald"
          />
          <SummaryCard
            label="Tidak Ada di Bank"
            amount={summary.unmatchedAmount}
            sub={`${entries.filter((e) => e.matchStatus === 'unmatched').length} entri`}
            color="red"
          />
          <SummaryCard
            label="Nol / Lewati"
            amount={null}
            sub={`${summary.zeroCount} entri`}
            color="slate"
            count={summary.zeroCount}
          />
        </div>
      )}

      {/* ── Needs Attention Banner ── */}
      {openDiscCount > 0 && (
        <div className="mb-4 flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-2.5 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span><strong>{openDiscCount} item</strong> perlu ditindaklanjuti sebelum submit</span>
        </div>
      )}

      {/* ── Tab Bar ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex border-b border-slate-200">
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
                t.id === 'attention' && t.count > 0 && tab !== 'attention' && 'bg-red-100 text-red-600',
              )}>
                {t.count}
              </span>
            </button>
          ))}
        </div>

        {/* ── Entry content ── */}
        {visibleEntries.length === 0 && (!showUnexpected || unexpected.length === 0) ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
            <CheckCircle2 className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-sm">Tidak ada entri untuk ditampilkan.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {/* Cashier entries grouped by bank */}
            {banks.map((bank) => {
              const bankEntries = visibleEntries.filter((e) => e.bankName === bank)
              if (bankEntries.length === 0) return null
              const cashierBankTotal = bankEntries.reduce((s, e) => s + Number(e.amount), 0)
              const bankCRTotal = bankEntries.reduce((s, e) => s + Number(e.bankMutation?.grossAmount ?? 0), 0)
              const selisih = bankCRTotal - cashierBankTotal

              return (
                <div key={bank}>
                  {/* Bank section header */}
                  <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <BankBadge name={bank} />
                      <span className="text-xs text-slate-500">{bankEntries.length} entri</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <span>Kasir <span className="font-semibold text-slate-700 font-mono">{formatRupiah(cashierBankTotal)}</span></span>
                      <span>Bank CR <span className="font-semibold text-slate-700 font-mono">{formatRupiah(bankCRTotal)}</span></span>
                      <span>Selisih <span className={cn('font-semibold font-mono', Math.abs(Math.round(selisih)) > 0 ? 'text-amber-600' : 'text-emerald-600')}>
                        {formatRupiah(selisih)}
                      </span></span>
                    </div>
                  </div>

                  {/* Column header */}
                  <div className="grid grid-cols-[1fr_16px_1fr_auto] gap-2 px-4 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wide bg-white border-b border-slate-100">
                    <span>Kasir</span>
                    <span />
                    <span>Bank</span>
                    <span className="text-right pr-1">Status</span>
                  </div>

                  {/* Entry rows */}
                  {bankEntries.map((entry) => {
                    const disc = discByEntryId.get(entry.id) ?? null
                    return (
                      <EntryRow
                        key={entry.id}
                        entry={entry}
                        discrepancy={disc}
                        onResolve={setResolveTarget}
                        readOnly={isReadOnly}
                      />
                    )
                  })}
                </div>
              )
            })}

            {/* Unexpected bank mutations grouped by bank */}
            {showUnexpected && unexpectedBanks.map((bank) => {
              const bankMuts = unexpected.filter((m) => m.bankName === bank)
              if (bankMuts.length === 0) return null
              const unexpectedTotal = bankMuts.reduce((s, m) => s + Number(m.grossAmount), 0)

              return (
                <div key={`unexpected-${bank}`}>
                  <div className="px-4 py-2 bg-orange-50 border-b border-orange-100 flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <BankBadge name={bank} />
                      <span className="text-xs text-orange-600 font-medium">{bankMuts.length} mutasi tak terduga</span>
                    </div>
                    <span className="text-xs text-orange-700">
                      Total CR <span className="font-semibold font-mono">{formatRupiah(unexpectedTotal)}</span>
                    </span>
                  </div>

                  <div className="grid grid-cols-[1fr_auto] gap-2 px-4 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wide bg-white border-b border-slate-100">
                    <span>Mutasi Bank</span>
                    <span className="text-right pr-1">Status</span>
                  </div>

                  {bankMuts.map((mut) => {
                    const disc = discByMutationId.get(mut.id) ?? null
                    return (
                      <UnexpectedRow
                        key={mut.id}
                        mutation={mut}
                        discrepancy={disc}
                        onResolve={setResolveTarget}
                        readOnly={isReadOnly}
                      />
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}
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
            <Button variant="destructive" onClick={handleRerun} className="gap-1.5">
              <RefreshCw className="w-4 h-4" /> Ya, Jalankan Ulang
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Resolve Dialog ── */}
      {resolveTarget && (
        <ResolveDialog
          discrepancy={resolveTarget}
          open
          onClose={() => setResolveTarget(null)}
          onSaved={handleDiscUpdated}
        />
      )}
    </div>
  )
}

// ─── Entry Row ────────────────────────────────────────────────────────────────

function EntryRow({ entry, discrepancy, onResolve, readOnly }: {
  entry: CashierEntryFull
  discrepancy: Discrepancy | null
  onResolve: (d: Discrepancy) => void
  readOnly: boolean
}) {
  const isUnmatched = entry.matchStatus === 'unmatched'
  const isZero = entry.matchStatus === 'zero'
  const isMismatch = discrepancy?.discrepancyType === 'amount_mismatch'
  const amountDiff = entry.bankMutation
    ? Number(entry.bankMutation.grossAmount) - Number(entry.amount)
    : 0

  return (
    <div className={cn(
      'grid grid-cols-[1fr_16px_1fr_auto] gap-2 px-4 py-2.5 items-center border-b border-slate-50 last:border-0 text-sm',
      isUnmatched && 'bg-red-50/40',
      isMismatch && 'bg-amber-50/40',
      isZero && 'opacity-50',
    )}>
      {/* Left: cashier side */}
      <div className="flex items-center gap-2 min-w-0">
        <TypeBadge type={entry.paymentType} />
        <div className="min-w-0">
          <span className="font-mono font-semibold text-slate-800 tabular-nums">
            {formatRupiah(entry.amount)}
          </span>
          {entry.terminalId && (
            <span className="text-xs text-slate-400 ml-2 font-mono">{entry.terminalId}</span>
          )}
        </div>
      </div>

      {/* Center: arrow */}
      <ArrowRightLeft className="w-3 h-3 text-slate-300 shrink-0" />

      {/* Right: bank side */}
      <div className="min-w-0">
        {entry.bankMutation ? (
          <div className="flex items-center gap-2">
            <span className="font-mono font-semibold text-slate-800 tabular-nums">
              {formatRupiah(entry.bankMutation.grossAmount)}
            </span>
            {Math.abs(Math.round(amountDiff)) > 0 && (
              <span className="text-xs font-mono text-amber-600">
                ({amountDiff > 0 ? '+' : ''}{formatRupiah(amountDiff)})
              </span>
            )}
            {entry.bankMutation.referenceNo && (
              <span className="text-xs text-slate-400 truncate">{entry.bankMutation.referenceNo}</span>
            )}
          </div>
        ) : isZero ? (
          <span className="text-xs text-slate-400 italic">Dilewati (Rp 0)</span>
        ) : (
          <span className="text-xs text-red-500 font-medium">Tidak ada di bank</span>
        )}
      </div>

      {/* Status + action */}
      <div className="flex items-center gap-1.5 shrink-0">
        {isZero ? (
          <span className="flex items-center gap-1 text-[11px] text-slate-400">
            <MinusCircle className="w-3.5 h-3.5" /> Nol
          </span>
        ) : isUnmatched ? (
          <>
            <span className="flex items-center gap-1 text-[11px] text-red-500 font-medium">
              <XCircle className="w-3.5 h-3.5" /> Tidak cocok
            </span>
            {discrepancy && (
              <Button
                size="sm"
                variant="outline"
                className="text-[11px] h-6 px-2 py-0"
                onClick={() => onResolve(discrepancy)}
                disabled={readOnly}
              >
                Tindak
              </Button>
            )}
          </>
        ) : isMismatch ? (
          <>
            <span className="flex items-center gap-1 text-[11px] text-amber-600 font-medium">
              <AlertTriangle className="w-3.5 h-3.5" /> Selisih
            </span>
            {discrepancy && (
              <Button
                size="sm"
                variant="outline"
                className="text-[11px] h-6 px-2 py-0"
                onClick={() => onResolve(discrepancy)}
                disabled={readOnly}
              >
                Tindak
              </Button>
            )}
          </>
        ) : (
          <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" /> Cocok
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Unexpected Row ──────────────────────────────────────────────────────────

function UnexpectedRow({ mutation, discrepancy, onResolve, readOnly }: {
  mutation: UnexpectedMutation
  discrepancy: Discrepancy | null
  onResolve: (d: Discrepancy) => void
  readOnly: boolean
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-2 px-4 py-2.5 items-center border-b border-orange-50 last:border-0 text-sm bg-orange-50/20">
      <div className="min-w-0">
        <span className="font-mono font-semibold text-slate-800 tabular-nums mr-2">
          {formatRupiah(mutation.grossAmount)}
        </span>
        {mutation.description && (
          <span className="text-xs text-slate-500 truncate">{mutation.description}</span>
        )}
        {mutation.referenceNo && (
          <span className="text-xs text-slate-400 ml-2">{mutation.referenceNo}</span>
        )}
        {mutation.accountNumber && (
          <span className="text-xs text-slate-400 ml-2 font-mono">{mutation.accountNumber}</span>
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="flex items-center gap-1 text-[11px] text-orange-600 font-medium">
          <AlertCircle className="w-3.5 h-3.5" /> Tak terduga
        </span>
        {discrepancy && (
          <Button
            size="sm"
            variant="outline"
            className="text-[11px] h-6 px-2 py-0"
            onClick={() => onResolve(discrepancy)}
            disabled={readOnly}
          >
            Tindak
          </Button>
        )}
      </div>
    </div>
  )
}

// ─── Summary Card ────────────────────────────────────────────────────────────

function SummaryCard({ label, amount, sub, color, count }: {
  label: string
  amount: number | null
  sub: string
  color: 'slate' | 'emerald' | 'red'
  count?: number
}) {
  const colors = {
    slate: { value: 'text-slate-700', label: 'text-slate-500' },
    emerald: { value: 'text-emerald-700', label: 'text-emerald-600' },
    red: { value: 'text-red-700', label: 'text-red-500' },
  }
  const c = colors[color]
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
      <p className="text-xs text-slate-500 font-medium mb-1">{label}</p>
      {amount !== null ? (
        <p className={cn('text-lg font-bold font-mono leading-tight', c.value)}>
          {formatRupiah(amount)}
        </p>
      ) : (
        <p className={cn('text-2xl font-bold leading-tight', c.value)}>{count ?? 0}</p>
      )}
      <p className={cn('text-xs mt-0.5', c.label)}>{sub}</p>
    </div>
  )
}

// ─── Resolve Dialog ──────────────────────────────────────────────────────────

function ResolveDialog({ discrepancy, open, onClose, onSaved }: {
  discrepancy: Discrepancy; open: boolean
  onClose: () => void; onSaved: (d: Discrepancy) => void
}) {
  const [status, setStatus] = useState(discrepancy.status)
  const [resolutionNotes, setResolutionNotes] = useState(discrepancy.resolutionNotes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

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
          <div className="bg-slate-50 rounded-lg p-3 text-sm space-y-1">
            <p className="text-slate-600">
              <span className="font-medium">Tipe:</span> {discTypeLabel(discrepancy.discrepancyType)}
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
            {discrepancy.status !== 'open' && (
              <p className="text-xs pt-1">{discStatusBadge(discrepancy.status)}</p>
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

// ─── Shared ───────────────────────────────────────────────────────────────────

function ErrorMsg({ msg }: { msg: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3">
      <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
      <p className="text-sm text-red-700">{msg}</p>
    </div>
  )
}
