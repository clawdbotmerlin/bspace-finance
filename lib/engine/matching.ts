// Pure in-memory matching engine — no database calls.
// Takes plain data arrays, returns a MatchResult that the caller persists.
//
// Two-phase matching strategy:
//   Phase 1 — N:1 group matching via "HO TGH" gross total in mutation description.
//              Runs FIRST so Phase 2 cannot steal entries that belong to a batch.
//   Phase 2 — 1:1 matching: single cashier entry ↔ single mutation within 1% tolerance.
//
// There is NO blind subset-sum fallback. Without explicit "HO TGH" evidence a group
// match is just a guess — false matches are worse than honest "Tidak cocok" entries
// that finance staff can review manually.
//
// Group matches (Phase 1) are silently accepted — MDR difference is never flagged.

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

/**
 * Parse the pre-MDR gross total from a bank mutation description.
 * Requires the exact prefix "HO TGH" to avoid false matches on other codes.
 * Handles: "HO TGH: 3.173.700", "HO TGH 3173700"
 * Indonesian format: dot = thousands separator, comma = decimal separator.
 */
function parseGrossTotal(description: string | null): number | null {
  if (!description) return null
  const match = description.match(/HO\s+TGH[:\s]+([0-9][0-9.,]*)/i)
  if (!match) return null
  const raw = match[1].replace(/\./g, '').replace(',', '.')
  const val = parseFloat(raw)
  return isNaN(val) ? null : val
}

/**
 * DFS subset-sum: find a subset of entries (≥ 2) whose amounts sum within
 * `tol` of `target`. Sorted ascending + upper-bound pruning keeps it fast
 * for typical group sizes of 2–9.
 */
function findSubsetWithSum(
  entries: EngineEntry[],
  target: number,
  tol: number,
  maxSize: number = 12,
): EngineEntry[] | null {
  if (entries.length < 2 || target <= 0) return null

  const sorted = [...entries].sort((a, b) => a.amount - b.amount)
  let found: EngineEntry[] | null = null

  function dfs(idx: number, current: EngineEntry[], sum: number): void {
    if (found) return
    if (current.length >= 2 && withinTolerance(sum, target, tol)) {
      found = [...current]
      return
    }
    if (idx >= sorted.length || current.length >= maxSize) return

    for (let i = idx; i < sorted.length; i++) {
      if (found) return
      const e = sorted[i]
      const newSum = sum + e.amount
      if (newSum > target * (1 + tol)) break // all remaining entries are larger — prune
      current.push(e)
      dfs(i + 1, current, newSum)
      current.pop()
    }
  }

  dfs(0, [], 0)
  return found
}

// ── Main engine ───────────────────────────────────────────────────────────────

export function runMatchingEngine(
  entries: EngineEntry[],
  mutations: EngineMutation[],
  terminals: EngineTerminal[],
): MatchResult {
  const TOL_GROUP   = 0.02 // 2% — HO TGH is pre-MDR gross; only minor rounding
  const TOL_ONE2ONE = 0.05 // 5% — covers KK MDR up to ~3%; Phase 1 already runs first
                           //       so batch entries are consumed before Phase 2 can steal them

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

  // ── Phase 1: N:1 group matching via "HO TGH" ─────────────────────────────
  //
  // Must run BEFORE Phase 2 so that 1:1 matching cannot steal individual entries
  // that belong to a multi-entry batch settlement.
  {
    // Group unmatched entries by bankName for quick lookup
    const byBank = new Map<string, EngineEntry[]>()
    for (const entry of entries) {
      if (usedEntries.has(entry.id)) continue
      const key = entry.bankName.toUpperCase()
      if (!byBank.has(key)) byBank.set(key, [])
      byBank.get(key)!.push(entry)
    }

    for (const mutation of crMutations) {
      if (usedMutations.has(mutation.id)) continue

      const grossTarget = parseGrossTotal(mutation.description)
      if (grossTarget === null) continue

      const bankKey = mutation.bankName.toUpperCase()
      let pool = (byBank.get(bankKey) ?? []).filter((e) => !usedEntries.has(e.id))
      if (pool.length < 2) continue

      // Narrow by account number when both sides have one
      if (mutation.accountNumber) {
        const narrowed = pool.filter((e) => {
          const acct = entryAccount(e)
          return acct === null || acct === mutation.accountNumber
        })
        if (narrowed.length >= 2) pool = narrowed
      }

      const subset = findSubsetWithSum(pool, grossTarget, TOL_GROUP)
      if (!subset) continue

      const sumAmount = subset.reduce((s, e) => s + e.amount, 0)
      result.groupMatches.push({
        cashierEntryIds: subset.map((e) => e.id),
        bankMutationId: mutation.id,
        amountDiff: mutation.grossAmount - sumAmount,
        grossTarget,
      })
      usedMutations.add(mutation.id)
      for (const e of subset) usedEntries.add(e.id)
    }
  }

  // ── Phase 2: 1:1 individual matching ─────────────────────────────────────
  for (const entry of entries) {
    if (usedEntries.has(entry.id)) continue

    const amount = entry.amount
    const acct   = entryAccount(entry)

    let candidates = crMutations.filter(
      (m) =>
        m.bankName.toUpperCase() === entry.bankName.toUpperCase() &&
        !usedMutations.has(m.id) &&
        withinTolerance(m.grossAmount, amount, TOL_ONE2ONE),
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
