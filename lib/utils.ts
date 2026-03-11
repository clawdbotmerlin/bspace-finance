import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Format amount as Indonesian Rupiah: Rp 4.766.700 */
export function formatRupiah(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined) return 'Rp 0'
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  if (isNaN(num)) return 'Rp 0'
  return 'Rp ' + Math.round(num).toLocaleString('id-ID')
}

/** Parse Indonesian number format (4.766.700 → 4766700) */
export function parseIndonesianNumber(s: string): number {
  return parseFloat(s.replace(/\./g, '').replace(',', '.'))
}
