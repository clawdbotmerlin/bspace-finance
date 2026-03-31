'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, CheckCircle2, XCircle, AlertTriangle, MinusCircle,
  RefreshCw, Send, Loader2, AlertCircle, Banknote, Tag, EyeOff,
  Upload, Trash2, PlusCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { cn, formatRupiah } from '@/lib/utils'

// ─── Tooltip ─────────────────────────────────────────────────────────────────

function Tooltip({ children, content, wide }: { children: React.ReactNode; content: React.ReactNode; wide?: boolean }) {
  const [visible, setVisible] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function show() { timer.current = setTimeout(() => setVisible(true), 700) }
  function hide() { if (timer.current) clearTimeout(timer.current); setVisible(false) }

  return (
    <div className="relative inline-block" onMouseEnter={show} onMouseLeave={hide}>
      {children}
      {visible && (
        <div className={cn(
          'absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none',
          wide ? 'w-64' : 'w-max max-w-[220px]',
        )}>
          <div className="bg-slate-900 text-white text-[11px] rounded-lg px-3 py-2 shadow-xl leading-relaxed">
            {content}
          </div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-[5px] border-transparent border-t-slate-900" />
        </div>
      )}
    </div>
  )
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface SessionDetail {
  id: string; outletId: string; sessionDate: string; status: string
  outlet: { name: string; code: string }
}
interface BankMutationLinked {
  id: string; bankName: string; accountNumber: string | null
  transactionDate: string; grossAmount: string; netAmount: string | null
  mdrAmount: string | null; description: string | null; referenceNo: string | null; direction: string
}
interface CashierEntryFull {
  id: string; bankName: string; terminalCode: string | null; terminalId: string | null
  paymentType: string; amount: string; notaBill: string | null; entityNameRaw: string | null
  kasirName: string | null; perKasirAmounts: Record<string, number> | null
  blockType: string; sourceRow: number | null; matchStatus: string
  matchedMutationId: string | null; bankMutation: BankMutationLinked | null
}
interface UnexpectedMutation {
  id: string; bankName: string; accountNumber: string | null; transactionDate: string
  grossAmount: string; description: string | null; referenceNo: string | null
  direction: string; matchStatus: string
}
interface MatchSummary {
  cashierTotal: number; matchedAmount: number; unmatchedAmount: number
  zeroCount: number; unexpectedCount: number
}
interface Discrepancy {
  id: string; sessionId: string; cashierEntryId: string | null; bankMutationId: string | null
  discrepancyType: string; amountDiff: string | null; notes: string | null
  status: string; resolvedBy: string | null; resolutionNotes: string | null
  cashierEntry: { bankName: string; terminalId: string | null; terminalCode: string | null; paymentType: string; amount: string; entityNameRaw: string | null } | null
  bankMutation: { bankName: string; accountNumber: string | null; grossAmount: string; description: string | null; referenceNo: string | null; direction: string } | null
}
type ReviewTab = 'all' | 'attention' | 'matched'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    QR: 'bg-violet-100 text-violet-700 border-violet-200',
    DEBIT: 'bg-blue-100 text-blue-700 border-blue-200',
    KK: 'bg-pink-100 text-pink-700 border-pink-200',
    CASH: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    VOUCHER: 'bg-amber-100 text-amber-700 border-amber-200',
  }
  return (
    <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded border w-[46px] text-center inline-block', colors[type] ?? 'bg-slate-100 text-slate-600 border-slate-200')}>
      {type}
    </span>
  )
}

function settlementBadge(transactionDate: string, sessionDate: string) {
  const diff = Math.round((new Date(transactionDate).getTime() - new Date(sessionDate).getTime()) / 86400000)
  const cls = diff === 0 ? 'bg-emerald-100 text-emerald-700' : diff === 1 ? 'bg-blue-100 text-blue-700' : diff === 2 ? 'bg-violet-100 text-violet-700' : diff < 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
  return <span className={cn('text-[9px] font-bold px-1 py-0.5 rounded', cls)}>{diff >= 0 ? `T+${diff}` : `T${diff}`}</span>
}

