import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { Navbar } from '@/components/layout/Navbar'
import { OutletProvider } from '@/components/providers/OutletProvider'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    redirect('/login')
  }

  const userName = session.user.name ?? session.user.email ?? 'User'
  const userRole = (session.user as { role?: string }).role ?? 'finance'

  return (
    <OutletProvider>
      <Navbar userName={userName} userRole={userRole} />
      <main className="pt-12 min-h-screen bg-[#f0f2f5]">
        {children}
      </main>
    </OutletProvider>
  )
}
