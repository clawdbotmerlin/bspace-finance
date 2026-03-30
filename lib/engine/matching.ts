// Pure in-memory matching engine — no database calls.
// Takes plain data arrays, returns a MatchResult that the caller persists.

const SKIP_PAYMENT_TYPES = new Set(['CASH', 'VOUCHER'])

export interface EngineEntry {
  id: string
  bankName: string
  terminalId: string | null
  paymentType: string
  amount: number // Decimal as number
}

export interface EngineMutation {
  id: string
  bankName: string
  accountNumber: string | null
  grossAmount: number
  direction: string // CR | DR
}

export interface EngineTerminal {
  bankLabel: string      // e.g. "BCA C2AP2381", "MANDIRI 82266801"
  terminalId: string     // e.g. "C2AP2381", "MANDIRI-82266801"
  accountNumber: string | null
}

export interface MatchResult {
  /** Successful matches with computed amount difference (mutation.grossAmount - entry.amount) */
  matches: Array<{ cashierEntryId: string; bankMutationId: string; amountDiff: number }>
  /** CashierEntry IDs with amount === 0 */
  zeros: string[]
  /** CashierEntry IDs with no corresponding bank mutation (non-zero, non-CASH/VOUCHER) */
  missingInBank: string[]
  /** BankMutation IDs (direction=CR) with no matched cashier entry */
  unexpectedBank: string[]
}

function withinTolerance(a: number, b: number, tolerance: number): boolean {
  if (b === 0) return a === 0
  return Math.abs(a - b) / b <= tolerance
}

export function runMatchingEngine(
  entries: EngineEntry[],
  mutations: EngineMutation[],
  terminals: EngineTerminal[],
): MatchResult {
  const TOLERANCE = 0.05 // 5% — covers MDR + rounding

  // Build: bankLabel → accountNumber map for terminal lookup
  const accountMap = new Map<string, string | null>()
  for (const t of terminals) {
    accountMap.set(t.bankLabel.toUpperCase(), t.accountNumber)
    // Also index by terminalId variants for looser lookup
    const parts = t.bankLabel.split(' ')
    if (parts.length >= 2) {
      // "BCA C2AP2381" → key "BCA C2AP2381" (already set above, normalised)
    }
  }

  // Track which mutations are still unmatched
  const used = new Set<string>()

  const result: MatchResult = { matches: [], zeros: [], missingInBank: [], unexpectedBank: [] }

  // Only credit mutations participate in matching
  const crMutations = mutations.filter((m) => m.direction === 'CR')

  for (const entry of entries) {
    const amount = entry.amount

    // Zero-amount entries
    if (amount === 0) {
      result.zeros.push(entry.id)
      continue
    }

    // Cash / Voucher — no bank settlement expected, treated as zero (skipped)
    if (SKIP_PAYMENT_TYPES.has(entry.paymentType.toUpperCase())) {
      result.zeros.push(entry.id)
      continue
    }

    // Build lookup key — same format as EdcTerminal.bankLabel
    const bankKey = `${entry.bankName} ${entry.terminalId ?? ''}`.trim().toUpperCase()
    const accountNumber = accountMap.get(bankKey) ?? null

    // Find candidates: same bank, within tolerance, not yet used
    let candidates = crMutations.filter(
      (m) => m.bankName.toUpperCase() === entry.bankName.toUpperCase()
        && !used.has(m.id)
        && withinTolerance(m.grossAmount, amount, TOLERANCE),
    )

    // Narrow by account number when available
    if (accountNumber && candidates.length > 0) {
      const narrowed = candidates.filter((m) => m.accountNumber === accountNumber)
      if (narrowed.length > 0) candidates = narrowed
    }

    if (candidates.length === 0) {
      result.missingInBank.push(entry.id)
      continue
    }

    // Prefer candidates where bank <= cashier (MDR always deducted from settlement).
    // Among those, pick smallest absolute diff. Only fall back to bank > cashier if no
    // under-or-equal candidate exists.
    const underCandidates = candidates.filter((m) => m.grossAmount <= amount)
    const pool = underCandidates.length > 0 ? underCandidates : candidates
    const best = pool.reduce((a, b) =>
      Math.abs(a.grossAmount - amount) <= Math.abs(b.grossAmount - amount) ? a : b,
    )

    used.add(best.id)
    result.matches.push({
      cashierEntryId: entry.id,
      bankMutationId: best.id,
      amountDiff: best.grossAmount - amount,
    })
  }

  // Unmatched credit mutations → unexpected bank entries
  for (const m of crMutations) {
    if (!used.has(m.id)) {
      result.unexpectedBank.push(m.id)
    }
  }

  return result
}
