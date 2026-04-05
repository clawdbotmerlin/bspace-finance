// Pure in-memory matching engine — no database calls.
// Takes plain data arrays, returns a MatchResult that the caller persists.
//
// Three-phase matching strategy:
//   Phase 1 — 1:1 exact/tolerance matching (single cashier entry ↔ single mutation)
//   Phase 2 — N:1 group matching via HO TGH gross total parsed from mutation description
//   Phase 3 — N:1 subset-sum fallback using mutation.grossAmount as target
//
// Group matches (Phase 2/3) are silently accepted — MDR is never flagged as a discrepancy.

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
  /** N:1 group matches — multiple cashier entries → one bank mutation (MDR silently accepted) */
  groupMatches: Array<{
    cashierEntryIds: string[]
    bankMutationId: string
    /** mutation.grossAmount - sum(entry.amount) — negative = MDR deducted by bank */
    amountDiff: number
    /** Gross total parsed from mutation description (null when Phase 3 fallback) */
    grossTarget: number | null
  }>
  /** CashierEntry IDs with amount === 0 or CASH/VOUCHER */
  zeros: string[]
  /** CashierEntry IDs with no corresponding bank mutation (non-zero, non-CASH/VOUCHER) */
  missingInBank: string[]
  /** BankMutation IDs (direction=CR) with no matched cashier entry */
  unexpectedBank: string[]
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function withinTolerance(a: number, b: number, tolerance: number): boolean {
  if (b === 0) return a === 0
  return Math.abs(a - b) / b <= tolerance
}

/**
 * Parse the pre-MDR gross total from a bank mutation description.
 * Handles formats: "HO TGH: 3.173.700", "HO TGH 3173700", "TGH: 3,173,700"
 * Supports Indonesian dot-as-thousands format.
 */
function parseGrossTotal(description: string | null): number | null {
  if (!description) return null
  // Match "HO TGH" or just "TGH" followed by optional separator then a number
  const match = description.match(/(?:HO\s+)?TGH[:\s]+([0-9][0-9.,]*)/i)
  if (!match) return null
  // Indonesian format: dots = thousands separator, comma = decimal separator
  const raw = match[1].replace(/\./g, '').replace(',', '.')
  const val = parseFloat(raw)
  return isNaN(val) ? null : val
}

/**
 * Find a subset of `entries` whose amounts sum within `tolerance` of `target`.
 * Uses DFS with sorted pruning — efficient for small groups (≤12 items).
 * Returns the matched subset or null if none found.
 * Only returns subsets with ≥ 2 entries (N:1 matching; 1:1 is handled in Phase 1).
 */
function findSubsetWithSum(
  entries: EngineEntry[],
  target: number,
  tolerance: number,
  maxSize: number = 12,
): EngineEntry[] | null {
  if (entries.length < 2 || target <= 0) return null

  // Sort ascending so we can prune early when sum exceeds target
  const sorted = [...entries].sort((a, b) => a.amount - b.amount)
  let found: EngineEntry[] | null = null

  function dfs(idx: number, current: EngineEntry[], currentSum: number): void {
    if (found) return

    if (current.length >= 2 && withinTolerance(currentSum, target, tolerance)) {
      found = [...current]
      return
    }

    if (idx >= sorted.length || current.length >= maxSize) return

    for (let i = idx; i < sorted.length; i++) {
      if (found) return
      const entry = sorted[i]
      const newSum = currentSum + entry.amount

      // Prune: adding this (or any larger) entry would overshoot beyond tolerance
      if (newSum > target * (1 + tolerance)) break

      current.push(entry)
      dfs(i + 1, current, newSum)
      current.pop()
    }
  }

  dfs(0, [], 0)
  return found
}

// ── Main engine ──────────────────────────────────────────────────────────────

