'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { ChevronDown, LayoutDashboard, Plus, History, Database, ScrollText, Users, LogOut, Menu, X } from 'lucide-react'
import { useState } from 'react'
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

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'finance', 'manager'] },
  { href: '/sessions/new', label: 'Rekonsiliasi Baru', icon: Plus, roles: ['admin', 'finance'] },
  { href: '/history', label: 'Riwayat', icon: History, roles: ['admin', 'finance', 'manager'] },
  { href: '/admin/master-data', label: 'Data Master', icon: Database, roles: ['admin'] },
  { href: '/admin/audit-log', label: 'Log Audit', icon: ScrollText, roles: ['admin'] },
  { href: '/admin/users', label: 'Pengguna', icon: Users, roles: ['admin'] },
]

function roleLabel(role: string) {
  return { admin: 'Admin', finance: 'Finance', manager: 'Manager' }[role] ?? role
}

function initials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
}

export function Navbar({ userName, userRole }: NavbarProps) {
  const pathname = usePathname()
  const { outlets, selectedOutlet, setSelectedOutlet } = useOutlet()
  const [mobileOpen, setMobileOpen] = useState(false)

  const visibleNav = NAV_ITEMS.filter((item) => item.roles.includes(userRole))

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 h-14 bg-[#0e1726] border-b border-white/10 flex items-center px-4 gap-4">
        {/* Brand */}
        <Link href="/dashboard" className="flex items-center gap-1 shrink-0 mr-2">
          <span className="text-white font-bold text-lg tracking-tight">
            BSpace <span className="text-blue-400">Finance</span>
          </span>
        </Link>

        {/* Desktop nav links */}
        <div className="hidden md:flex items-center gap-1 flex-1">
          {visibleNav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                  active
                    ? 'bg-blue-600/20 text-blue-300'
                    : 'text-slate-300 hover:text-white hover:bg-white/10'
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            )
          })}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {/* Outlet selector */}
          {outlets.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/15 text-sm text-white transition-colors">
                <div className="flex flex-col items-start leading-none">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wide">Outlet</span>
                  <span className="font-medium">{selectedOutlet?.name ?? '—'}</span>
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[200px]">
                {outlets.map((outlet) => (
                  <DropdownMenuItem
                    key={outlet.id}
                    onClick={() => setSelectedOutlet(outlet)}
                    className={cn(
                      'flex flex-col items-start gap-0.5',
                      outlet.id === selectedOutlet?.id && 'bg-accent'
                    )}
                  >
                    <span className="font-medium">{outlet.name}</span>
                    <span className="text-xs text-muted-foreground">{outlet.entityName}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-md hover:bg-white/10 transition-colors">
              <div className="h-7 w-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                {initials(userName)}
              </div>
              <div className="hidden md:flex flex-col items-start leading-none">
                <span className="text-sm text-white font-medium">{userName}</span>
                <span className="text-[10px] text-slate-400 capitalize">{roleLabel(userRole)}</span>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[160px]">
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium">{userName}</p>
                <Badge variant="outline" className="mt-1 text-[10px]">{roleLabel(userRole)}</Badge>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive cursor-pointer"
                onClick={() => signOut({ callbackUrl: '/login' })}
              >
                <LogOut className="h-4 w-4 mr-2" />
                Keluar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 rounded-md text-slate-300 hover:text-white hover:bg-white/10"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="fixed top-14 left-0 right-0 z-40 bg-[#0e1726] border-b border-white/10 md:hidden px-4 py-3 flex flex-col gap-1">
          {visibleNav.map((item) => {
            const active = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'flex items-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium',
                  active ? 'bg-blue-600/20 text-blue-300' : 'text-slate-300 hover:text-white hover:bg-white/10'
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            )
          })}
          {/* Outlet selector mobile */}
          {outlets.length > 0 && (
            <>
              <div className="h-px bg-white/10 my-1" />
              <div className="px-3 py-1">
                <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Pilih Outlet</p>
                {outlets.map((outlet) => (
                  <button
                    key={outlet.id}
                    onClick={() => { setSelectedOutlet(outlet); setMobileOpen(false) }}
                    className={cn(
                      'w-full text-left px-2 py-1.5 rounded text-sm',
                      outlet.id === selectedOutlet?.id ? 'text-blue-300 font-medium' : 'text-slate-300 hover:text-white'
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
