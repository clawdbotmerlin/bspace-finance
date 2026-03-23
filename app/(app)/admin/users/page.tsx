'use client'

import { useEffect, useState } from 'react'
import { Plus, Pencil, UserX, UserCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

type Role = 'admin' | 'finance' | 'manager'

interface User {
  id: string
  name: string
  email: string
  role: Role
  isActive: boolean
  createdAt: string
  outlet?: { name: string } | null
}

const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrator',
  finance: 'Finance Staff',
  manager: 'Finance Head',
}

const ROLE_DESC: Record<Role, string> = {
  admin: 'Akses penuh — kelola pengguna, data master, dan semua fitur',
  finance: 'Upload kasir, jalankan rekonsiliasi, submit untuk persetujuan',
  manager: 'Tinjau dan tandatangani laporan rekonsiliasi',
}

const ROLE_VARIANTS: Record<Role, 'default' | 'secondary' | 'outline'> = {
  admin: 'default',
  manager: 'secondary',
  finance: 'outline',
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [editUser, setEditUser] = useState<User | null>(null)

  async function fetchUsers() {
    const res = await fetch('/api/users')
    if (res.ok) setUsers(await res.json())
    setLoading(false)
  }

  useEffect(() => { fetchUsers() }, [])

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Pengguna</h1>
          <p className="text-slate-500 text-sm mt-0.5">Kelola akun pengguna dan hak akses.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Tambah Pengguna
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50 text-slate-600 text-left">
              <th className="px-4 py-3 font-medium">Nama</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Outlet</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium w-24">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">Memuat...</td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">Belum ada pengguna.</td>
              </tr>
            ) : users.map((user) => (
              <tr key={user.id} className={cn('border-b last:border-0', !user.isActive && 'opacity-50')}>
                <td className="px-4 py-3 font-medium text-slate-800">{user.name}</td>
                <td className="px-4 py-3 text-slate-600">{user.email}</td>
                <td className="px-4 py-3">
                  <Badge variant={ROLE_VARIANTS[user.role]}>{ROLE_LABELS[user.role]}</Badge>
                  <p className="text-[10px] text-slate-400 mt-0.5 max-w-[180px] leading-tight">{ROLE_DESC[user.role]}</p>
                </td>
                <td className="px-4 py-3 text-slate-500">{user.outlet?.name ?? '—'}</td>
                <td className="px-4 py-3">
                  {user.isActive
                    ? <Badge variant="success">Aktif</Badge>
                    : <Badge variant="outline">Nonaktif</Badge>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setEditUser(user)}
                      className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-700"
                      title="Edit role"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => toggleActive(user)}
                      className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-700"
                      title={user.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                    >
                      {user.isActive
                        ? <UserX className="h-3.5 w-3.5" />
                        : <UserCheck className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create modal */}
      <CreateUserDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => { setCreateOpen(false); fetchUsers() }}
      />

      {/* Edit role modal */}
      {editUser && (
        <EditRoleDialog
          user={editUser}
          onClose={() => setEditUser(null)}
          onSaved={() => { setEditUser(null); fetchUsers() }}
        />
      )}
    </div>
  )

  async function toggleActive(user: User) {
    await fetch(`/api/users/${user.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !user.isActive }),
    })
    fetchUsers()
  }
}

// ─── Create User Dialog ───────────────────────────────────────────────────────

function CreateUserDialog({ open, onClose, onCreated }: {
  open: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('finance')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, role }),
    })
    setSaving(false)
    if (res.ok) {
      setName(''); setEmail(''); setPassword(''); setRole('finance')
      onCreated()
    } else {
      const data = await res.json()
      setError(data.error ?? 'Gagal membuat pengguna.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tambah Pengguna Baru</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>Nama Lengkap</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="John Doe" />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="john@bspace.com" />
          </div>
          <div className="space-y-1.5">
            <Label>Password Sementara</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="Min. 6 karakter" minLength={6} />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Administrator</SelectItem>
                <SelectItem value="manager">Finance Head</SelectItem>
                <SelectItem value="finance">Finance Staff</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Menyimpan...' : 'Buat Pengguna'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Edit Role Dialog ─────────────────────────────────────────────────────────

function EditRoleDialog({ user, onClose, onSaved }: {
  user: User
  onClose: () => void
  onSaved: () => void
}) {
  const [role, setRole] = useState<Role>(user.role)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    await fetch(`/api/users/${user.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    })
    setSaving(false)
    onSaved()
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit Role — {user.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5 mt-2">
          <Label>Role</Label>
          <Select value={role} onValueChange={(v) => setRole(v as Role)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Administrator</SelectItem>
              <SelectItem value="manager">Finance Head</SelectItem>
              <SelectItem value="finance">Finance Staff</SelectItem>
            </SelectContent>
          </Select>
          {role && <p className="text-[11px] text-slate-500 mt-1">{ROLE_DESC[role]}</p>}
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
