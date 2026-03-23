'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import {
  ChevronDown, LayoutDashboard, Plus, History, Database, ScrollText,
  Users, LogOut, Menu, X, ClipboardCheck, AlertTriangle, Bell, ClipboardList,
} from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useOutlet } from '@/components/providers/OutletProvider'

interface NavbarProps {
  userName: string
  userRole: string
}

interface NotifCounts {
  pendingSignoff: number
  openDiscrepancies: number
  total: number
}

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'finance', 'manager'] },
  { href: '/sessions/new', label: 'Rekonsiliasi Baru', icon: Plus, roles: ['admin', 'finance'] },
  { href: '/history', label: 'Riwayat', icon: History, roles: ['admin', 'finance', 'manager'] },
  { href: '/signoff', label: 'Persetujuan', icon: ClipboardCheck, roles: ['admin', 'manager'] },
  { href: '/discrepancies', label: 'Diskrepansi', icon: AlertTriangle, roles: ['admin', 'finance'] },
  { href: '/admin/master-data', label: 'Data Master', icon: Database, roles: ['admin'] },
  { href: '/admin/audit-log', label: 'Log Audit', icon: ScrollText, roles: ['admin'] },
  { href: '/admin/users', label: 'Pengguna', icon: Users, roles: ['admin'] },
]

const POLL_MS = 60_000

function roleLabel(role: string) {
  return { admin: 'Administrator', finance: 'Finance Staff', manager: 'Finance Head' }[role] ?? role
}

function initials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
}

function NotifBadge({ n }: { n: number }) {
  if (n <= 0) return null
  return (
    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none pointer-events-none">
      {n > 99 ? '99+' : n}
    </span>
  )
}

