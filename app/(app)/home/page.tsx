'use client'

import Link from 'next/link'
import { Calculator, BarChart3, ArrowRight } from 'lucide-react'

export default function HomePage() {
  return (
    <div className="min-h-[calc(100vh-48px)] bg-[#f0f2f5] flex flex-col">
      {/* Header */}
      <div className="pt-14 pb-10 text-center px-4">
        <p className="text-xs font-semibold tracking-widest text-slate-400 uppercase mb-3">BSpace Finance Platform</p>
        <h1 className="text-3xl font-bold text-slate-800">Selamat Datang</h1>
        <p className="mt-2 text-slate-500 text-sm max-w-md mx-auto">
          Pilih modul yang ingin Anda gunakan.
        </p>
      </div>

      {/* CTA Cards */}
      <div className="flex-1 flex items-start justify-center px-6 pb-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full max-w-3xl">

          {/* Accounting Reconciliation */}
          <Link
            href="/accounting"
            className="group relative bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-200 transition-all duration-200 p-8 flex flex-col overflow-hidden"
          >
            {/* accent stripe */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-blue-600 rounded-t-2xl" />

            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center mb-5">
              <Calculator className="w-6 h-6 text-blue-600" />
            </div>

            <div className="flex-1">
              <p className="text-[11px] font-semibold tracking-widest text-blue-500 uppercase mb-1">BSpace</p>
              <h2 className="text-xl font-bold text-slate-800 leading-tight">
                Accounting<br />Reconciliation
              </h2>
              <p className="mt-3 text-sm text-slate-500 leading-relaxed">
                Rekonsiliasi laporan kasir dengan mutasi bank secara otomatis. Kelola sesi, review selisih, dan tanda tangan laporan.
              </p>
            </div>

            <div className="mt-6 flex items-center text-blue-600 text-sm font-semibold group-hover:gap-2 gap-1 transition-all">
              Buka Modul <ArrowRight className="w-4 h-4" />
            </div>
          </Link>

          {/* Villa Report Analytics */}
          <Link
            href="/villa-analytics"
            className="group relative bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-emerald-200 transition-all duration-200 p-8 flex flex-col overflow-hidden"
          >
            {/* accent stripe */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500 rounded-t-2xl" />

            <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center mb-5">
              <BarChart3 className="w-6 h-6 text-emerald-600" />
            </div>

            <div className="flex-1">
              <p className="text-[11px] font-semibold tracking-widest text-emerald-600 uppercase mb-1">BSpace</p>
              <h2 className="text-xl font-bold text-slate-800 leading-tight">
                Villa Report<br />Analytics
              </h2>
              <p className="mt-3 text-sm text-slate-500 leading-relaxed">
                Analitik laporan villa secara real-time. Pantau pendapatan, okupansi, dan performa operasional outlet.
              </p>
            </div>

            <div className="mt-6 flex items-center text-emerald-600 text-sm font-semibold group-hover:gap-2 gap-1 transition-all">
              Buka Modul <ArrowRight className="w-4 h-4" />
            </div>
          </Link>

        </div>
      </div>
    </div>
  )
}
