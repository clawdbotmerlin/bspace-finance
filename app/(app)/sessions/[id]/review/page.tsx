'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, CheckCircle2, XCircle, AlertTriangle, MinusCircle,
  RefreshCw, Send, Loader2, AlertCircle,
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
  notaBill: string | null
  entityNameRaw: string | null
  kasirName: string | null
  sourceRow: number | null
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

function bankHeaderBg(name: string): string {
  const u = name.toUpperCase()
  if (u.startsWith('BCA')) return 'bg-blue-600'
  if (u.startsWith('MANDIRI')) return 'bg-yellow-500'
  if (u.startsWith('BNI')) return 'bg-orange-500'
  if (u.startsWith('BRI')) return 'bg-sky-600'
  return 'bg-slate-600'
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
    QR: 'bg-violet-100 text-violet-700 border-violet-200',
    DEBIT: 'bg-blue-100 text-blue-700 border-blue-200',
    KK: 'bg-pink-100 text-pink-700 border-pink-200',
    CASH: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    VOUCHER: 'bg-amber-100 text-amber-700 border-amber-200',
  }
  return (
    <span className={cn('text-[11px] font-bold px-1.5 py-0.5 rounded border w-[48px] text-center inline-block', colors[type] ?? 'bg-slate-100 text-slate-600 border-slate-200')}>
      {type}
    </span>
  )
}

// T+N badge: compare bank mutation date vs session date
function settlementBadge(transactionDate: string, sessionDate: string): React.ReactNode {
  const t = new Date(transactionDate).getTime()
  const s = new Date(sessionDate).getTime()
  const diffDays = Math.round((t - s) / 86400000)
  if (diffDays === 0) return <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-1 py-0.5 rounded">T+0</span>
  if (diffDays === 1) return <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-1 py-0.5 rounded">T+1</span>
  if (diffDays === 2) return <span className="text-[10px] font-bold bg-violet-100 text-violet-700 px-1 py-0.5 rounded">T+2</span>
  if (diffDays === -1) return <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-1 py-0.5 rounded">T-1</span>
  if (diffDays > 0) return <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-1 py-0.5 rounded">T+{diffDays}</span>
  return <span className="text-[10px] font-bold bg-red-100 text-red-600 px-1 py-0.5 rounded">T{diffDays}</span>
}

