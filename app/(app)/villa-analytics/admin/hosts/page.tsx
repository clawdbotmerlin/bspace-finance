'use client'

import { useEffect, useState } from 'react'
import { Building2, Plus, Pencil, Trash2, ToggleLeft, ToggleRight, AlertCircle, CheckCircle2, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

interface VillaHost {
  id: string
  name: string
  isActive: boolean
  createdAt: string
  _count: { bookings: number }
}

export default function HostsAdminPage() {
  const [hosts, setHosts] = useState<VillaHost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Add modal
  const [addOpen, setAddOpen] = useState(false)
  const [addName, setAddName] = useState('')
  const [addError, setAddError] = useState('')
  const [addLoading, setAddLoading] = useState(false)

  // Edit modal
  const [editHost, setEditHost] = useState<VillaHost | null>(null)
  const [editName, setEditName] = useState('')
  const [editError, setEditError] = useState('')
  const [editLoading, setEditLoading] = useState(false)

  // Delete confirm
  const [deleteHost, setDeleteHost] = useState<VillaHost | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  async function fetchHosts() {
    setLoading(true)
    try {
      const res = await fetch('/api/villa/hosts')
      if (!res.ok) throw new Error('Gagal memuat data host.')
      setHosts(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Terjadi kesalahan.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchHosts() }, [])

  async function handleAdd() {
    if (!addName.trim()) { setAddError('Nama host wajib diisi.'); return }
    setAddLoading(true)
    setAddError('')
    try {
      const res = await fetch('/api/villa/hosts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: addName.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setAddError(data.error ?? 'Gagal menambahkan host.'); return }
      setAddOpen(false)
      setAddName('')
      await fetchHosts()
    } catch {
      setAddError('Terjadi kesalahan jaringan.')
    } finally {
      setAddLoading(false)
    }
  }

  async function handleEdit() {
    if (!editHost) return
    if (!editName.trim()) { setEditError('Nama host wajib diisi.'); return }
    setEditLoading(true)
    setEditError('')
    try {
      const res = await fetch(`/api/villa/hosts/${editHost.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setEditError(data.error ?? 'Gagal memperbarui host.'); return }
      setEditHost(null)
      await fetchHosts()
    } catch {
      setEditError('Terjadi kesalahan jaringan.')
    } finally {
      setEditLoading(false)
    }
  }

  async function handleToggleActive(host: VillaHost) {
    try {
      await fetch(`/api/villa/hosts/${host.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !host.isActive }),
      })
      await fetchHosts()
    } catch {
      // ignore — UI will show stale state until next refresh
    }
  }

  async function handleDelete() {
    if (!deleteHost) return
    setDeleteLoading(true)
    setDeleteError('')
    try {
      const res = await fetch(`/api/villa/hosts/${deleteHost.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) { setDeleteError(data.error ?? 'Gagal menghapus host.'); return }
      setDeleteHost(null)
      await fetchHosts()
    } catch {
      setDeleteError('Terjadi kesalahan jaringan.')
    } finally {
      setDeleteLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-800">Kelola Host</h1>
            <p className="text-sm text-slate-500 mt-0.5">Daftar organisasi host untuk Villa Analytics</p>
          </div>
        </div>
        <Button
          size="sm"
          className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
          onClick={() => { setAddName(''); setAddError(''); setAddOpen(true) }}
        >
          <Plus className="w-3.5 h-3.5" />
          Tambah Host
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 mb-4">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Memuat data…</span>
          </div>
        ) : hosts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Building2 className="w-10 h-10 mb-2 opacity-20" />
            <p className="text-sm">Belum ada host terdaftar.</p>
            <Button
              size="sm"
              className="mt-4 gap-1.5 bg-emerald-600 hover:bg-emerald-700"
              onClick={() => { setAddName(''); setAddError(''); setAddOpen(true) }}
            >
              <Plus className="w-3.5 h-3.5" /> Tambah Host Pertama
            </Button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {['Nama Host', 'Booking', 'Status', 'Aksi'].map((h) => (
                  <th
                    key={h}
                    className={cn(
                      'px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide',
                      h === 'Aksi' ? 'text-right' : 'text-left'
                    )}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hosts.map((host) => (
                <tr key={host.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-slate-800">
                    {host.name}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500">
                    {host._count.bookings.toLocaleString('id-ID')} booking
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={host.isActive ? 'success' : 'outline'}
                      className="text-[10px]"
                    >
                      {host.isActive ? 'Aktif' : 'Nonaktif'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        title={host.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                        onClick={() => handleToggleActive(host)}
                        className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        {host.isActive
                          ? <ToggleRight className="w-4 h-4 text-emerald-600" />
                          : <ToggleLeft className="w-4 h-4" />}
                      </button>
                      <button
                        title="Ubah nama"
                        onClick={() => { setEditHost(host); setEditName(host.name); setEditError('') }}
                        className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        title="Hapus"
                        onClick={() => { setDeleteHost(host); setDeleteError('') }}
                        className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                        disabled={host._count.bookings > 0}
                      >
                        <Trash2 className={cn('w-4 h-4', host._count.bookings > 0 && 'opacity-30')} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Modal */}
      <Dialog open={addOpen} onOpenChange={(v) => { if (!v) setAddOpen(false) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Plus className="w-4 h-4 text-emerald-600" />
              Tambah Host Baru
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Nama Host</label>
              <Input
                placeholder="contoh: Bracha Villas"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
                autoFocus
              />
            </div>
            {addError && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {addError}
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setAddOpen(false)} disabled={addLoading}>
                Batal
              </Button>
              <Button
                className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                onClick={handleAdd}
                disabled={addLoading || !addName.trim()}
              >
                {addLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Simpan
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Modal */}
      <Dialog open={!!editHost} onOpenChange={(v) => { if (!v) setEditHost(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Pencil className="w-4 h-4 text-slate-600" />
              Ubah Nama Host
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Nama Host</label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleEdit() }}
                autoFocus
              />
            </div>
            {editError && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {editError}
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setEditHost(null)} disabled={editLoading}>
                Batal
              </Button>
              <Button
                className="flex-1"
                onClick={handleEdit}
                disabled={editLoading || !editName.trim()}
              >
                {editLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Simpan
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Modal */}
      <Dialog open={!!deleteHost} onOpenChange={(v) => { if (!v) setDeleteHost(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-red-600">
              <Trash2 className="w-4 h-4" />
              Hapus Host
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Yakin ingin menghapus host <span className="font-semibold">{deleteHost?.name}</span>?
              Tindakan ini tidak dapat dibatalkan.
            </p>
            {deleteError && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {deleteError}
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setDeleteHost(null)} disabled={deleteLoading}>
                Batal
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={handleDelete}
                disabled={deleteLoading}
              >
                {deleteLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Hapus
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
