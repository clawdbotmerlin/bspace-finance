'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  ScrollText, ChevronLeft, ChevronRight, RotateCcw, Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────────────────────────

interface AuditEntry {
  id: string
  action: string
  entityType: string | null
  entityId: string | null
  payloadSummary: string | null
  sessionId: string | null
  createdAt: string
  user: {
    name: string
    email: string
    role: string
  } | null
}

interface AuditResponse {
  logs: AuditEntry[]
  total: number
  page: number
  pages: number
  limit: number
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  submit_for_signoff: 'Submit Tanda Tangan',
  signoff_approved:   'Tanda Tangan Disetujui',
  signoff_rejected:   'Tanda Tangan Ditolak',
}

const ACTION_OPTIONS = [
  { value: '', label: 'Semua Aksi' },
  { value: 'submit_for_signoff', label: 'Submit Tanda Tangan' },
  { value: 'signoff_approved',   label: 'Tanda Tangan Disetujui' },
  { value: 'signoff_rejected',   label: 'Tanda Tangan Ditolak' },
]

const ENTITY_OPTIONS = [
  { value: '',                      label: 'Semua Entitas' },
  { value: 'ReconciliationSession', label: 'Sesi Rekonsiliasi' },
]

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin', finance: 'Finance', manager: 'Manager',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action
}

function actionBadgeVariant(action: string): 'success' | 'destructive' | 'info' | 'outline' {
  if (action === 'signoff_approved') return 'success'
  if (action === 'signoff_rejected') return 'destructive'
  if (action === 'submit_for_signoff') return 'info'
  return 'outline'
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    timeZone: 'Asia/Jakarta',
  })
}

function truncate(s: string | null | undefined, max = 60): string {
  if (!s) return '—'
  return s.length > max ? s.slice(0, max) + '…' : s
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function AuditLogPage() {
  // Filter state
  const [action, setAction]         = useState('')
  const [entityType, setEntityType] = useState('')
  const [dateFrom, setDateFrom]     = useState('')
  const [dateTo, setDateTo]         = useState('')

  // Pagination state
  const [page, setPage]   = useState(1)

  // Data state
  const [data, setData]       = useState<AuditResponse | null>(null)
  const [loading, setLoading] = useState(true)

  // ── Fetch ──
  const fetchLogs = useCallback(async (pg: number) => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(pg), limit: '25' })
    if (action)     params.set('action', action)
    if (entityType) params.set('entityType', entityType)
    if (dateFrom)   params.set('dateFrom', dateFrom)
    if (dateTo)     params.set('dateTo', dateTo)

    const res = await fetch(`/api/audit-logs?${params.toString()}`)
    if (res.ok) setData(await res.json())
    setLoading(false)
  }, [action, entityType, dateFrom, dateTo])

  useEffect(() => {
    setPage(1)
    fetchLogs(1)
  }, [fetchLogs])

  function handlePageChange(next: number) {
    setPage(next)
    fetchLogs(next)
  }

  function handleReset() {
    setAction('')
    setEntityType('')
    setDateFrom('')
    setDateTo('')
    setPage(1)
  }

  const hasFilter = !!(action || entityType || dateFrom || dateTo)

  return (
    <div className="p-6 max-w-7xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <ScrollText className="w-5 h-5 text-slate-500" />
            <h1 className="text-xl font-bold text-slate-800">Log Audit</h1>
          </div>
          <p className="text-slate-500 text-sm">Rekaman seluruh aktivitas sistem yang dapat diaudit.</p>
        </div>
        {data && (
          <span className="text-xs text-slate-400 mt-1">
            {data.total.toLocaleString('id-ID')} entri
          </span>
        )}
      </div>

      {/* ── Filter Bar ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4">
        <div className="flex flex-wrap gap-3 items-end">

          {/* Action filter */}
          <div className="flex flex-col gap-1 min-w-[200px]">
            <label className="text-xs font-medium text-slate-600">Aksi</label>
            <select
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="h-9 rounded-md border border-slate-200 px-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {ACTION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Entity type filter */}
          <div className="flex flex-col gap-1 min-w-[180px]">
            <label className="text-xs font-medium text-slate-600">Tipe Entitas</label>
            <select
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
              className="h-9 rounded-md border border-slate-200 px-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {ENTITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

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
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                  Waktu
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Pengguna
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Aksi
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Tipe Entitas
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  ID Entitas
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Ringkasan
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center">
                    <div className="flex items-center justify-center gap-2 text-slate-400">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm">Memuat log...</span>
                    </div>
                  </td>
                </tr>
              ) : !data || data.logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <ScrollText className="w-8 h-8 opacity-30" />
                      <p className="text-sm">
                        {hasFilter ? 'Tidak ada log yang sesuai filter.' : 'Belum ada log audit.'}
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
                data.logs.map((log: AuditEntry) => (
                  <tr key={log.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">

                    {/* Waktu */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-xs text-slate-600 font-mono">
                        {fmtDateTime(log.createdAt)}
                      </span>
                    </td>

                    {/* Pengguna */}
                    <td className="px-4 py-3">
                      {log.user ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs font-medium text-slate-700">{log.user.name}</span>
                          <span className="text-[10px] text-slate-400">
                            {ROLE_LABELS[log.user.role] ?? log.user.role}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">Sistem</span>
                      )}
                    </td>

                    {/* Aksi */}
                    <td className="px-4 py-3">
                      <Badge
                        variant={actionBadgeVariant(log.action)}
                        className="text-[11px] whitespace-nowrap"
                      >
                        {actionLabel(log.action)}
                      </Badge>
                    </td>

                    {/* Tipe Entitas */}
                    <td className="px-4 py-3">
                      {log.entityType ? (
                        <span className="text-xs text-slate-600">
                          {log.entityType === 'ReconciliationSession'
                            ? 'Sesi Rekonsiliasi'
                            : log.entityType}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>

                    {/* ID Entitas */}
                    <td className="px-4 py-3">
                      {log.sessionId ? (
                        <a
                          href={`/sessions/${log.sessionId}/signoff`}
                          className="text-[11px] font-mono text-blue-600 hover:text-blue-800 hover:underline"
                          title={log.entityId ?? log.sessionId}
                        >
                          {truncate(log.entityId ?? log.sessionId, 14)}
                        </a>
                      ) : log.entityId ? (
                        <span
                          className="text-[11px] font-mono text-slate-500"
                          title={log.entityId}
                        >
                          {truncate(log.entityId, 14)}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>

                    {/* Ringkasan */}
                    <td className="px-4 py-3 max-w-[240px]">
                      {log.payloadSummary ? (
                        <span
                          className="text-xs text-slate-600 italic"
                          title={log.payloadSummary}
                        >
                          {truncate(log.payloadSummary, 80)}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>

                  </tr>
                ))
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

    </div>
  )
}
