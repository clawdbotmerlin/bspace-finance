'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, Pencil, Building2, Store, CreditCard } from 'lucide-react'
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

// ─── Types ────────────────────────────────────────────────────────────────────

interface Entity {
  id: string
  legalName: string
  shortName: string
  isActive: boolean
  _count: { outlets: number }
}

interface Outlet {
  id: string
  name: string
  code: string
  address: string | null
  isActive: boolean
  entityId: string
  entityName: string
  terminalCount: number
}

interface EdcTerminal {
  id: string
  terminalCode: string
  bankLabel: string
  terminalId: string
  accountNumber: string | null
  isActive: boolean
  outletId: string
  outletName: string
  outletCode: string
}

type Tab = 'entities' | 'outlets' | 'terminals'

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MasterDataPage() {
  const [tab, setTab] = useState<Tab>('entities')
  const [entities, setEntities] = useState<Entity[]>([])
  const [outlets, setOutlets] = useState<Outlet[]>([])
  const [terminals, setTerminals] = useState<EdcTerminal[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [e, o, t] = await Promise.all([
      fetch('/api/entities').then((r) => r.json()),
      fetch('/api/outlets').then((r) => r.json()),
      fetch('/api/edc-terminals').then((r) => r.json()),
    ])
    setEntities(e)
    setOutlets(o)
    setTerminals(t)
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }>; count: number }[] = [
    { id: 'entities', label: 'Entitas', icon: Building2, count: entities.length },
    { id: 'outlets', label: 'Outlet', icon: Store, count: outlets.length },
    { id: 'terminals', label: 'Terminal EDC', icon: CreditCard, count: terminals.length },
  ]

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Data Master</h1>
        <p className="text-slate-500 text-sm mt-0.5">Kelola entitas, outlet, dan terminal EDC.</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-0 border-b border-slate-200 mb-6">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === t.id
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            )}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
            <span className={cn(
              'text-[11px] font-semibold px-1.5 py-0.5 rounded-full',
              tab === t.id ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'
            )}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400">Memuat...</div>
      ) : (
        <>
          {tab === 'entities' && (
            <EntitiesTab entities={entities} onRefresh={fetchAll} />
          )}
          {tab === 'outlets' && (
            <OutletsTab outlets={outlets} entities={entities} onRefresh={fetchAll} />
          )}
          {tab === 'terminals' && (
            <TerminalsTab terminals={terminals} outlets={outlets} onRefresh={fetchAll} />
          )}
        </>
      )}
    </div>
  )
}

// ─── Entities Tab ─────────────────────────────────────────────────────────────

