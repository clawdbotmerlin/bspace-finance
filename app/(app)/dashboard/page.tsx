'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import {
  CheckCircle2, ClipboardCheck, RefreshCw, FileText,
  Receipt, Landmark, TrendingUp, Loader2, AlertCircle,
  Eye, ArrowRight, Plus,
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
  outlet: { name: string; code: string }
  submitter: { name: string } | null
  _count: { cashierEntries: number; bankMutations: number }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  const map: Record<string, { variant: 'warning' | 'info' | 'success' | 'outline'; label: string }> = {
    uploading: { variant: 'outline', label: 'Uploading' },
    reviewing: { variant: 'warning', label: 'Review' },
    pending_signoff: { variant: 'info', label: 'Menunggu TTD' },
    signed_off: { variant: 'success', label: 'Selesai' },
  }
  const s = map[status] ?? { variant: 'outline' as const, label: status }
  return <Badge variant={s.variant} className="text-[11px]">{s.label}</Badge>
}

function RecentActionCell({ s }: { s: SessionRow }) {
  if (s.status === 'reviewing') {
    return (
      <Link href={`/sessions/${s.id}/review`}>
        <Button size="sm" variant="outline" className="gap-1 text-xs h-7 px-2">
          <Eye className="w-3 h-3" /> Review
        </Button>
      </Link>
    )
  }
  if (s.status === 'pending_signoff') {
    return (
      <Link href={`/sessions/${s.id}/signoff`}>
        <Button size="sm" className="gap-1 text-xs h-7 px-2">
          <ClipboardCheck className="w-3 h-3" /> TTD
        </Button>
      </Link>
    )
  }
  if (s.status === 'signed_off') {
    return (
      <Link href={`/sessions/${s.id}/signoff`}>
        <Button size="sm" variant="outline" className="gap-1 text-xs h-7 px-2">
          <Eye className="w-3 h-3" /> Lihat
        </Button>
      </Link>
    )
  }
  return <span className="text-xs text-slate-300">—</span>
}

