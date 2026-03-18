'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ClipboardCheck, Loader2, ArrowRight, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface PendingSession {
  id: string
  sessionDate: string
  status: string
  submittedAt: string | null
  outlet: { name: string; code: string }
  submitter: { name: string } | null
}

export default function SignoffQueuePage() {
  const [sessions, setSessions] = useState<PendingSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function fetchPending() {
      setLoading(true)
      setError('')
      try {
        const res = await fetch('/api/sessions')
        if (!res.ok) throw new Error('Gagal memuat data sesi.')
        const all: PendingSession[] = await res.json()
        setSessions(all.filter((s: PendingSession) => s.status === 'pending_signoff'))
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Terjadi kesalahan.')
      } finally {
        setLoading(false)
      }
    }
    fetchPending()
  }, [])

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* ── Header ── */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <ClipboardCheck className="w-5 h-5 text-blue-500" />
          <h1 className="text-xl font-semibold text-slate-800">Antrian Persetujuan</h1>
        </div>
        <p className="text-sm text-slate-500">
          Sesi rekonsiliasi yang telah disubmit dan menunggu tanda tangan.
        </p>
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          <span className="text-sm">Memuat data...</span>
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
      {!loading && !error && sessions.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <ClipboardCheck className="w-12 h-12 mb-3 opacity-20" />
          <p className="text-sm font-medium text-slate-500">
            Tidak ada sesi yang menunggu persetujuan
          </p>
          <p className="text-xs mt-1">
            Sesi yang disubmit oleh tim finance akan muncul di sini.
          </p>
        </div>
      )}

      {/* ── Table ── */}
      {!loading && !error && sessions.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Outlet
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Tanggal Sesi
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Disubmit Oleh
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Waktu Submit
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Aksi
                </th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s: PendingSession) => (
                <tr
                  key={s.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{s.outlet.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{s.outlet.code}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {new Date(s.sessionDate).toLocaleDateString('id-ID', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                      timeZone: 'UTC',
                    })}
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-xs">
                    {s.submitter?.name ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {s.submittedAt
                      ? new Date(s.submittedAt).toLocaleString('id-ID', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/sessions/${s.id}/signoff`}>
                      <Button size="sm" className="gap-1.5">
                        Tanda Tangani
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