function EntitiesTab({ entities, onRefresh }: { entities: Entity[]; onRefresh: () => void }) {
  const [createOpen, setCreateOpen] = useState(false)
  const [editEntity, setEditEntity] = useState<Entity | null>(null)

  async function toggleActive(e: Entity) {
    await fetch(`/api/entities/${e.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !e.isActive }),
    })
    onRefresh()
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-500">{entities.length} entitas terdaftar</p>
        <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Tambah Entitas
        </Button>
      </div>

      <div className="rounded-lg border bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50 text-slate-600 text-left">
              <th className="px-4 py-3 font-medium">Nama Legal</th>
              <th className="px-4 py-3 font-medium">Nama Singkat</th>
              <th className="px-4 py-3 font-medium">Outlet</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium w-20">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {entities.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Belum ada entitas.</td></tr>
            ) : entities.map((e) => (
              <tr key={e.id} className={cn('border-b last:border-0', !e.isActive && 'opacity-50')}>
                <td className="px-4 py-3 font-medium text-slate-800">{e.legalName}</td>
                <td className="px-4 py-3 text-slate-600">{e.shortName}</td>
                <td className="px-4 py-3 text-slate-500">{e._count.outlets} outlet</td>
                <td className="px-4 py-3">
                  <Badge variant={e.isActive ? 'success' : 'outline'}>
                    {e.isActive ? 'Aktif' : 'Nonaktif'}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button onClick={() => setEditEntity(e)} className="p-1.5 rounded hover:bg-slate-100 text-slate-500">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => toggleActive(e)} className="p-1.5 rounded hover:bg-slate-100 text-slate-500 text-[11px] font-semibold">
                      {e.isActive ? 'Off' : 'On'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <EntityDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={() => { setCreateOpen(false); onRefresh() }}
      />
      {editEntity && (
        <EntityDialog
          entity={editEntity}
          open
          onClose={() => setEditEntity(null)}
          onSaved={() => { setEditEntity(null); onRefresh() }}
        />
      )}
    </>
  )
}

function EntityDialog({ entity, open, onClose, onSaved }: {
  entity?: Entity
  open: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [legalName, setLegalName] = useState(entity?.legalName ?? '')
  const [shortName, setShortName] = useState(entity?.shortName ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    const url = entity ? `/api/entities/${entity.id}` : '/api/entities'
    const method = entity ? 'PUT' : 'POST'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ legalName, shortName }),
    })
    setSaving(false)
    if (res.ok) {
      onSaved()
    } else {
      const d = await res.json()
      setError(d.error ?? 'Gagal menyimpan.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{entity ? 'Edit Entitas' : 'Tambah Entitas'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>Nama Legal</Label>
            <Input value={legalName} onChange={(e) => setLegalName(e.target.value)} required placeholder="PT CAHAYA MENTARI BERSINAR" />
          </div>
          <div className="space-y-1.5">
            <Label>Nama Singkat</Label>
            <Input value={shortName} onChange={(e) => setShortName(e.target.value)} required placeholder="Cahaya Mentari" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Outlets Tab ──────────────────────────────────────────────────────────────

function OutletsTab({ outlets, entities, onRefresh }: {
  outlets: Outlet[]
  entities: Entity[]
  onRefresh: () => void
}) {
  const [createOpen, setCreateOpen] = useState(false)
  const [editOutlet, setEditOutlet] = useState<Outlet | null>(null)

  async function toggleActive(o: Outlet) {
    await fetch(`/api/outlets/${o.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !o.isActive }),
    })
    onRefresh()
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-500">{outlets.length} outlet terdaftar</p>
        <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Tambah Outlet
        </Button>
      </div>

      <div className="rounded-lg border bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50 text-slate-600 text-left">
              <th className="px-4 py-3 font-medium">Nama Outlet</th>
              <th className="px-4 py-3 font-medium">Kode</th>
              <th className="px-4 py-3 font-medium">Entitas</th>
              <th className="px-4 py-3 font-medium">Terminal</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium w-20">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {outlets.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Belum ada outlet.</td></tr>
            ) : outlets.map((o) => (
              <tr key={o.id} className={cn('border-b last:border-0', !o.isActive && 'opacity-50')}>
                <td className="px-4 py-3 font-medium text-slate-800">{o.name}</td>
                <td className="px-4 py-3">
                  <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">{o.code}</span>
                </td>
                <td className="px-4 py-3 text-slate-600">{o.entityName}</td>
                <td className="px-4 py-3 text-slate-500">{o.terminalCount} terminal</td>
                <td className="px-4 py-3">
                  <Badge variant={o.isActive ? 'success' : 'outline'}>
                    {o.isActive ? 'Aktif' : 'Nonaktif'}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button onClick={() => setEditOutlet(o)} className="p-1.5 rounded hover:bg-slate-100 text-slate-500">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => toggleActive(o)} className="p-1.5 rounded hover:bg-slate-100 text-slate-500 text-[11px] font-semibold">
                      {o.isActive ? 'Off' : 'On'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <OutletDialog
        open={createOpen}
        entities={entities}
        onClose={() => setCreateOpen(false)}
        onSaved={() => { setCreateOpen(false); onRefresh() }}
      />
      {editOutlet && (
        <OutletDialog
          outlet={editOutlet}
          entities={entities}
          open
          onClose={() => setEditOutlet(null)}
          onSaved={() => { setEditOutlet(null); onRefresh() }}
        />
      )}
    </>
  )
}