// ─── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, icon: Icon, scheme, onClick,
}: {
  label: string
  value: number | string
  sub?: string
  icon: React.ComponentType<{ className?: string }>
  scheme: 'slate' | 'emerald' | 'blue' | 'amber' | 'indigo' | 'violet'
  onClick?: () => void
}) {
  const colors: Record<string, { bg: string; icon: string; value: string; border: string }> = {
    slate:   { bg: 'bg-slate-50',   icon: 'text-slate-400',   value: 'text-slate-700',   border: 'border-slate-200' },
    emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-500', value: 'text-emerald-700', border: 'border-emerald-200' },
    blue:    { bg: 'bg-blue-50',    icon: 'text-blue-500',    value: 'text-blue-700',    border: 'border-blue-200' },
    amber:   { bg: 'bg-amber-50',   icon: 'text-amber-500',   value: 'text-amber-700',   border: 'border-amber-200' },
    indigo:  { bg: 'bg-indigo-50',  icon: 'text-indigo-500',  value: 'text-indigo-700',  border: 'border-indigo-200' },
    violet:  { bg: 'bg-violet-50',  icon: 'text-violet-500',  value: 'text-violet-700',  border: 'border-violet-200' },
  }
  const c = colors[scheme]
  return (
    <div
      className={cn(
        'rounded-xl border p-5 shadow-sm transition-all',
        c.bg, c.border,
        onClick ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5' : '',
      )}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</span>
        <Icon className={cn('w-4 h-4', c.icon)} />
      </div>
      <p className={cn('text-3xl font-bold leading-none', c.value)}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1.5">{sub}</p>}
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function fetchSessions() {
      setLoading(true)
      setError('')
      try {
        const res = await fetch('/api/sessions')
        if (!res.ok) throw new Error('Gagal memuat data.')
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

  const stats = useMemo(() => {
    const total = sessions.length
    const signedOff = sessions.filter((s: SessionRow) => s.status === 'signed_off').length
    const pendingSignoff = sessions.filter((s: SessionRow) => s.status === 'pending_signoff').length
    const reviewing = sessions.filter((s: SessionRow) => s.status === 'reviewing').length
    const totalKasir = sessions.reduce((acc: number, s: SessionRow) => acc + s._count.cashierEntries, 0)
    const totalBank = sessions.reduce((acc: number, s: SessionRow) => acc + s._count.bankMutations, 0)
    const completionRate = total > 0 ? Math.round((signedOff / total) * 100) : 0
    return { total, signedOff, pendingSignoff, reviewing, totalKasir, totalBank, completionRate }
  }, [sessions])

  // Most recent 8 (API returns desc by date already)
  const recentSessions = sessions.slice(0, 8)

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* ── Header ── */}
      <div className="mb-7 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">Ringkasan rekonsiliasi keuangan.</p>
        </div>
        <Link href="/sessions/new">
          <Button size="sm" className="gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Rekonsiliasi Baru
          </Button>
        </Link>
      </div>

      {/* ── Error ── */}
      {!loading && error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 mb-6">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* ── Loading skeleton ── */}
      {loading && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="rounded-xl border border-slate-200 bg-slate-50 p-5 h-28 animate-pulse" />
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="rounded-xl border border-slate-200 bg-slate-50 p-5 h-28 animate-pulse" />
            ))}
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 h-64 animate-pulse" />
        </div>
      )}

      {!loading && !error && (
        <>
          {/* ── Row 1: Session status counts ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <StatCard
              label="Total Sesi"
              value={stats.total}
              sub="Semua waktu"
              icon={FileText}
              scheme="slate"
            />
            <StatCard
              label="Selesai"
              value={stats.signedOff}
              sub={stats.total > 0 ? `${stats.completionRate}% dari total` : 'Belum ada sesi'}
              icon={CheckCircle2}
              scheme="emerald"
            />
            <StatCard
              label="Menunggu TTD"
              value={stats.pendingSignoff}
              sub={stats.pendingSignoff > 0 ? 'Perlu tanda tangan' : 'Tidak ada antrian'}
              icon={ClipboardCheck}
              scheme="blue"
            />
            <StatCard
              label="Dalam Review"
              value={stats.reviewing}
              sub={stats.reviewing > 0 ? 'Perlu ditinjau' : 'Tidak ada'}
              icon={RefreshCw}
              scheme="amber"
            />
          </div>

          {/* ── Row 2: Volume aggregates ── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-7">
            <StatCard
              label="Total Entri Kasir"
              value={stats.totalKasir.toLocaleString('id-ID')}
              sub="Akumulasi semua sesi"
              icon={Receipt}
              scheme="indigo"
            />
            <StatCard
              label="Total Mutasi Bank"
              value={stats.totalBank.toLocaleString('id-ID')}
              sub="Akumulasi semua sesi"
              icon={Landmark}
              scheme="violet"
            />
            <StatCard
              label="Tingkat Penyelesaian"
              value={`${stats.completionRate}%`}
              sub={`${stats.signedOff} dari ${stats.total} sesi selesai`}
              icon={TrendingUp}
              scheme="emerald"
            />
          </div>

          {/* ── Attention banner: items needing action ── */}
          {(stats.pendingSignoff > 0 || stats.reviewing > 0) && (
            <div className="mb-6 bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 text-blue-500 shrink-0" />
                <p className="text-sm text-blue-700">
                  {stats.pendingSignoff > 0 && (
                    <><span className="font-semibold">{stats.pendingSignoff} sesi</span> menunggu tanda tangan</>
                  )}
                  {stats.pendingSignoff > 0 && stats.reviewing > 0 && ' · '}
                  {stats.reviewing > 0 && (
                    <><span className="font-semibold">{stats.reviewing} sesi</span> dalam review</>
                  )}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                {stats.pendingSignoff > 0 && (
                  <Link href="/signoff">
                    <Button size="sm" className="gap-1 text-xs h-7">
                      Tanda Tangani <ArrowRight className="w-3 h-3" />
                    </Button>
                  </Link>
                )}
                {stats.reviewing > 0 && (
                  <Link href="/history">
                    <Button size="sm" variant="outline" className="gap-1 text-xs h-7">
                      Lihat Review <ArrowRight className="w-3 h-3" />
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          )}

          {/* ── Recent Sessions ── */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">Sesi Terbaru</h2>
              <Link href="/history" className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1">
                Lihat semua <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            {recentSessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                <FileText className="w-10 h-10 mb-2 opacity-20" />
                <p className="text-sm">Belum ada sesi rekonsiliasi.</p>
                <Link href="/sessions/new">
                  <Button size="sm" className="mt-3 gap-1.5">
                    <Plus className="w-3.5 h-3.5" /> Buat Sesi Pertama
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Tanggal</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Outlet</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Blok</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">Kasir</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">Bank</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentSessions.map((s: SessionRow) => (
                      <tr
                        key={s.id}
                        className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70 transition-colors"
                      >
                        <td className="px-4 py-3 text-slate-700 text-xs font-medium whitespace-nowrap">
                          {new Date(s.sessionDate).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'short',
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
                        <td className="px-4 py-3 text-right">
                          <RecentActionCell s={s} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
