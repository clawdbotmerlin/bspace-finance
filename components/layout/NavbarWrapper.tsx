'use client'

import { usePathname } from 'next/navigation'
import { Navbar } from './Navbar'
import { MinimalNavbar } from './MinimalNavbar'

interface NavbarWrapperProps {
  userName: string
  userRole: string
}

export function NavbarWrapper({ userName, userRole }: NavbarWrapperProps) {
  const pathname = usePathname()

  // Full accounting navbar only for accounting module routes
  if (pathname.startsWith('/accounting') || pathname.startsWith('/dashboard')) {
    return <Navbar userName={userName} userRole={userRole} />
  }

  // Minimal top bar for home, villa-analytics, and everything else
  return <MinimalNavbar userName={userName} userRole={userRole} />
}
