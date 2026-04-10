'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { LogOut, BarChart3, Home } from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'

interface MinimalNavbarProps {
  userName: string
  userRole: string
}

function roleLabel(role: string) {
  return { admin: 'Administrator', finance: 'Finance Staff', manager: 'Finance Head' }[role] ?? role
}

function initials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
}

// Page-specific config
const PAGE_CONFIG: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string; color: string }> = {
  '/villa-analytics': { icon: BarChart3, label: 'Villa Report Analytics', color: 'text-emerald-400' },
}

export function MinimalNavbar({ userName, userRole }: MinimalNavbarProps) {
  const pathname = usePathname()
  const page = PAGE_CONFIG[pathname]

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 h-12 bg-[#0d1b2a] border-b border-white/[0.08] flex items-stretch px-4">
      {/* Brand */}
      <Link href="/home" className="flex items-center gap-1 shrink-0 mr-4 pr-4 border-r border-white/[0.08]">
        <span className="text-white font-bold text-[15px] tracking-tight">
          BSpace <span className="text-blue-400">Finance</span>
        </span>
      </Link>

      {/* Module title */}
      {page && (
        <div className="flex items-center gap-2">
          <page.icon className={`h-3.5 w-3.5 ${page.color}`} />
          <span className={`text-[13px] font-medium ${page.color}`}>{page.label}</span>
        </div>
      )}

      {/* Right side */}
      <div className="flex items-center gap-2 ml-auto">
        {/* Home link */}
        <Link
          href="/home"
          className="hidden md:flex items-center gap-1.5 px-3 text-[13px] font-medium text-slate-400 hover:text-white transition-colors"
        >
          <Home className="h-3.5 w-3.5" />
          Beranda
        </Link>

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
      </div>
    </nav>
  )
}
