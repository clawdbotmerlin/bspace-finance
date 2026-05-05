// Pure in-memory matching engine — no database calls.
// Takes plain data arrays, returns a MatchResult that the caller persists.
//
// Matching strategy: strict 1:1 — one cashier entry ↔ one bank mutation, within 3% tolerance.
// CASH and VOUCHER entries are always skipped (pushed to zeros).
// Group / N:1 matching has been removed; each outlet now uses exactly one EDC per company.

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
  description: string | null
}

export interface EngineTerminal {
  bankLabel: string      // e.g. "BCA C2AP2381", "MANDIRI 82266801"
  terminalId: string     // e.g. "C2AP2381", "MANDIRI-82266801"
  accountNumber: string | null
}

export interface MatchResult {
  /** 1:1 successful matches with computed amount difference (mutation.grossAmount - entry.amount) */
  matches: Array<{ cashierEntryId: string; bankMutationId: string; amountDiff: number }>
  /** N:1 group matches via HO TGH — multiple cashier entries → one bank mutation */
  groupMatches: Array<{
    cashierEntryIds: string[]
    bankMutationId: string
    /** mutation.grossAmount - sum(entry.amount) — negative = MDR deducted by bank */
    amountDiff: number
    grossTarget: number
  }>
  /** CashierEntry IDs with amount === 0 or CASH/VOUCHER */
  zeros: string[]
  /** CashierEntry IDs with no corresponding bank mutation */
  missingInBank: string[]
  /** BankMutation IDs (direction=CR) with no matched cashier entry */
  unexpectedBank: string[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function withinTolerance(a: number, b: number, tol: number): boolean {
  if (b === 0) return a === 0
  return Math.abs(a - b) / b <= tol
}

// ── Main engine ───────────────────────────────────────────────────────────────

export function runMatchingEngine(
  entries: EngineEntry[],
  mutations: EngineMutation[],
  terminals: EngineTerminal[],
): MatchResult {
  const TOL = 0.03 // 3% — covers MDR range (KK ~2–3%, DEBIT ~1%)

  // bankLabel (uppercase) → accountNumber
  const accountMap = new Map<string, string | null>()
  for (const t of terminals) {
    accountMap.set(t.bankLabel.toUpperCase(), t.accountNumber)
  }

  function entryAccount(entry: EngineEntry): string | null {
    const key = `${entry.bankName} ${entry.terminalId ?? ''}`.trim().toUpperCase()
    return accountMap.get(key) ?? null
  }

  const usedMutations = new Set<string>()
  const usedEntries   = new Set<string>()

  const result: MatchResult = {
    matches: [], groupMatches: [], zeros: [], missingInBank: [], unexpectedBank: [],
  }

  const crMutations = mutations.filter((m) => m.direction === 'CR')

  // ── Pre-pass: zero / skipped entries ──────────────────────────────────────
  for (const entry of entries) {
    if (entry.amount === 0 || SKIP_PAYMENT_TYPES.has(entry.paymentType.toUpperCase())) {
      result.zeros.push(entry.id)
      usedEntries.add(entry.id)
    }
  }

  // ── 1:1 individual matching ───────────────────────────────────────────────
  for (const entry of entries) {
    if (usedEntries.has(entry.id)) continue

    const amount = entry.amount
    const acct   = entryAccount(entry)

    let candidates = crMutations.filter(
      (m) =>
        m.bankName.toUpperCase() === entry.bankName.toUpperCase() &&
        !usedMutations.has(m.id) &&
        withinTolerance(m.grossAmount, amount, TOL),
    )

    if (acct && candidates.length > 0) {
      const narrowed = candidates.filter((m) => m.accountNumber === acct)
      if (narrowed.length > 0) candidates = narrowed
    }

    if (candidates.length === 0) continue

    // Prefer bank ≤ cashier (bank always deducts MDR); then smallest absolute diff
    const under = candidates.filter((m) => m.grossAmount <= amount)
    const pool  = under.length > 0 ? under : candidates
    const best  = pool.reduce((a, b) =>
      Math.abs(a.grossAmount - amount) <= Math.abs(b.grossAmount - amount) ? a : b,
    )

    usedMutations.add(best.id)
    usedEntries.add(entry.id)
    result.matches.push({
      cashierEntryId: entry.id,
      bankMutationId: best.id,
      amountDiff: best.grossAmount - amount,
    })
  }

  // ── Finalise ──────────────────────────────────────────────────────────────
  for (const entry of entries) {
    if (!usedEntries.has(entry.id)) result.missingInBank.push(entry.id)
  }
  for (const m of crMutations) {
    if (!usedMutations.has(m.id)) result.unexpectedBank.push(m.id)
  }

  return result
}
