'use client'

import Link from 'next/link'
import { BarChart3, ArrowLeft, Clock } from 'lucide-react'

export default function VillaAnalyticsPage() {
  return (
    <div className="min-h-[calc(100vh-48px)] bg-[#f0f2f5] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-md text-center">
        {/* Icon */}
        <div className="w-20 h-20 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center mx-auto mb-6">
          <BarChart3 className="w-10 h-10 text-emerald-500" />
        </div>

        {/* Badge */}
        <div className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold px-3 py-1 rounded-full mb-4">
          <Clock className="w-3.5 h-3.5" />
          Segera Hadir
        </div>

        <h1 className="text-2xl font-bold text-slate-800 mb-3">
          Villa Report Analytics
        </h1>
        <p className="text-slate-500 text-sm leading-relaxed mb-8">
          Modul analitik laporan villa sedang dalam pengembangan. Pantau pendapatan, tingkat hunian, dan performa operasional outlet secara real-time.
        </p>

        <Link
          href="/home"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Kembali ke Beranda
        </Link>
      </div>
    </div>
  )
}