export function Navbar({ userName, userRole }: NavbarProps) {
  const pathname = usePathname()
  const { outlets, selectedOutlet, setSelectedOutlet } = useOutlet()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [notifs, setNotifs] = useState<NotifCounts>({ pendingSignoff: 0, openDiscrepancies: 0, total: 0 })

  const fetchNotifs = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications')
      if (res.ok) setNotifs(await res.json())
    } catch {
      // non-critical — ignore errors
    }
  }, [])

  useEffect(() => {
    fetchNotifs()
    const id = setInterval(fetchNotifs, POLL_MS)
    return () => clearInterval(id)
  }, [fetchNotifs])

  const visibleNav = NAV_ITEMS.filter((item) => item.roles.includes(userRole))

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 h-12 bg-[#0d1b2a] border-b border-white/[0.08] flex items-stretch px-4">
        {/* Brand */}
        <Link href="/dashboard" className="flex items-center gap-1 shrink-0 mr-4 pr-4 border-r border-white/[0.08]">
          <span className="text-white font-bold text-[15px] tracking-tight">
            BSpace <span className="text-blue-400">Finance</span>
          </span>
        </Link>

        {/* Desktop nav links */}
        <div className="hidden md:flex items-stretch gap-0 flex-1">
          {visibleNav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-1.5 px-3 text-[13px] font-medium transition-colors relative',
                  active
                    ? 'text-white after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-blue-400 after:rounded-t'
                    : 'text-slate-400 hover:text-white'
                )}
              >
                <item.icon className="h-3.5 w-3.5 shrink-0" />
                {item.label}
              </Link>
            )
          })}
        </div>

        <div className="flex items-center gap-1 ml-auto">
          {/* Outlet selector */}
          {outlets.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded hover:bg-white/10 text-white transition-colors border-r border-white/[0.08] mr-1 pr-4">
                <div className="flex flex-col items-start leading-none">
                  <span className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold">Outlet</span>
                  <span className="text-[12px] font-medium mt-0.5">{selectedOutlet?.name ?? '—'}</span>
                </div>
                <ChevronDown className="h-3 w-3 text-slate-500 shrink-0 ml-1" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[200px]">
                {outlets.map((outlet) => (
                  <DropdownMenuItem
                    key={outlet.id}
                    onClick={() => setSelectedOutlet(outlet)}
                    className={cn(outlet.id === selectedOutlet?.id && 'bg-accent')}
                  >
                    <span className="font-medium text-xs">{outlet.name}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Notification bell */}
          <DropdownMenu>
            <DropdownMenuTrigger className="hidden md:flex relative p-2 rounded hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
              <Bell className="h-4 w-4" />
              <NotifBadge n={notifs.total} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[260px]">
              <div className="px-3 py-2 border-b">
                <p className="text-xs font-semibold text-foreground">Notifikasi</p>
              </div>
              {notifs.total === 0 ? (
                <div className="px-3 py-4 text-center">
                  <p className="text-xs text-muted-foreground">Semua sudah beres 🎉</p>
                </div>
              ) : (
                <>
                  {notifs.pendingSignoff > 0 && (
                    <DropdownMenuItem asChild>
                      <Link href="/signoff" className="flex items-start gap-2.5 px-3 py-2.5 cursor-pointer">
                        <div className="mt-0.5 h-6 w-6 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
                          <ClipboardList className="h-3.5 w-3.5 text-blue-400" />
                        </div>
                        <div>
                          <p className="text-xs font-medium">Menunggu Persetujuan</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {notifs.pendingSignoff} sesi perlu ditanda tangani
                          </p>
                        </div>
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {notifs.openDiscrepancies > 0 && (
                    <DropdownMenuItem asChild>
                      <Link href="/discrepancies" className="flex items-start gap-2.5 px-3 py-2.5 cursor-pointer">
                        <div className="mt-0.5 h-6 w-6 rounded-full bg-red-500/20 flex items-center justify-center shrink-0">
                          <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
                        </div>
                        <div>
                          <p className="text-xs font-medium">Diskrepansi Terbuka</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {notifs.openDiscrepancies} diskrepansi perlu ditindaklanjuti
                          </p>
                        </div>
                      </Link>
                    </DropdownMenuItem>
                  )}
                </>
              )}
              <div className="px-3 py-1.5 border-t">
                <p className="text-[10px] text-muted-foreground text-center">Diperbarui otomatis setiap menit</p>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 px-2 py-1 rounded hover:bg-white/10 transition-colors">
              <div className="h-6 w-6 rounded-full bg-blue-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                {initials(userName)}
              </div>
              <div className="hidden md:flex flex-col items-start leading-none">
                <span className="text-[12px] text-white font-semibold">{userName}</span>
                <span className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold mt-0.5">{roleLabel(userRole)}</span>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[160px]">
              <div className="px-2 py-1.5">
                <p className="text-xs font-semibold">{userName}</p>
                <Badge variant="outline" className="mt-1 text-[9px] uppercase tracking-wide">{roleLabel(userRole)}</Badge>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive cursor-pointer text-xs"
                onClick={() => signOut({ callbackUrl: '/login' })}
              >
                <LogOut className="h-3.5 w-3.5 mr-2" />
                Keluar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 rounded text-slate-400 hover:text-white hover:bg-white/10"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="fixed top-12 left-0 right-0 z-40 bg-[#0d1b2a] border-b border-white/[0.08] md:hidden px-4 py-3 flex flex-col gap-0.5">
          {visibleNav.map((item) => {
            const active = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded text-[13px] font-medium',
                  active ? 'text-white bg-white/10' : 'text-slate-400 hover:text-white hover:bg-white/5'
                )}
              >
                <item.icon className="h-3.5 w-3.5" />
                {item.label}
              </Link>
            )
          })}

          {/* Mobile notifications */}
          {notifs.total > 0 && (
            <>
              <div className="h-px bg-white/[0.08] my-2" />
              <div className="px-3 py-1">
                <p className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold mb-1.5">
                  Notifikasi
                </p>
                {notifs.pendingSignoff > 0 && (
                  <Link
                    href="/signoff"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-2 px-2 py-1.5 rounded text-[12px] text-blue-300 hover:bg-white/5"
                  >
                    <ClipboardList className="h-3.5 w-3.5 shrink-0" />
                    {notifs.pendingSignoff} sesi perlu persetujuan
                  </Link>
                )}
                {notifs.openDiscrepancies > 0 && (
                  <Link
                    href="/discrepancies"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-2 px-2 py-1.5 rounded text-[12px] text-red-300 hover:bg-white/5"
                  >
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    {notifs.openDiscrepancies} diskrepansi terbuka
                  </Link>
                )}
              </div>
            </>
          )}

          {outlets.length > 0 && (
            <>
              <div className="h-px bg-white/[0.08] my-2" />
              <div className="px-3 py-1">
                <p className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold mb-1.5">Pilih Outlet</p>
                {outlets.map((outlet) => (
                  <button
                    key={outlet.id}
                    onClick={() => { setSelectedOutlet(outlet); setMobileOpen(false) }}
                    className={cn(
                      'w-full text-left px-2 py-1.5 rounded text-[12px]',
                      outlet.id === selectedOutlet?.id ? 'text-blue-300 font-semibold' : 'text-slate-400 hover:text-white'
                    )}
                  >
                    {outlet.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </>
  )
}