function OutletDialog({ outlet, entities, open, onClose, onSaved }: {
  outlet?: Outlet
  entities: Entity[]
  open: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(outlet?.name ?? '')
  const [code, setCode] = useState(outlet?.code ?? '')
  const [address, setAddress] = useState(outlet?.address ?? '')
  const [entityId, setEntityId] = useState(outlet?.entityId ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    const url = outlet ? `/api/outlets/${outlet.id}` : '/api/outlets'
    const method = outlet ? 'PUT' : 'POST'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, code: code.toUpperCase(), address: address || null, entityId }),
    })
    setSaving(false)
    if (res.ok) {
      onSaved()
    } else {
      const d = await res.json()
      setError(d.error ?? 'Gagal menyimpan.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{outlet ? 'Edit Outlet' : 'Tambah Outlet'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>Entitas</Label>
            <Select value={entityId} onValueChange={setEntityId} required>
              <SelectTrigger><SelectValue placeholder="Pilih entitas..." /></SelectTrigger>
              <SelectContent>
                {entities.filter((e) => e.isActive).map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.legalName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Nama Outlet</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Canna" />
          </div>
          <div className="space-y-1.5">
            <Label>Kode Outlet</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required placeholder="CANNA" className="font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label>Alamat <span className="text-slate-400 font-normal">(opsional)</span></Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Sawangan, Depok" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Terminals Tab ────────────────────────────────────────────────────────────

function TerminalsTab({ terminals, outlets, onRefresh }: {
  terminals: EdcTerminal[]
  outlets: Outlet[]
  onRefresh: () => void
}) {
  const [createOpen, setCreateOpen] = useState(false)
  const [editTerminal, setEditTerminal] = useState<EdcTerminal | null>(null)
  const [filterOutlet, setFilterOutlet] = useState<string>('all')

  async function toggleActive(t: EdcTerminal) {
    await fetch(`/api/edc-terminals/${t.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !t.isActive }),
    })
    onRefresh()
  }

  const filtered = filterOutlet === 'all' ? terminals : terminals.filter((t) => t.outletId === filterOutlet)

  function bankColor(label: string) {
    if (label.startsWith('BCA')) return 'bg-blue-50 text-blue-700'
    if (label.startsWith('MANDIRI')) return 'bg-yellow-50 text-yellow-700'
    if (label.startsWith('BNI')) return 'bg-orange-50 text-orange-700'
    if (label.startsWith('BRI')) return 'bg-blue-50 text-blue-800'
    return 'bg-slate-100 text-slate-600'
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <p className="text-sm text-slate-500">{filtered.length} terminal</p>
          <Select value={filterOutlet} onValueChange={setFilterOutlet}>
            <SelectTrigger className="h-8 text-xs w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Outlet</SelectItem>
              {outlets.map((o) => (
                <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Tambah Terminal
        </Button>
      </div>

      <div className="rounded-lg border bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50 text-slate-600 text-left">
              <th className="px-4 py-3 font-medium">Outlet</th>
              <th className="px-4 py-3 font-medium">Kode Terminal</th>
              <th className="px-4 py-3 font-medium">Bank / Label</th>
              <th className="px-4 py-3 font-medium">Terminal ID</th>
              <th className="px-4 py-3 font-medium">No. Rekening</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium w-20">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Belum ada terminal EDC.</td></tr>
            ) : filtered.map((t) => (
              <tr key={t.id} className={cn('border-b last:border-0', !t.isActive && 'opacity-50')}>
                <td className="px-4 py-3 text-slate-700">
                  <span className="font-medium">{t.outletName}</span>
                  <span className="text-xs text-slate-400 ml-1">({t.outletCode})</span>
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">{t.terminalCode}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={cn('text-xs font-semibold px-2 py-0.5 rounded', bankColor(t.bankLabel))}>
                    {t.bankLabel}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-600">{t.terminalId}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500 num">{t.accountNumber ?? '—'}</td>
                <td className="px-4 py-3">
                  <Badge variant={t.isActive ? 'success' : 'outline'}>
                    {t.isActive ? 'Aktif' : 'Nonaktif'}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button onClick={() => setEditTerminal(t)} className="p-1.5 rounded hover:bg-slate-100 text-slate-500">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => toggleActive(t)} className="p-1.5 rounded hover:bg-slate-100 text-slate-500 text-[11px] font-semibold">
                      {t.isActive ? 'Off' : 'On'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <TerminalDialog
        open={createOpen}
        outlets={outlets}
        onClose={() => setCreateOpen(false)}
        onSaved={() => { setCreateOpen(false); onRefresh() }}
      />
      {editTerminal && (
        <TerminalDialog
          terminal={editTerminal}
          outlets={outlets}
          open
          onClose={() => setEditTerminal(null)}
          onSaved={() => { setEditTerminal(null); onRefresh() }}
        />
      )}
    </>
  )
}

function TerminalDialog({ terminal, outlets, open, onClose, onSaved }: {
  terminal?: EdcTerminal
  outlets: Outlet[]
  open: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [outletId, setOutletId] = useState(terminal?.outletId ?? '')
  const [terminalCode, setTerminalCode] = useState(terminal?.terminalCode ?? '')
  const [bankLabel, setBankLabel] = useState(terminal?.bankLabel ?? '')
  const [terminalId, setTerminalId] = useState(terminal?.terminalId ?? '')
  const [accountNumber, setAccountNumber] = useState(terminal?.accountNumber ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    const url = terminal ? `/api/edc-terminals/${terminal.id}` : '/api/edc-terminals'
    const method = terminal ? 'PUT' : 'POST'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        outletId,
        terminalCode,
        bankLabel,
        terminalId,
        accountNumber: accountNumber || null,
      }),
    })
    setSaving(false)
    if (res.ok) {
      onSaved()
    } else {
      const d = await res.json()
      setError(d.error ?? 'Gagal menyimpan.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{terminal ? 'Edit Terminal EDC' : 'Tambah Terminal EDC'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>Outlet</Label>
            <Select value={outletId} onValueChange={setOutletId} required>
              <SelectTrigger><SelectValue placeholder="Pilih outlet..." /></SelectTrigger>
              <SelectContent>
                {outlets.filter((o) => o.isActive).map((o) => (
                  <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Kode Terminal</Label>
              <Input value={terminalCode} onChange={(e) => setTerminalCode(e.target.value)} required placeholder="2995" className="font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label>Label Bank</Label>
              <Input value={bankLabel} onChange={(e) => setBankLabel(e.target.value)} required placeholder="BCA C2AP2381" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Terminal ID</Label>
              <Input value={terminalId} onChange={(e) => setTerminalId(e.target.value)} required placeholder="C2AP2381" className="font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label>No. Rekening <span className="text-slate-400 font-normal">(opsional)</span></Label>
              <Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="1462392995" className="font-mono num" />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
