'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    })

    setLoading(false)

    if (result?.error) {
      setError('Email atau password salah.')
    } else {
      router.push('/dashboard')
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0d1b2a] px-4">
      <div className="w-full max-w-[340px]">
        {/* Brand */}
        <div className="text-center mb-7">
          <h1 className="text-2xl font-bold text-white tracking-tight">
            BSpace <span className="text-blue-400">Finance</span>
          </h1>
          <p className="text-slate-500 text-[12px] mt-1 uppercase tracking-wider font-medium">
            Rekonsiliasi & Settlement Keuangan
          </p>
        </div>

        {/* Card */}
        <form
          onSubmit={handleSubmit}
          className="bg-white/[0.04] border border-white/[0.08] rounded-lg p-6 space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="admin@bspace.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="h-8 text-[13px] bg-white/[0.06] border-white/[0.12] text-white placeholder:text-slate-600 focus-visible:ring-blue-500 focus-visible:border-blue-500"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="h-8 text-[13px] bg-white/[0.06] border-white/[0.12] text-white placeholder:text-slate-600 focus-visible:ring-blue-500 focus-visible:border-blue-500"
            />
          </div>

          {error && (
            <p className="text-[12px] text-red-400 text-center">{error}</p>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-8 text-[13px] font-semibold bg-blue-600 hover:bg-blue-500 text-white mt-1"
          >
            {loading ? 'Masuk...' : 'Masuk'}
          </Button>
        </form>
      </div>
    </div>
  )
}