export function runMatchingEngine(
  entries: EngineEntry[],
  mutations: EngineMutation[],
  terminals: EngineTerminal[],
): MatchResult {
  const TOLERANCE = 0.05 // 5% — covers MDR + rounding

  // Build bankLabel → accountNumber lookup (normalised to uppercase)
  const accountMap = new Map<string, string | null>()
  for (const t of terminals) {
    accountMap.set(t.bankLabel.toUpperCase(), t.accountNumber)
  }

  /** Resolve the accountNumber for a cashier entry via its terminal. */
  function entryAccountNumber(entry: EngineEntry): string | null {
    const key = `${entry.bankName} ${entry.terminalId ?? ''}`.trim().toUpperCase()
    return accountMap.get(key) ?? null
  }

  // Track consumed resources across all phases
  const usedMutations = new Set<string>()
  const usedEntries   = new Set<string>()

  const result: MatchResult = {
    matches: [],
    groupMatches: [],
    zeros: [],
    missingInBank: [],
    unexpectedBank: [],
  }

  // Only credit mutations participate
  const crMutations = mutations.filter((m) => m.direction === 'CR')

  // ── Phase 1: 1:1 matching ─────────────────────────────────────────────────
  for (const entry of entries) {
    const amount = entry.amount

    // Zero-amount entries
    if (amount === 0) {
      result.zeros.push(entry.id)
      usedEntries.add(entry.id)
      continue
    }

    // Cash / Voucher — no bank settlement expected
    if (SKIP_PAYMENT_TYPES.has(entry.paymentType.toUpperCase())) {
      result.zeros.push(entry.id)
      usedEntries.add(entry.id)
      continue
    }

    const accountNumber = entryAccountNumber(entry)

    // Candidates: same bank, within tolerance, not yet used
    let candidates = crMutations.filter(
      (m) =>
        m.bankName.toUpperCase() === entry.bankName.toUpperCase() &&
        !usedMutations.has(m.id) &&
        withinTolerance(m.grossAmount, amount, TOLERANCE),
    )

    // Narrow by account number when available
    if (accountNumber && candidates.length > 0) {
      const narrowed = candidates.filter((m) => m.accountNumber === accountNumber)
      if (narrowed.length > 0) candidates = narrowed
    }

    if (candidates.length === 0) continue // will be handled by Phase 2/3 or missingInBank

    // Prefer bank ≤ cashier (MDR always deducted); among those pick smallest abs diff
    const underCandidates = candidates.filter((m) => m.grossAmount <= amount)
    const pool = underCandidates.length > 0 ? underCandidates : candidates
    const best = pool.reduce((a, b) =>
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

  // ── Helper: build groups of still-unmatched EDC entries by bankName ────────
  // (grouped by bank only; account number is used for further narrowing inside the loop)
  function buildEntryGroups(): Map<string, EngineEntry[]> {
    const groups = new Map<string, EngineEntry[]>()
    for (const entry of entries) {
      if (usedEntries.has(entry.id)) continue
      if (SKIP_PAYMENT_TYPES.has(entry.paymentType.toUpperCase())) continue
      if (entry.amount <= 0) continue
      const key = entry.bankName.toUpperCase()
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(entry)
    }
    return groups
  }

  // ── Phase 2: N:1 via HO TGH gross total ──────────────────────────────────
  {
    const entryGroups = buildEntryGroups()

    for (const mutation of crMutations) {
      if (usedMutations.has(mutation.id)) continue

      const grossTarget = parseGrossTotal(mutation.description)
      if (grossTarget === null) continue

      const bankKey = mutation.bankName.toUpperCase()
      const pool = (entryGroups.get(bankKey) ?? []).filter((e) => !usedEntries.has(e.id))
      if (pool.length < 2) continue

      // Narrow by account number when both sides have it
      const narrowed = mutation.accountNumber
        ? pool.filter((e) => {
            const acct = entryAccountNumber(e)
            return acct === null || acct === mutation.accountNumber
          })
        : pool

      const subset = findSubsetWithSum(narrowed.length >= 2 ? narrowed : pool, grossTarget, TOLERANCE)
      if (!subset) continue

      const sumAmount = subset.reduce((s, e) => s + e.amount, 0)
      const ids = subset.map((e) => e.id)

      result.groupMatches.push({
        cashierEntryIds: ids,
        bankMutationId: mutation.id,
        amountDiff: mutation.grossAmount - sumAmount,
        grossTarget,
      })
      usedMutations.add(mutation.id)
      for (const id of ids) usedEntries.add(id)
    }
  }

  // ── Phase 3: N:1 subset-sum fallback (mutation.grossAmount as target) ─────
  {
    const entryGroups = buildEntryGroups()

    for (const mutation of crMutations) {
      if (usedMutations.has(mutation.id)) continue

      const bankKey = mutation.bankName.toUpperCase()
      const pool = (entryGroups.get(bankKey) ?? []).filter((e) => !usedEntries.has(e.id))
      if (pool.length < 2) continue

      const narrowed = mutation.accountNumber
        ? pool.filter((e) => {
            const acct = entryAccountNumber(e)
            return acct === null || acct === mutation.accountNumber
          })
        : pool

      const subset = findSubsetWithSum(narrowed.length >= 2 ? narrowed : pool, mutation.grossAmount, TOLERANCE)
      if (!subset) continue

      const sumAmount = subset.reduce((s, e) => s + e.amount, 0)
      const ids = subset.map((e) => e.id)

      result.groupMatches.push({
        cashierEntryIds: ids,
        bankMutationId: mutation.id,
        amountDiff: mutation.grossAmount - sumAmount,
        grossTarget: null,
      })
      usedMutations.add(mutation.id)
      for (const id of ids) usedEntries.add(id)
    }
  }

  // ── Finalise: compute missingInBank and unexpectedBank ────────────────────

  for (const entry of entries) {
    if (usedEntries.has(entry.id)) continue
    if (SKIP_PAYMENT_TYPES.has(entry.paymentType.toUpperCase())) continue
    if (entry.amount === 0) continue
    result.missingInBank.push(entry.id)
  }

  for (const m of crMutations) {
    if (!usedMutations.has(m.id)) {
      result.unexpectedBank.push(m.id)
    }
  }

  return result
}