function statusBadge(status: string) {
  const map: Record<string, { variant: 'warning' | 'info' | 'success' | 'outline'; label: string }> = {
    uploading: { variant: 'outline', label: 'Uploading' },
    reviewing: { variant: 'warning', label: 'Menunggu Review' },
    pending_signoff: { variant: 'info', label: 'Menunggu TTD' },
    signed_off: { variant: 'success', label: 'Selesai' },
  }
  const s = map[status] ?? { variant: 'outline' as const, label: status }
  return <Badge variant={s.variant}>{s.label}</Badge>
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

  const discByEntryId = useMemo(
    () => new Map(discrepancies.filter((d) => d.cashierEntryId).map((d) => [d.cashierEntryId!, d])),
    [discrepancies],
  )
  const discByMutationId = useMemo(
    () => new Map(discrepancies.filter((d) => d.bankMutationId).map((d) => [d.bankMutationId!, d])),
    [discrepancies],
  )

  // Build batch groups: mutationId → entries that share it
  const batchMap = useMemo(() => {
    const m = new Map<string, CashierEntryFull[]>()
    entries.forEach((e) => {
      if (e.matchedMutationId) {
        if (!m.has(e.matchedMutationId)) m.set(e.matchedMutationId, [])
        m.get(e.matchedMutationId)!.push(e)
      }
    })
    return m
  }, [entries])

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
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Gagal.'); return }
      await fetchAll()
    } finally { setRerunning(false) }
  }

  async function handleSubmit() {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/sessions/${sessionId}/submit`, { method: 'POST' })
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Gagal.'); return }
      const data = await res.json()
      setSession(data.session)
    } finally { setSubmitting(false) }
  }

  function handleDiscUpdated(updated: Discrepancy) {
    setDiscrepancies((prev) => prev.map((d) => (d.id === updated.id ? updated : d)))
    setResolveTarget(null)
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-5 h-5 animate-spin mr-2 text-slate-400" />
        <span className="text-sm text-slate-400">Memuat data review...</span>
      </div>
    )
  }

  if (error && !session) {
    return (
      <div className="p-6 max-w-xl mx-auto">
        <ErrorMsg msg={error} />
        <div className="mt-4 text-center">
          <Link href="/sessions/new"><Button variant="outline" className="gap-1.5"><ArrowLeft className="w-4 h-4" /> Kembali</Button></Link>
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
          <p className="text-sm text-slate-400 mt-1 mb-4">Upload file kasir dan mutasi bank, lalu jalankan rekonsiliasi.</p>
          <Link href="/sessions/new"><Button className="gap-1.5"><ArrowLeft className="w-4 h-4" /> Kembali ke Upload</Button></Link>
        </div>
      </div>
    )
  }

  const isReadOnly = session.status !== 'reviewing'

  const needsAttentionEntries = entries.filter(
    (e) => e.matchStatus === 'unmatched' || discByEntryId.get(e.id)?.discrepancyType === 'amount_mismatch',
  )
  const needsAttentionCount = needsAttentionEntries.length + unexpected.length
  const openDiscCount = discrepancies.filter((d) => d.status === 'open').length

  const visibleEntries = tab === 'matched'
    ? entries.filter((e) => e.matchStatus === 'matched')
    : tab === 'attention'
      ? needsAttentionEntries
      : entries

  const showUnexpected = tab === 'all' || tab === 'attention'

  // Group: bank → terminal
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
              {new Date(session.sessionDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}
            </Badge>
            {statusBadge(session.status)}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowRerunConfirm(true)} disabled={rerunning || isReadOnly} className="gap-1.5">
              {rerunning ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Memproses...</> : <><RefreshCw className="w-3.5 h-3.5" />Jalankan Ulang</>}
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={submitting || isReadOnly} className="gap-1.5">
              {submitting ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Mengirim...</> : <><Send className="w-3.5 h-3.5" />Submit TTD</>}
            </Button>
          </div>
        </div>
      </div>

      {error && <div className="mb-4"><ErrorMsg msg={error} /></div>}

      {/* ── Summary Cards ── */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <SummaryCard label="Total Kasir" amount={summary.cashierTotal} sub={`${entries.length} entri`} color="slate" />
          <SummaryCard label="Cocok dengan Bank" amount={summary.matchedAmount} sub={`${entries.filter(e => e.matchStatus === 'matched').length} entri`} color="emerald" />
          <SummaryCard label="Tidak Ada di Bank" amount={summary.unmatchedAmount} sub={`${entries.filter(e => e.matchStatus === 'unmatched').length} entri`} color="red" />
          <SummaryCard label="Nol / Lewati" amount={null} sub={`${summary.zeroCount} entri`} color="slate" count={summary.zeroCount} />
        </div>
      )}

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
            <button key={t.id} onClick={() => setTab(t.id)} className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === t.id ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700',
            )}>
              {t.label}
              <span className={cn(
                'text-[11px] font-semibold px-1.5 py-0.5 rounded-full',
                tab === t.id ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500',
                t.id === 'attention' && t.count > 0 && tab !== 'attention' && 'bg-red-100 text-red-600',
              )}>{t.count}</span>
            </button>
          ))}
        </div>

        {visibleEntries.length === 0 && (!showUnexpected || unexpected.length === 0) ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
            <CheckCircle2 className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-sm">Tidak ada entri untuk ditampilkan.</p>
          </div>
        ) : (
          <div>
            {/* ── Bank sections ── */}
            {banks.map((bank) => {
              const bankEntries = visibleEntries.filter((e) => e.bankName === bank)
              if (bankEntries.length === 0) return null

              // Sub-group by terminal
              const terminals = Array.from(new Set(bankEntries.map((e) => e.terminalCode ?? '__none__'))).sort()

              const cashierBankTotal = bankEntries.reduce((s, e) => s + Number(e.amount), 0)
              const bankCRTotal = bankEntries.reduce((s, e) => s + Number(e.bankMutation?.grossAmount ?? 0), 0)
              const bankSelisih = bankCRTotal - cashierBankTotal

              return (
                <div key={bank} className="border-b border-slate-200 last:border-0">
                  {/* Bank header */}
                  <div className={cn('px-4 py-2.5 flex items-center justify-between flex-wrap gap-2', bankHeaderBg(bank))}>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-bold text-sm">{bank}</span>
                      <span className="text-white/70 text-xs">{bankEntries.length} entri</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-white/80">
                      <span>Kasir <span className="font-semibold text-white font-mono">{formatRupiah(cashierBankTotal)}</span></span>
                      <span>Bank CR <span className="font-semibold text-white font-mono">{formatRupiah(bankCRTotal)}</span></span>
                      <span>Selisih <span className={cn('font-semibold font-mono', Math.abs(Math.round(bankSelisih)) > 0 ? 'text-red-200' : 'text-green-200')}>{formatRupiah(bankSelisih)}</span></span>
                    </div>
                  </div>

                  {/* Terminal sub-sections */}
                  {terminals.map((termKey) => {
                    const termCode = termKey === '__none__' ? null : termKey
                    const termEntries = bankEntries.filter((e) => (e.terminalCode ?? '__none__') === termKey)
                    const termCashierTotal = termEntries.reduce((s, e) => s + Number(e.amount), 0)
                    const termBankTotal = termEntries.reduce((s, e) => s + Number(e.bankMutation?.grossAmount ?? 0), 0)
                    const termSelisih = termBankTotal - termCashierTotal
                    const termMatchedCount = termEntries.filter((e) => e.matchStatus === 'matched').length
                    const termHasIssue = termEntries.some((e) => e.matchStatus === 'unmatched' || discByEntryId.get(e.id)?.discrepancyType === 'amount_mismatch')

                    return (
                      <div key={termKey} className="border-b border-slate-100 last:border-0">
                        {/* Terminal header */}
                        <div className={cn(
                          'px-4 py-1.5 flex items-center justify-between flex-wrap gap-2 border-b border-slate-100',
                          termHasIssue ? 'bg-red-50' : 'bg-slate-50',
                        )}>
                          <div className="flex items-center gap-2">
                            <span className={cn('text-xs font-bold font-mono', termHasIssue ? 'text-red-700' : 'text-slate-700')}>
                              {termCode ?? '—'}
                            </span>
                            {termHasIssue && (
                              <span className="text-[11px] font-semibold text-red-600 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" /> UNMATCHED
                              </span>
                            )}
                            <span className="text-[11px] text-slate-400">
                              {termMatchedCount}/{termEntries.length} cocok
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-slate-500">
                            <span>Kasir <span className="font-mono font-semibold text-slate-600">{formatRupiah(termCashierTotal)}</span></span>
                            <span>Bank CR <span className="font-mono font-semibold text-slate-600">{formatRupiah(termBankTotal)}</span></span>
                            <span>Selisih <span className={cn('font-mono font-semibold', Math.abs(Math.round(termSelisih)) > 0 ? 'text-red-600' : 'text-emerald-600')}>{formatRupiah(termSelisih)}</span></span>
                          </div>
                        </div>

                        {/* Column labels */}
                        <div className="grid grid-cols-[52px_1fr_12px_1fr_120px] gap-2 px-4 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wide bg-white">
                          <span>Tipe</span>
                          <span>Entri Kasir</span>
                          <span />
                          <span>Mutasi Bank</span>
                          <span className="text-right">Status</span>
                        </div>

                        {termEntries.map((entry, idx) => {
                          const disc = discByEntryId.get(entry.id) ?? null
                          const batchPeers = entry.matchedMutationId ? (batchMap.get(entry.matchedMutationId) ?? []) : []
                          const isBatched = batchPeers.length > 1
                          const batchIndex = isBatched ? batchPeers.findIndex((p) => p.id === entry.id) : -1
                          const isFirstInBatch = batchIndex === 0
                          const isSecondOrLater = batchIndex > 0

                          return (
                            <EntryRow
                              key={entry.id}
                              entry={entry}
                              discrepancy={disc}
                              sessionDate={session.sessionDate}
                              isBatched={isBatched}
                              isFirstInBatch={isFirstInBatch}
                              isSecondOrLater={isSecondOrLater}
                              batchPeers={batchPeers}
                              onResolve={setResolveTarget}
                              readOnly={isReadOnly}
                              isLast={idx === termEntries.length - 1}
                            />
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              )
            })}

            {/* ── Unexpected bank mutations ── */}
            {showUnexpected && unexpectedBanks.map((bank) => {
              const bankMuts = unexpected.filter((m) => m.bankName === bank)
              if (bankMuts.length === 0) return null
              const unexpectedTotal = bankMuts.reduce((s, m) => s + Number(m.grossAmount), 0)

              return (
                <div key={`unexp-${bank}`} className="border-b border-slate-200 last:border-0">
                  <div className="px-4 py-2 bg-orange-50 border-b border-orange-100 flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <BankBadge name={bank} />
                      <span className="text-xs text-orange-600 font-semibold">{bankMuts.length} mutasi tak terduga</span>
                    </div>
                    <span className="text-xs text-orange-700 font-mono font-semibold">{formatRupiah(unexpectedTotal)}</span>
                  </div>
                  {bankMuts.map((mut) => (
                    <UnexpectedRow
                      key={mut.id}
                      mutation={mut}
                      discrepancy={discByMutationId.get(mut.id) ?? null}
                      sessionDate={session.sessionDate}
                      onResolve={setResolveTarget}
                      readOnly={isReadOnly}
                    />
                  ))}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Dialogs ── */}
      <Dialog open={showRerunConfirm} onOpenChange={setShowRerunConfirm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Jalankan Ulang Rekonsiliasi?</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-600 mt-2">Semua hasil kecocokan dan catatan resolusi akan dihapus dan dihitung ulang.</p>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowRerunConfirm(false)}>Batal</Button>
            <Button variant="destructive" onClick={handleRerun} className="gap-1.5">
              <RefreshCw className="w-4 h-4" /> Ya, Jalankan Ulang
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {resolveTarget && (
        <ResolveDialog discrepancy={resolveTarget} open onClose={() => setResolveTarget(null)} onSaved={handleDiscUpdated} />
      )}
    </div>
  )
}

// ─── Entry Row ────────────────────────────────────────────────────────────────

function EntryRow({
  entry, discrepancy, sessionDate,
  isBatched, isFirstInBatch, isSecondOrLater, batchPeers,
  onResolve, readOnly, isLast,
}: {
  entry: CashierEntryFull
  discrepancy: Discrepancy | null
  sessionDate: string
  isBatched: boolean
  isFirstInBatch: boolean
  isSecondOrLater: boolean
  batchPeers: CashierEntryFull[]
  onResolve: (d: Discrepancy) => void
  readOnly: boolean
  isLast: boolean
}) {
  const isUnmatched = entry.matchStatus === 'unmatched'
  const isZero = entry.matchStatus === 'zero'
  const isMismatch = discrepancy?.discrepancyType === 'amount_mismatch'
  const isResolved = discrepancy?.status === 'resolved'
  const amountDiff = entry.bankMutation
    ? Number(entry.bankMutation.grossAmount) - Number(entry.amount)
    : 0

  return (
    <div className={cn(
      'grid grid-cols-[52px_1fr_12px_1fr_120px] gap-2 px-4 py-2.5 items-start text-sm border-b border-slate-50',
      isLast && 'border-0',
      isUnmatched && 'bg-red-50/40',
      isMismatch && 'bg-amber-50/40',
      isZero && 'bg-slate-50/60',
      isSecondOrLater && 'bg-blue-50/20',
    )}>
      {/* Type badge */}
      <div className="flex flex-col items-start gap-1 pt-0.5">
        <TypeBadge type={entry.paymentType} />
        {entry.sourceRow && (
          <span className="text-[9px] text-slate-400 font-mono">baris {entry.sourceRow}</span>
        )}
      </div>

      {/* Cashier side — always show all data from file */}
      <div className="min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span className={cn('font-mono font-semibold tabular-nums', isZero ? 'text-slate-400' : 'text-slate-800')}>
            {formatRupiah(entry.amount)}
          </span>
        </div>
        {/* Terminal: bankName + terminalId */}
        <p className="text-[11px] text-slate-500 font-mono mt-0.5">
          {entry.bankName}{entry.terminalId ? ` ${entry.terminalId}` : ''}
        </p>
        {entry.kasirName && (
          <p className="text-[11px] text-slate-700 mt-0.5 flex items-center gap-1">
            <span className="text-[9px] text-slate-400 uppercase font-semibold tracking-wide">kasir</span>
            {entry.kasirName}
          </p>
        )}
        {entry.entityNameRaw && (
          <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
            <span className="text-[9px] text-slate-400 uppercase font-semibold tracking-wide">entitas</span>
            {entry.entityNameRaw}
          </p>
        )}
        {entry.notaBill && (
          <p className="text-[10px] text-slate-400 font-mono mt-0.5">nota: {entry.notaBill}</p>
        )}
        {/* Batch annotation */}
        {isBatched && isFirstInBatch && batchPeers[1] && (
          <p className="text-[10px] text-blue-600 mt-0.5">
            → digabung dengan {batchPeers[1].paymentType} di bawah
          </p>
        )}
        {isBatched && isSecondOrLater && (
          <p className="text-[10px] text-blue-600 mt-0.5">
            ↑ baris bank yang sama
          </p>
        )}
      </div>

      {/* Center divider */}
      <div className="flex items-center justify-center pt-1">
        {isUnmatched
          ? <XCircle className="w-3 h-3 text-red-400" />
          : isZero
            ? <MinusCircle className="w-3 h-3 text-slate-300" />
            : <span className="text-slate-300 text-xs">⇄</span>}
      </div>

      {/* Bank side — only render when a bank mutation is actually linked */}
      <div className="min-w-0">
        {entry.bankMutation ? (
          <>
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className="font-mono font-semibold text-slate-800 tabular-nums">
                {formatRupiah(entry.bankMutation.grossAmount)}
              </span>
              {Math.abs(Math.round(amountDiff)) > 0 && (
                <span className="text-[11px] font-mono text-amber-600">
                  ({amountDiff > 0 ? '+' : ''}{formatRupiah(amountDiff)})
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span className="text-[11px] text-slate-500">
                {new Date(entry.bankMutation.transactionDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' })}
              </span>
              {settlementBadge(entry.bankMutation.transactionDate, sessionDate)}
              {isBatched && isSecondOrLater && (
                <span className="text-[10px] text-blue-600 font-medium">Baris bank sama ({formatRupiah(entry.bankMutation.grossAmount)})</span>
              )}
            </div>
            {entry.bankMutation.description && (
              <p className="text-[11px] text-slate-500 mt-0.5 truncate max-w-[280px]">{entry.bankMutation.description}</p>
            )}
            {isBatched && isFirstInBatch && batchPeers.length > 1 && (
              <p className="text-[10px] text-blue-600 mt-0.5">
                1 baris bank = {batchPeers.map((p) => `${p.paymentType} (${formatRupiah(p.amount)})`).join(' + ')}
              </p>
            )}
            {entry.bankMutation.referenceNo && (
              <p className="text-[11px] text-slate-400 font-mono mt-0.5">{entry.bankMutation.referenceNo}</p>
            )}
          </>
        ) : null}
      </div>

      {/* Status + action */}
      <div className="flex flex-col items-end gap-1 pt-0.5">
        {isZero ? (
          <span className="flex items-center gap-1 text-[11px] text-slate-400">
            <MinusCircle className="w-3.5 h-3.5" /> Nol
          </span>
        ) : isUnmatched ? (
          <>
            {isResolved ? (
              <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5" /> Diselesaikan
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[11px] text-red-600 font-semibold">
                <XCircle className="w-3.5 h-3.5" /> Tidak cocok
              </span>
            )}
            {discrepancy && !isResolved && (
              <Button size="sm" variant="outline" className="text-[11px] h-6 px-2 py-0" onClick={() => onResolve(discrepancy)} disabled={readOnly}>
                Tindak
              </Button>
            )}
            {discrepancy && isResolved && (
              <Button size="sm" variant="ghost" className="text-[11px] h-6 px-2 py-0 text-slate-400" onClick={() => onResolve(discrepancy)} disabled={readOnly}>
                Edit
              </Button>
            )}
          </>
        ) : isMismatch ? (
          <>
            {isResolved ? (
              <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5" /> Diselesaikan
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[11px] text-amber-600 font-semibold">
                <AlertTriangle className="w-3.5 h-3.5" /> Selisih
              </span>
            )}
            {discrepancy && !isResolved && (
              <Button size="sm" variant="outline" className="text-[11px] h-6 px-2 py-0" onClick={() => onResolve(discrepancy)} disabled={readOnly}>
                Tindak
              </Button>
            )}
            {discrepancy && isResolved && (
              <Button size="sm" variant="ghost" className="text-[11px] h-6 px-2 py-0 text-slate-400" onClick={() => onResolve(discrepancy)} disabled={readOnly}>
                Edit
              </Button>
            )}
          </>
        ) : isBatched ? (
          <span className="text-[11px] text-blue-600 font-semibold bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
            Batch
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5" /> Cocok
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Unexpected Row ──────────────────────────────────────────────────────────

function UnexpectedRow({ mutation, discrepancy, sessionDate, onResolve, readOnly }: {
  mutation: UnexpectedMutation
  discrepancy: Discrepancy | null
  sessionDate: string
  onResolve: (d: Discrepancy) => void
  readOnly: boolean
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-2 px-4 py-2.5 items-start text-sm border-b border-orange-50 last:border-0 bg-orange-50/20">
      <div className="min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-mono font-semibold text-slate-800 tabular-nums">{formatRupiah(mutation.grossAmount)}</span>
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-slate-500">
              {new Date(mutation.transactionDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' })}
            </span>
            {settlementBadge(mutation.transactionDate, sessionDate)}
          </div>
        </div>
        {mutation.description && <p className="text-[11px] text-slate-500 mt-0.5">{mutation.description}</p>}
        <div className="flex items-center gap-3 mt-0.5">
          {mutation.accountNumber && <span className="text-[11px] text-slate-400 font-mono">{mutation.accountNumber}</span>}
          {mutation.referenceNo && <span className="text-[11px] text-slate-400 font-mono">{mutation.referenceNo}</span>}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className="flex items-center gap-1 text-[11px] text-orange-600 font-semibold">
          <AlertCircle className="w-3.5 h-3.5" /> Tak terduga
        </span>
        {discrepancy && (
          <Button size="sm" variant="outline" className="text-[11px] h-6 px-2 py-0" onClick={() => onResolve(discrepancy)} disabled={readOnly}>
            Tindak
          </Button>
        )}
      </div>
    </div>
  )
}

// ─── Summary Card ────────────────────────────────────────────────────────────

function SummaryCard({ label, amount, sub, color, count }: {
  label: string; amount: number | null; sub: string; color: 'slate' | 'emerald' | 'red'; count?: number
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
      {amount !== null
        ? <p className={cn('text-lg font-bold font-mono leading-tight', c.value)}>{formatRupiah(amount)}</p>
        : <p className={cn('text-2xl font-bold leading-tight', c.value)}>{count ?? 0}</p>}
      <p className={cn('text-xs mt-0.5', c.label)}>{sub}</p>
    </div>
  )
}

// ─── Resolve Dialog ──────────────────────────────────────────────────────────

function ResolveDialog({ discrepancy, open, onClose, onSaved }: {
  discrepancy: Discrepancy; open: boolean; onClose: () => void; onSaved: (d: Discrepancy) => void
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
      const res = await fetch(`/api/sessions/${discrepancy.sessionId}/discrepancies/${discrepancy.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, resolutionNotes }),
      })
      if (res.ok) { onSaved(await res.json()) }
      else { const d = await res.json(); setError(d.error ?? 'Gagal menyimpan.') }
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Tindak Lanjut Diskrepansi</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="bg-slate-50 rounded-lg p-3 text-sm space-y-1">
            <p className="text-slate-600"><span className="font-medium">Tipe:</span> {discTypeLabel(discrepancy.discrepancyType)}</p>
            {discrepancy.amountDiff && (
              <p className="text-slate-600"><span className="font-medium">Selisih:</span> <span className="font-mono text-amber-600">{formatRupiah(discrepancy.amountDiff)}</span></p>
            )}
            {discrepancy.cashierEntry && (
              <p className="text-slate-500 text-xs">Kasir: {discrepancy.cashierEntry.bankName} — {discrepancy.cashierEntry.paymentType} — {formatRupiah(discrepancy.cashierEntry.amount)}</p>
            )}
            {discrepancy.bankMutation && (
              <p className="text-slate-500 text-xs">Bank: {discrepancy.bankMutation.bankName} — {formatRupiah(discrepancy.bankMutation.grossAmount)}{discrepancy.bankMutation.referenceNo && ` — ${discrepancy.bankMutation.referenceNo}`}</p>
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
            <textarea value={resolutionNotes} onChange={(e) => setResolutionNotes(e.target.value)} rows={3}
              placeholder="Jelaskan alasan atau tindakan yang diambil..."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y" />
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