function bankHeaderBg(name: string) {
  const u = name.toUpperCase()
  if (u === 'BCA') return 'bg-blue-600'
  if (u === 'MANDIRI') return 'bg-yellow-500'
  if (u === 'BNI') return 'bg-orange-500'
  if (u === 'BRI') return 'bg-sky-600'
  return 'bg-slate-600'
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
    missing_in_bank: 'Tidak ada di bank', unexpected_bank_entry: 'Mutasi tak terduga',
    amount_mismatch: 'Selisih jumlah', prior_period_settlement: 'Periode lalu',
    duplicate: 'Duplikat', other: 'Lainnya',
  }
  return map[type] ?? type
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function ReviewPage() {
  const params = useParams()
  const router = useRouter()
  const sessionId = params.id as string

  const [session, setSession] = useState<SessionDetail | null>(null)
  const [entries, setEntries] = useState<CashierEntryFull[]>([])
  const [kasirNames, setKasirNames] = useState<string[]>([])
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

  // Upload mutation state
  const [showUploadMutation, setShowUploadMutation] = useState(false)
  const [uploadBank, setUploadBank] = useState('BCA')
  const [uploadFiles, setUploadFiles] = useState<FileList | null>(null)
  const [uploadBusy, setUploadBusy] = useState(false)
  const [uploadMsg, setUploadMsg] = useState('')

  // Delete session state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const discByEntryId = useMemo(
    () => new Map(discrepancies.filter(d => d.cashierEntryId).map(d => [d.cashierEntryId!, d])),
    [discrepancies]
  )
  const discByMutationId = useMemo(
    () => new Map(discrepancies.filter(d => d.bankMutationId).map(d => [d.bankMutationId!, d])),
    [discrepancies]
  )

  async function fetchAll() {
    setLoading(true); setError('')
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
      setKasirNames(mData.kasirNames ?? [])
      setUnexpected(mData.unexpectedMutations ?? [])
      setSummary(mData.summary ?? null)
      setDiscrepancies(dData)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan.')
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchAll() }, [sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRerun() {
    setShowRerunConfirm(false); setRerunning(true)
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
      setSession((await res.json()).session)
    } finally { setSubmitting(false) }
  }

  function handleDiscUpdated(updated: Discrepancy) {
    setDiscrepancies(prev => prev.map(d => d.id === updated.id ? updated : d))
    setResolveTarget(null)
  }

  const [ignoringIds, setIgnoringIds] = useState<Set<string>>(new Set())
  const [ignoringAll, setIgnoringAll] = useState(false)

  async function handleIgnoreDisc(disc: Discrepancy) {
    setIgnoringIds(prev => new Set(prev).add(disc.id))
    const res = await fetch(`/api/sessions/${disc.sessionId}/discrepancies/${disc.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ignored', resolutionNotes: 'Diabaikan' }),
    })
    setIgnoringIds(prev => { const s = new Set(prev); s.delete(disc.id); return s })
    if (res.ok) { const updated = await res.json(); handleDiscUpdated(updated) }
  }

  async function handleIgnoreAll() {
    setIgnoringAll(true)
    const res = await fetch(`/api/sessions/${sessionId}/discrepancies`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'ignore_all' }),
    })
    setIgnoringAll(false)
    if (res.ok) { const updated: Discrepancy[] = await res.json(); setDiscrepancies(updated) }
  }

  async function handleUploadMutation() {
    if (!uploadFiles || uploadFiles.length === 0) return
    setUploadBusy(true); setUploadMsg('')
    try {
      let totalParsed = 0
      for (let i = 0; i < uploadFiles.length; i++) {
        const fd = new FormData()
        fd.append('file', uploadFiles[i])
        fd.append('bankName', uploadBank)
        fd.append('append', 'true') // always append — never replace existing mutations
        const res = await fetch(`/api/sessions/${sessionId}/upload/bankmutation`, { method: 'POST', body: fd })
        if (!res.ok) { const d = await res.json(); setUploadMsg(`Gagal: ${d.error ?? 'Upload error'}`); return }
        const d = await res.json()
        totalParsed += d.parsed ?? 0
      }
      setShowUploadMutation(false)
      setUploadFiles(null)
      setUploadMsg('')
      // Auto-rerun matching after upload
      setRerunning(true)
      try {
        const res = await fetch(`/api/sessions/${sessionId}/run-matching`, { method: 'POST' })
        if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Rekonsiliasi ulang gagal.') }
        await fetchAll()
      } finally { setRerunning(false) }
    } finally { setUploadBusy(false) }
  }

  async function handleDeleteSession() {
    setDeleting(true)
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? 'Gagal menghapus sesi.')
        setShowDeleteConfirm(false)
        return
      }
      router.push('/history')
    } finally { setDeleting(false) }
  }

  if (loading) return (
    <div className="p-6 flex items-center justify-center min-h-[60vh]">
      <Loader2 className="w-5 h-5 animate-spin mr-2 text-slate-400" />
      <span className="text-sm text-slate-400">Memuat data review...</span>
    </div>
  )
  if (error && !session) return (
    <div className="p-6 max-w-xl mx-auto">
      <ErrorMsg msg={error} />
      <div className="mt-4 text-center">
        <Link href="/sessions/new"><Button variant="outline" className="gap-1.5"><ArrowLeft className="w-4 h-4" />Kembali</Button></Link>
      </div>
    </div>
  )
  if (!session) return null
  if (session.status === 'uploading') return (
    <div className="p-6 max-w-xl mx-auto text-center">
      <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm">
        <AlertCircle className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-600 font-medium">Sesi masih dalam tahap upload</p>
        <p className="text-sm text-slate-400 mt-1 mb-4">Upload file kasir dan mutasi bank, lalu jalankan rekonsiliasi.</p>
        <Link href="/sessions/new"><Button className="gap-1.5"><ArrowLeft className="w-4 h-4" />Kembali ke Upload</Button></Link>
      </div>
    </div>
  )

  const isReadOnly = session.status !== 'reviewing'
  // Only count missing_in_bank as requiring action — these are sales with no bank transfer (high alert)
  const openDiscCount = discrepancies.filter(d => d.status === 'open' && d.discrepancyType === 'missing_in_bank').length

  // Separate EDC entries from CASH/VOUCHER
  const edcEntries = entries.filter(e => e.paymentType !== 'CASH' && e.paymentType !== 'VOUCHER')
  const cashEntries = entries.filter(e => e.paymentType === 'CASH' || e.paymentType === 'VOUCHER')

  // Tab filtering (only affects EDC display)
  const needsAttentionEntries = edcEntries.filter(
    e => e.matchStatus === 'unmatched' || discByEntryId.get(e.id)?.discrepancyType === 'amount_mismatch'
  )
  const needsAttentionCount = needsAttentionEntries.length + unexpected.length
  const matchedEntries = edcEntries.filter(e => e.matchStatus === 'matched')

  const filteredEdcEntries = tab === 'matched' ? matchedEntries
    : tab === 'attention' ? needsAttentionEntries
    : edcEntries

  const TABS: { id: ReviewTab; label: string; count: number }[] = [
    { id: 'all', label: 'Semua Entri', count: edcEntries.length + cashEntries.length + unexpected.length },
    { id: 'attention', label: 'Perlu Perhatian', count: needsAttentionCount },
    { id: 'matched', label: 'Cocok Saja', count: matchedEntries.length },
  ]

  const blocks: Array<'REG' | 'EV'> = Array.from(new Set(entries.map(e => e.blockType as 'REG' | 'EV'))).sort((a, b) => a === 'REG' ? -1 : 1)

  return (
    <div className="p-4 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          <Link href="/history" className="text-slate-400 hover:text-slate-600"><ArrowLeft className="w-4 h-4" /></Link>
          <h1 className="text-xl font-semibold text-slate-800">Review Rekonsiliasi</h1>
        </div>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="font-medium">{session.outlet.name}</Badge>
            <Badge variant="outline">{new Date(session.sessionDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}</Badge>
            {statusBadge(session.status)}
          </div>
          <div className="flex items-center gap-2">
            {!isReadOnly && (
              <Button variant="outline" size="sm" onClick={() => { setShowUploadMutation(true); setUploadMsg('') }} className="gap-1.5 text-blue-600 border-blue-200 hover:bg-blue-50">
                <PlusCircle className="w-3.5 h-3.5" />
                Tambah Mutasi
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setShowRerunConfirm(true)} disabled={rerunning || isReadOnly} className="gap-1.5">
              {rerunning ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Memproses...</> : <><RefreshCw className="w-3.5 h-3.5" />Jalankan Ulang</>}
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={submitting || isReadOnly} className="gap-1.5">
              {submitting ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Mengirim...</> : <><Send className="w-3.5 h-3.5" />Submit TTD</>}
            </Button>
            {session.status !== 'signed_off' && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="text-slate-400 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-md border border-slate-200 hover:border-red-200 transition-colors"
                title="Hapus sesi"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {error && <div className="mb-3"><ErrorMsg msg={error} /></div>}

      {/* Summary Cards */}
      {summary && (() => {
        const cashCount = cashEntries.filter(e => e.paymentType === 'CASH').length
        const voucherCount = cashEntries.filter(e => e.paymentType === 'VOUCHER').length
        // Compute unmatched EDC consistently from client-side entries (amount + count use same filter)
        const unmatchedEdcEntries = edcEntries.filter(e => e.matchStatus === 'unmatched')
        const unmatchedEdcCount = unmatchedEdcEntries.length
        const unmatchedEdcAmount = unmatchedEdcEntries.reduce((s, e) => s + Number(e.amount), 0)
        // zeroCount from API may be stale; compute from entries directly
        const zeroEntries = entries.filter(e => e.matchStatus === 'zero')
        const edcZeroCount = zeroEntries.filter(e => e.paymentType !== 'CASH' && e.paymentType !== 'VOUCHER').length
        const matchRate = edcEntries.length > 0 ? Math.round(matchedEntries.length / edcEntries.length * 100) : 0
        // Total: EDC matched + EDC unmatched + EDC zero (true EDC picture)
        const edcTotal = edcEntries.reduce((s, e) => s + Number(e.amount), 0)
        const cashTotal = cashEntries.reduce((s, e) => s + Number(e.amount), 0)
        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <SummaryCard
              label="Total Kasir" amount={summary.cashierTotal}
              sub={`${edcEntries.length} EDC · ${cashCount} kas · ${voucherCount} voucher`}
              color="slate"
              tooltip={<>
                <div className="font-semibold mb-1">Total transaksi di file kasir</div>
                <div className="space-y-0.5 text-slate-300">
                  <div>• {formatRupiah(edcTotal)} dari {edcEntries.length} entri EDC</div>
                  <div>• {formatRupiah(cashTotal)} dari {cashCount} kas & {voucherCount} voucher</div>
                </div>
              </>}
            />
            <SummaryCard
              label="Cocok dengan Bank" amount={summary.matchedAmount}
              sub={`${matchedEntries.length} dari ${edcEntries.length} EDC (${matchRate}%)`}
              color="emerald"
              tooltip={<>
                <div className="font-semibold mb-1">Entri yang cocok dengan mutasi bank</div>
                <div className="text-slate-300">{matchedEntries.length} entri EDC berhasil dicocokkan dari total {edcEntries.length} entri.</div>
              </>}
            />
            <SummaryCard
              label="Tidak Ada di Bank" amount={unmatchedEdcAmount}
              sub={`${unmatchedEdcCount} entri EDC tanpa mutasi`}
              color={unmatchedEdcCount > 0 ? 'red' : 'slate'}
              tooltip={<>
                <div className="font-semibold mb-1">Penjualan EDC tanpa transfer bank</div>
                <div className="text-slate-300">{unmatchedEdcCount > 0
                  ? `${unmatchedEdcCount} entri kasir tidak ditemukan di mutasi bank. Perlu investigasi — bisa jadi fraud, transfer fiktif, atau belum settle.`
                  : 'Semua entri EDC sudah memiliki mutasi bank yang cocok.'
                }</div>
              </>}
            />
            <SummaryCard
              label="Nol / Lewati" amount={null} count={zeroEntries.length}
              sub={`${edcZeroCount > 0 ? `${edcZeroCount} EDC nol · ` : ''}${cashCount} kas · ${voucherCount} voucher`}
              color="slate"
              tooltip={<>
                <div className="font-semibold mb-1">Entri yang tidak perlu pencocokan bank</div>
                <div className="space-y-0.5 text-slate-300">
                  {edcZeroCount > 0 && <div>• {edcZeroCount} entri EDC dengan nilai Rp 0</div>}
                  <div>• {cashCount} kas fisik (tidak melalui bank)</div>
                  <div>• {voucherCount} voucher (tidak melalui bank)</div>
                </div>
              </>}
            />
          </div>
        )
      })()}

      {openDiscCount > 0 ? (
        <div className="mb-3 flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-2.5 text-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span><strong>{openDiscCount} entri kasir</strong> tidak ditemukan di mutasi bank — harap ditindaklanjuti sebelum submit</span>
          </div>
          {!isReadOnly && (
            <button
              onClick={handleIgnoreAll}
              disabled={ignoringAll}
              className="shrink-0 flex items-center gap-1.5 text-xs font-medium text-amber-700 border border-amber-300 rounded-md px-2.5 py-1 hover:bg-amber-100 transition-colors disabled:opacity-50"
            >
              {ignoringAll ? <Loader2 className="w-3 h-3 animate-spin" /> : <EyeOff className="w-3 h-3" />}
              Abaikan Semua
            </button>
          )}
        </div>
      ) : entries.length > 0 && (
        <div className="mb-3 flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg px-4 py-2.5 text-sm">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span><strong>Semua entri kasir</strong> memiliki mutasi bank yang cocok — sesi siap untuk disubmit</span>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="flex border-b border-slate-200">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === t.id ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700',
            )}>
              {t.label}
              <span className={cn('text-[11px] font-semibold px-1.5 py-0.5 rounded-full',
                tab === t.id ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500',
                t.id === 'attention' && t.count > 0 && tab !== 'attention' && 'bg-red-100 text-red-600',
              )}>{t.count}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <CheckCircle2 className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-sm">Belum ada data rekonsiliasi.</p>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {blocks.map(block => (
              <div key={block} className="space-y-3">
                {/* Block breakdown card */}
                <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                  <BlockSection
                    block={block}
                    session={session}
                    kasirNames={kasirNames}
                    filteredEdcEntries={filteredEdcEntries.filter(e => e.blockType === block)}
                    allEdcEntries={edcEntries.filter(e => e.blockType === block)}
                    cashEntries={cashEntries.filter(e => e.blockType === block)}
                    discByEntryId={discByEntryId}
                    tab={tab}
                    isReadOnly={isReadOnly}
                    onResolve={setResolveTarget}
                    onIgnore={handleIgnoreDisc}
                    ignoringIds={ignoringIds}
                  />
                </div>
                {/* Ringkasan immediately follows its block */}
                <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                  <RingkasanSection
                    block={block}
                    kasirNames={kasirNames}
                    allEntries={entries.filter(e => e.blockType === block)}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Unexpected mutations — outside main card */}
      {(tab === 'all' || tab === 'attention') && entries.length > 0 && unexpected.length > 0 && (
        <div className="mt-4 rounded-xl border border-orange-200 overflow-hidden shadow-sm">
          <UnexpectedSection
            unexpected={unexpected}
            session={session}
          />
        </div>
      )}

      {/* Dialogs */}
      <Dialog open={showRerunConfirm} onOpenChange={setShowRerunConfirm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Jalankan Ulang Rekonsiliasi?</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-600 mt-2">Semua hasil kecocokan dan catatan resolusi akan dihapus dan dihitung ulang.</p>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowRerunConfirm(false)}>Batal</Button>
            <Button variant="destructive" onClick={handleRerun} className="gap-1.5"><RefreshCw className="w-4 h-4" />Ya, Jalankan Ulang</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {resolveTarget && (
        <ResolveDialog discrepancy={resolveTarget} open onClose={() => setResolveTarget(null)} onSaved={handleDiscUpdated} />
      )}

      {/* Upload Mutation Dialog */}
      <Dialog open={showUploadMutation} onOpenChange={(v) => { if (!uploadBusy) { setShowUploadMutation(v); setUploadMsg('') } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-4 h-4 text-blue-600" />
              Tambah File Mutasi Bank
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-500 -mt-1">Upload file mutasi tambahan yang terlewat. Mutasi lama tetap disimpan. Rekonsiliasi akan dijalankan ulang otomatis setelah upload.</p>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Nama Bank</Label>
              <Select value={uploadBank} onValueChange={setUploadBank} disabled={uploadBusy}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="BCA">BCA</SelectItem>
                  <SelectItem value="BNI">BNI</SelectItem>
                  <SelectItem value="BRI">BRI</SelectItem>
                  <SelectItem value="MANDIRI">MANDIRI</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>File Mutasi</Label>
              <input
                type="file"
                multiple
                accept=".xlsx,.xls,.csv"
                disabled={uploadBusy}
                onChange={(e) => setUploadFiles(e.target.files)}
                className="w-full text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-slate-200 file:bg-slate-50 file:text-slate-700 file:text-xs hover:file:bg-slate-100 cursor-pointer"
              />
              <p className="text-[11px] text-slate-400">Format: .xlsx, .xls, atau .csv — boleh pilih lebih dari 1 file</p>
            </div>
            {uploadMsg && (
              <p className={cn('text-sm rounded-lg px-3 py-2', uploadMsg.startsWith('Gagal') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700')}>
                {uploadMsg}
              </p>
            )}
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => { setShowUploadMutation(false); setUploadMsg('') }} disabled={uploadBusy}>Batal</Button>
            <Button onClick={handleUploadMutation} disabled={uploadBusy || !uploadFiles || uploadFiles.length === 0} className="gap-1.5">
              {uploadBusy ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Mengupload...</> : <><Upload className="w-3.5 h-3.5" />Upload & Rekonsiliasi Ulang</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Session Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={(v) => { if (!deleting) setShowDeleteConfirm(v) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="w-4 h-4" />
              Hapus Sesi Rekonsiliasi?
            </DialogTitle>
          </DialogHeader>
          <div className="mt-2 space-y-3">
            <div className="bg-slate-50 rounded-lg p-3 text-sm space-y-1 text-slate-600">
              <p><span className="font-medium">Outlet:</span> {session.outlet.name}</p>
              <p><span className="font-medium">Tanggal:</span> {new Date(session.sessionDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}</p>
            </div>
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Semua data kasir, mutasi bank, dan diskrepansi untuk sesi ini akan ikut terhapus secara permanen dan tidak bisa dikembalikan.</span>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)} disabled={deleting}>Batal</Button>
            <Button variant="destructive" onClick={handleDeleteSession} disabled={deleting} className="gap-1.5">
              {deleting ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Menghapus...</> : <><Trash2 className="w-3.5 h-3.5" />Ya, Hapus Sesi</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Block Section ────────────────────────────────────────────────────────────

function BlockSection({ block, session, kasirNames, filteredEdcEntries, allEdcEntries, cashEntries, discByEntryId, tab, isReadOnly, onResolve, onIgnore, ignoringIds }: {
  block: 'REG' | 'EV'
  session: SessionDetail
  kasirNames: string[]
  filteredEdcEntries: CashierEntryFull[]
  allEdcEntries: CashierEntryFull[]
  cashEntries: CashierEntryFull[]
  discByEntryId: Map<string, Discrepancy>
  tab: ReviewTab
  isReadOnly: boolean
  onResolve: (d: Discrepancy) => void
  onIgnore: (d: Discrepancy) => void
  ignoringIds: Set<string>
}) {
  const blockLabel = block === 'REG' ? '📋 REG' : '🎪 EV'
  const blockColor = block === 'REG' ? 'bg-blue-700' : 'bg-violet-700'

  // Subtotals from ALL entries (not filtered)
  const subtotalByKasir: Record<string, number> = {}
  for (const k of kasirNames) subtotalByKasir[k] = 0
  for (const e of [...allEdcEntries, ...cashEntries]) {
    for (const k of kasirNames) {
      subtotalByKasir[k] = (subtotalByKasir[k] ?? 0) + (e.perKasirAmounts?.[k] ?? 0)
    }
  }
  const subtotalTotal = [...allEdcEntries, ...cashEntries].reduce((s, e) => s + Number(e.amount), 0)

  // Banks in this block (EDC entries only)
  const banks = Array.from(new Set(filteredEdcEntries.map(e => e.bankName))).sort()
  const allBanks = Array.from(new Set(allEdcEntries.map(e => e.bankName))).sort()

  const showCash = tab === 'all'

  // If nothing to show
  if (filteredEdcEntries.length === 0 && !showCash) return null

  return (
    <div>
      {/* Block header */}
      <div className={cn('px-4 py-2 flex items-center justify-between', blockColor)}>
        <span className="text-white font-bold text-sm">{blockLabel} — {new Date(session.sessionDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}</span>
        <span className="text-white/70 text-xs">
          SUBTOTAL: <span className="text-white font-semibold">{formatRupiah(subtotalTotal)}</span>
          &nbsp;·&nbsp; {allEdcEntries.length} entri EDC
          {cashEntries.length > 0 && ` + ${cashEntries.length} kas/voucher`}
        </span>
      </div>

      {/* Per-bank EDC sections */}
      <div className="p-3 space-y-3">
      {(tab === 'all' ? allBanks : banks).map(bank => {
        const bankFiltered = filteredEdcEntries.filter(e => e.bankName === bank)
        const bankAll = allEdcEntries.filter(e => e.bankName === bank)
        const displayEntries = tab === 'all' ? bankAll : bankFiltered
        if (displayEntries.length === 0) return null

        const kasirTotal = bankAll.reduce((s, e) => s + Number(e.amount), 0)
        const bankCRTotal = bankAll.reduce((s, e) => s + Number(e.bankMutation?.grossAmount ?? 0), 0)
        const selisih = bankCRTotal - kasirTotal

        return (
          <div key={bank} className="rounded-lg border border-slate-200 overflow-hidden shadow-sm">
            {/* Bank section header */}
            <div className={cn('px-4 py-2 flex items-center justify-between text-xs', bankSectionBg(bank))}>
              <span className={cn('font-bold text-sm', bankTextColor(bank))}>{bank} <span className="font-normal text-slate-400">{bankAll.length} entri</span></span>
              <div className="flex items-center gap-4 text-slate-500">
                <span>Kasir <span className="font-semibold text-slate-700">{formatRupiah(kasirTotal)}</span></span>
                <span>Bank CR <span className="font-semibold text-slate-700">{formatRupiah(bankCRTotal)}</span></span>
                <span>Selisih <span className={cn('font-semibold', Math.abs(Math.round(selisih)) > 0 ? 'text-red-600' : 'text-emerald-600')}>{formatRupiah(selisih)}</span></span>
              </div>
            </div>

            {/* Scrollable table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse" style={{ minWidth: `${480 + kasirNames.length * 90}px` }}>
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-3 py-1.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide w-16">Kode</th>
                    <th className="px-3 py-1.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide w-36">Bank / Terminal</th>
                    <th className="px-3 py-1.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide w-14">Jenis</th>
                    <th className="px-3 py-1.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide w-40">Entitas</th>
                    {kasirNames.map(k => (
                      <th key={k} className="px-2 py-1.5 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wide w-20">{k}</th>
                    ))}
                    <th className="px-3 py-1.5 text-right text-[10px] font-semibold text-slate-600 uppercase tracking-wide w-24 bg-slate-200">Total</th>
                    <th className="px-3 py-1.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide w-44">Status Bank</th>
                  </tr>
                </thead>
                <tbody>
                  {displayEntries.map((entry, idx) => {
                    const disc = discByEntryId.get(entry.id) ?? null
                    const isLast = idx === displayEntries.length - 1
                    return (
                      <EntryRow
                        key={entry.id}
                        entry={entry}
                        kasirNames={kasirNames}
                        discrepancy={disc}
                        sessionDate={session.sessionDate}
                        onResolve={onResolve}
                        onIgnore={onIgnore}
                        ignoringIds={ignoringIds}
                        readOnly={isReadOnly}
                        isLast={isLast}
                      />
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
      </div>{/* end space-y-3 bank cards */}

      {/* CASH / VOUCHER rows */}
      {showCash && cashEntries.length > 0 && (
        <div className="px-3 pb-3">
          <div className="rounded-lg border border-slate-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse" style={{ minWidth: `${480 + kasirNames.length * 90}px` }}>
                <tbody>
                  {cashEntries.map(entry => (
                    <tr key={entry.id} className={cn('border-b border-slate-50 last:border-0', entry.paymentType === 'CASH' ? 'bg-emerald-50/50' : 'bg-amber-50/50')}>
                      <td className="px-3 py-2 w-16 text-slate-500 text-[11px] font-mono">—</td>
                      <td className="px-3 py-2 w-36">
                        <div className="flex items-center gap-1 flex-wrap">
                          <TypeBadge type={entry.paymentType} />
                          {entry.paymentType === 'VOUCHER' && entry.terminalId && (
                            <span className="text-[10px] font-medium text-amber-700">{entry.terminalId}</span>
                          )}
                        </div>
                        {entry.paymentType === 'VOUCHER' && entry.terminalCode && (
                          <div className="text-[10px] font-mono text-slate-500 mt-0.5">{entry.terminalCode}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 w-14" />
                      <td className="px-3 py-2 w-40 text-[11px] text-slate-600">{entry.entityNameRaw !== '-' ? entry.entityNameRaw : ''}</td>
                      {kasirNames.map(k => {
                        const amt = entry.perKasirAmounts?.[k] ?? 0
                        return (
                          <td key={k} className={cn('px-2 py-2 w-20 text-right text-[12px] font-mono tabular-nums', amt > 0 ? 'font-semibold text-slate-800' : 'text-slate-300')}>
                            {amt > 0 ? formatRupiah(amt) : '—'}
                          </td>
                        )
                      })}
                      <td className="px-3 py-2 w-24 text-right text-[12px] font-mono font-bold tabular-nums text-slate-700 bg-slate-100">{formatRupiah(entry.amount)}</td>
                      <td className="px-3 py-2 w-44">
                        <span className={cn('text-[11px] flex items-center gap-1', entry.paymentType === 'CASH' ? 'text-emerald-600' : 'text-amber-600')}>
                          {entry.paymentType === 'CASH' ? <><Banknote className="w-3.5 h-3.5" />Kas Fisik</> : <><Tag className="w-3.5 h-3.5" />Voucher</>}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUBTOTAL row */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse" style={{ minWidth: `${480 + kasirNames.length * 90}px` }}>
          <tbody>
            <tr className="bg-slate-800">
              <td className="px-3 py-2 w-16" />
              <td className="px-3 py-2 w-36 text-white text-[11px] font-bold tracking-wide">SUBTOTAL — {block}</td>
              <td className="px-3 py-2 w-14" /><td className="px-3 py-2 w-40" />
              {kasirNames.map(k => (
                <td key={k} className="px-2 py-2 w-20 text-right text-[12px] font-mono font-semibold text-white tabular-nums">
                  {subtotalByKasir[k] > 0 ? formatRupiah(subtotalByKasir[k]) : '0'}
                </td>
              ))}
              <td className="px-3 py-2 w-24 text-right text-[12px] font-mono font-bold text-white tabular-nums">{formatRupiah(subtotalTotal)}</td>
              <td className="px-3 py-2 w-44" />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Entry Row ────────────────────────────────────────────────────────────────

function EntryRow({ entry, kasirNames, discrepancy, sessionDate, onResolve, onIgnore, ignoringIds, readOnly, isLast }: {
  entry: CashierEntryFull
  kasirNames: string[]
  discrepancy: Discrepancy | null
  sessionDate: string
  onResolve: (d: Discrepancy) => void
  onIgnore: (d: Discrepancy) => void
  ignoringIds: Set<string>
  readOnly: boolean
  isLast: boolean
}) {
  const isZero = entry.matchStatus === 'zero'
  const isUnmatched = entry.matchStatus === 'unmatched'
  const isMismatch = discrepancy?.discrepancyType === 'amount_mismatch'
  const isMatched = entry.matchStatus === 'matched'
  const discResolved = discrepancy?.status === 'resolved' || discrepancy?.status === 'ignored'
  const discIgnored  = discrepancy?.status === 'ignored'
  const isIgnoring   = discrepancy ? ignoringIds.has(discrepancy.id) : false

  const rowBg = isUnmatched && !discResolved ? 'bg-red-50/60' : isMismatch && !discResolved ? 'bg-amber-50/60' : isZero ? 'bg-slate-50/80' : ''

  return (
    <tr className={cn('border-b border-slate-100 hover:brightness-[0.97] hover:bg-slate-100/60 transition-colors cursor-default', isLast && 'border-0', rowBg)}>
      {/* Kode */}
      <td className="px-3 py-2 w-16">
        <span className="text-[11px] font-mono text-slate-500">{entry.terminalCode ?? '—'}</span>
        {entry.sourceRow && <div className="text-[9px] text-slate-500">baris {entry.sourceRow}</div>}
      </td>

      {/* Bank / Terminal */}
      <td className="px-3 py-2 w-36">
        <span className="text-[12px] font-semibold text-slate-800">{entry.bankName}</span>
        {entry.terminalId && <span className="text-[11px] text-slate-500 ml-1">{entry.terminalId}</span>}
      </td>

      {/* Jenis */}
      <td className="px-3 py-2 w-14"><TypeBadge type={entry.paymentType} /></td>

      {/* Entitas */}
      <td className="px-3 py-2 w-40">
        {entry.entityNameRaw ? (
          <Tooltip content={entry.entityNameRaw}>
            <div className="text-[11px] text-slate-600 leading-tight truncate max-w-[150px] cursor-default">{entry.entityNameRaw}</div>
          </Tooltip>
        ) : null}
        {entry.notaBill && <div className="text-[10px] text-slate-500 font-mono">nota: {entry.notaBill}</div>}
      </td>

      {/* Per-kasir amounts */}
      {kasirNames.map(k => {
        const amt = entry.perKasirAmounts?.[k] ?? 0
        return (
          <td key={k} className={cn('px-2 py-2 w-20 text-right text-[12px] font-mono tabular-nums', amt > 0 ? 'font-semibold text-slate-800' : 'text-slate-300')}>
            {amt > 0 ? formatRupiah(amt) : '—'}
          </td>
        )
      })}

      {/* Total */}
      <td className={cn('px-3 py-2 w-24 text-right text-[12px] font-mono font-bold tabular-nums bg-slate-100', isZero ? 'text-slate-400' : 'text-slate-800')}>
        {Number(entry.amount) > 0 ? formatRupiah(entry.amount) : '—'}
      </td>

      {/* Status Bank */}
      <td className="px-3 py-2 w-44">
        {isMatched && entry.bankMutation ? (
          <div>
            <div className="flex items-center gap-1 text-[11px] text-emerald-600 font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" />Cocok
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {formatRupiah(entry.bankMutation.grossAmount)} · {new Date(entry.bankMutation.transactionDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' })} {settlementBadge(entry.bankMutation.transactionDate, sessionDate)}
            </div>
            {entry.bankMutation.description && (
              <Tooltip content={entry.bankMutation.description}>
                <div className="text-[10px] text-slate-500 truncate max-w-[160px] cursor-default">{entry.bankMutation.description}</div>
              </Tooltip>
            )}
          </div>
        ) : isMismatch && entry.bankMutation ? (
          <div>
            <div className="flex items-center gap-1 text-[11px] text-amber-600 font-semibold">
              <AlertTriangle className="w-3.5 h-3.5" />Selisih
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              Bank: {formatRupiah(entry.bankMutation.grossAmount)} · {settlementBadge(entry.bankMutation.transactionDate, sessionDate)}
            </div>
            {!discResolved && discrepancy && (
              <div className="flex items-center gap-1 mt-1">
                <Button size="sm" variant="outline" className="text-[11px] h-6 px-2 py-0" onClick={() => onResolve(discrepancy)} disabled={readOnly}>Tindak</Button>
                <Button size="sm" variant="ghost" className="text-[11px] h-6 px-2 py-0 text-slate-400 hover:text-slate-600" onClick={() => onIgnore(discrepancy)} disabled={readOnly || isIgnoring}>
                  {isIgnoring ? <Loader2 className="w-3 h-3 animate-spin" /> : <EyeOff className="w-3 h-3" />}
                </Button>
              </div>
            )}
            {discIgnored && <span className="text-[11px] text-slate-400 font-medium mt-1 flex items-center gap-1"><EyeOff className="w-3 h-3" />Diabaikan</span>}
            {discResolved && !discIgnored && <span className="text-[11px] text-emerald-600 font-semibold mt-1 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Selesai</span>}
          </div>
        ) : isUnmatched ? (
          <div>
            <div className="flex items-center gap-1 text-[11px] text-red-600 font-semibold">
              <XCircle className="w-3.5 h-3.5" />Tidak cocok
            </div>
            {!discResolved && discrepancy && (
              <div className="flex items-center gap-1 mt-1">
                <Button size="sm" variant="outline" className="text-[11px] h-6 px-2 py-0" onClick={() => onResolve(discrepancy)} disabled={readOnly}>Tindak</Button>
                <Button size="sm" variant="ghost" className="text-[11px] h-6 px-2 py-0 text-slate-400 hover:text-slate-600" onClick={() => onIgnore(discrepancy)} disabled={readOnly || isIgnoring}>
                  {isIgnoring ? <Loader2 className="w-3 h-3 animate-spin" /> : <EyeOff className="w-3 h-3" />}
                </Button>
              </div>
            )}
            {discIgnored && <span className="text-[11px] text-slate-400 font-medium mt-1 flex items-center gap-1"><EyeOff className="w-3 h-3" />Diabaikan</span>}
            {discResolved && !discIgnored && <span className="text-[11px] text-emerald-600 font-semibold mt-1 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Selesai</span>}
          </div>
        ) : (
          <div className="flex items-center gap-1 text-[11px] text-slate-400">
            <MinusCircle className="w-3.5 h-3.5" />Nol
          </div>
        )}
      </td>
    </tr>
  )
}

// ─── Ringkasan Kasir Section ──────────────────────────────────────────────────

function RingkasanSection({ block, kasirNames, allEntries }: {
  block: 'REG' | 'EV'; kasirNames: string[]; allEntries: CashierEntryFull[]
}) {
  if (kasirNames.length === 0) return null

  // Compute per-kasir, per-bank totals
  const banks = ['BCA', 'BNI', 'BRI', 'MANDIRI', 'VOUCHER']
  type KasirTotals = { totalSales: number; cash: number; totalPayment: number; [key: string]: number }
  const totals: Record<string, KasirTotals> = {}
  for (const k of kasirNames) {
    totals[k] = { totalSales: 0, cash: 0, totalPayment: 0, BCA: 0, BNI: 0, BRI: 0, MANDIRI: 0, VOUCHER: 0 }
  }

  for (const entry of allEntries) {
    for (const k of kasirNames) {
      const amt = entry.perKasirAmounts?.[k] ?? 0
      if (amt <= 0) continue
      if (entry.paymentType === 'CASH') {
        totals[k].cash += amt
      } else if (entry.bankName === 'VOUCHER') {
        totals[k].VOUCHER += amt
      } else if (banks.includes(entry.bankName)) {
        totals[k][entry.bankName] = (totals[k][entry.bankName] ?? 0) + amt
      }
      totals[k].totalSales += amt
    }
  }
  for (const k of kasirNames) {
    totals[k].totalPayment = totals[k].totalSales
  }

  const RingRow = ({ label, getVal, highlight, bold, indent, yellow }: {
    label: string; getVal: (k: string) => number | null
    highlight?: 'green' | 'red' | 'yellow'; bold?: boolean; indent?: boolean; yellow?: boolean
  }) => {
    const rowBg = yellow ? 'bg-yellow-50' : highlight === 'green' ? 'bg-emerald-50' : highlight === 'red' ? 'bg-red-50' : ''
    return (
      <tr className={cn('border-b border-slate-100 last:border-0', rowBg)}>
        <td className={cn('px-4 py-1.5 text-[11px] w-56 border-r border-slate-100', indent ? 'pl-8 text-slate-500' : bold ? 'font-semibold text-slate-700' : 'text-slate-600', yellow && 'text-amber-700')}>
          {label}
        </td>
        {kasirNames.map(k => {
          const val = getVal(k)
          const isNeg = val !== null && val < 0
          return (
            <td key={k} className={cn('px-4 py-1.5 text-right text-[12px] font-mono tabular-nums border-r border-slate-100',
              bold ? 'font-bold' : '',
              yellow ? 'text-amber-700 bg-yellow-50' : highlight === 'green' ? 'text-emerald-700' : isNeg ? 'text-red-600 font-bold' : 'text-slate-700',
            )}>
              {val === null ? <span className="text-slate-300 font-normal">—</span> : val === 0 && yellow ? <span className="text-slate-300 font-normal">—</span> : formatRupiah(val)}
            </td>
          )
        })}
      </tr>
    )
  }

  return (
    <div>
      <div className="bg-slate-800 px-4 py-2 flex items-center justify-between">
        <span className="text-white font-bold text-sm">📊 Ringkasan Kasir — {block}</span>
        <span className="text-slate-400 text-[10px]">Baris kuning = input manual (tidak tersedia) · Baris hijau = formula otomatis</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ minWidth: `${224 + kasirNames.length * 120}px` }}>
          <thead>
            <tr className="bg-slate-100 border-b border-slate-200">
              <th className="px-4 py-2 text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wide w-56 border-r border-slate-200" />
              {kasirNames.map(k => (
                <th key={k} className="px-4 py-2 text-center text-[11px] font-bold text-slate-700 border-r border-slate-200">{k}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <RingRow label="TOTAL SALES (EDC + CASH)" getVal={k => totals[k]?.totalSales ?? 0} highlight="green" bold />
            <RingRow label="TOTAL DI REKAP QUINOS ← input dari sistem POS" getVal={() => null} yellow />
            <RingRow label="TOTAL DI SETTLEMENT BANK ← jumlah transaksi (bukan Rp)" getVal={() => null} yellow />
            {banks.map(bank => (
              <RingRow key={bank} label={bank} getVal={k => totals[k]?.[bank] ?? 0} indent />
            ))}
            <RingRow label="TOTAL CASH" getVal={k => totals[k]?.cash ?? 0} bold />
            <RingRow label="TOTAL PAYMENT (bank + cash)" getVal={k => totals[k]?.totalPayment ?? 0} bold />
            <RingRow
              label="SELISIH (harus = 0, jika tidak nol → ada perbedaan)"
              getVal={k => (totals[k]?.totalSales ?? 0) - (totals[k]?.totalPayment ?? 0)}
              highlight="red"
              bold
            />
            <RingRow label="TOTAL BILL ← jumlah struk per kasir (angka bulat)" getVal={() => null} yellow />
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Unexpected Section ───────────────────────────────────────────────────────

function UnexpectedSection({ unexpected, session }: {
  unexpected: UnexpectedMutation[]
  session: SessionDetail
}) {
  const total = unexpected.reduce((s, m) => s + Number(m.grossAmount), 0)
  const banks = Array.from(new Set(unexpected.map(m => m.bankName))).sort()

  return (
    <div>
      <div className="bg-orange-50 border-t-2 border-orange-400 px-4 py-2 flex items-center justify-between">
        <span className="text-orange-700 font-semibold text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />{unexpected.length} mutasi tak terduga (ada di bank, tidak ada di kasir)
        </span>
        <span className="text-orange-700 font-mono font-semibold text-sm">{formatRupiah(total)}</span>
      </div>
      {banks.map(bank => {
        const muts = unexpected.filter(m => m.bankName === bank)
        const bankTotal = muts.reduce((s, m) => s + Number(m.grossAmount), 0)
        return (
          <div key={bank} className="border-b border-orange-50 last:border-0">
            <div className={cn('px-4 py-1.5 flex items-center justify-between text-xs', bankSectionBg(bank))}>
              <span className={cn('font-bold', bankTextColor(bank))}>{bank} <span className="font-normal text-slate-400">{muts.length} mutasi</span></span>
              <span className="font-mono font-semibold text-slate-600">{formatRupiah(bankTotal)}</span>
            </div>
            {muts.map(mut => {
              return (
                <div key={mut.id} className="grid grid-cols-[1fr_auto] gap-2 px-4 py-2 items-start border-b border-orange-50/80 last:border-0 bg-orange-50/20 hover:brightness-[0.97] hover:bg-orange-50/60 transition-colors cursor-default">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-semibold text-slate-800 tabular-nums text-sm">{formatRupiah(mut.grossAmount)}</span>
                      <span className="text-[11px] text-slate-500">
                        {new Date(mut.transactionDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' })}
                      </span>
                      {settlementBadge(mut.transactionDate, session.sessionDate)}
                    </div>
                    {mut.description && <p className="text-[11px] text-slate-500 mt-0.5">{mut.description}</p>}
                    <div className="flex gap-3 mt-0.5">
                      {mut.accountNumber && <span className="text-[10px] text-slate-400 font-mono">{mut.accountNumber}</span>}
                      {mut.referenceNo && <span className="text-[10px] text-slate-400 font-mono">{mut.referenceNo}</span>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="flex items-center gap-1 text-[11px] text-orange-500 font-semibold">
                      <AlertCircle className="w-3.5 h-3.5" />Tak terduga
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

// ─── Bank style helpers ───────────────────────────────────────────────────────

function bankSectionBg(name: string) {
  const u = name.toUpperCase()
  if (u === 'BCA') return 'bg-blue-50 border-b border-blue-100'
  if (u === 'MANDIRI') return 'bg-yellow-50 border-b border-yellow-100'
  if (u === 'BNI') return 'bg-orange-50 border-b border-orange-100'
  if (u === 'BRI') return 'bg-sky-50 border-b border-sky-100'
  return 'bg-slate-50 border-b border-slate-100'
}

function bankTextColor(name: string) {
  const u = name.toUpperCase()
  if (u === 'BCA') return 'text-blue-700'
  if (u === 'MANDIRI') return 'text-yellow-700'
  if (u === 'BNI') return 'text-orange-700'
  if (u === 'BRI') return 'text-sky-700'
  return 'text-slate-700'
}

// ─── Summary Card ─────────────────────────────────────────────────────────────

function SummaryCard({ label, amount, sub, color, count, tooltip }: {
  label: string; amount: number | null; sub: string; color: 'slate' | 'emerald' | 'red'; count?: number; tooltip?: React.ReactNode
}) {
  const colors = { slate: { value: 'text-slate-700', label: 'text-slate-500' }, emerald: { value: 'text-emerald-700', label: 'text-emerald-600' }, red: { value: 'text-red-700', label: 'text-red-500' } }
  const c = colors[color]
  const inner = (
    <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm w-full cursor-default">
      <p className="text-xs text-slate-500 font-medium mb-1">{label}</p>
      {amount !== null ? <p className={cn('text-lg font-bold font-mono leading-tight', c.value)}>{formatRupiah(amount)}</p>
        : <p className={cn('text-2xl font-bold leading-tight', c.value)}>{count ?? 0}</p>}
      <p className={cn('text-xs mt-0.5', c.label)}>{sub}</p>
    </div>
  )
  if (!tooltip) return inner
  return <Tooltip content={tooltip} wide>{inner}</Tooltip>
}

// ─── Resolve Dialog ───────────────────────────────────────────────────────────

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
    e.preventDefault(); setSaving(true); setError('')
    try {
      const res = await fetch(`/api/sessions/${discrepancy.sessionId}/discrepancies/${discrepancy.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, resolutionNotes }),
      })
      if (res.ok) { onSaved(await res.json()) }
      else { const d = await res.json(); setError(d.error ?? 'Gagal menyimpan.') }
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
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
                <SelectItem value="ignored">Diabaikan</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Catatan Resolusi</Label>
            <textarea value={resolutionNotes} onChange={e => setResolutionNotes(e.target.value)} rows={3}
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

// ─── Error Msg ────────────────────────────────────────────────────────────────

function ErrorMsg({ msg }: { msg: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3">
      <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
      <p className="text-sm text-red-700">{msg}</p>
    </div>
  )
}

// suppress unused import warning for bankHeaderBg
void bankHeaderBg
