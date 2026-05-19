// Pure in-memory matching engine — no database calls.
// Takes plain data arrays, returns a MatchResult that the caller persists.
//
// Two-phase matching strategy:
//   Phase 1 — 1:1 matching: single cashier entry ↔ single mutation within 3% tolerance.
//   Phase 2 — N:1 batch matching: bank often settles multiple QR/EDC entries from the
//             same terminal in one mutation. After Phase 1, scan remaining unmatched
//             mutations and try subset-sum on unmatched entries (same bank, 3% tolerance).
//             When "MID : <id>" appears in the mutation description, candidates are
//             narrowed to entries whose terminalId contains that MID for higher confidence.
// CASH and VOUCHER entries are always skipped (pushed to zeros).

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
 * Parse MID (Merchant/Terminal ID) from a bank mutation description.
 * Handles patterns like:
 *   "KR OTOMATIS TANGGAL :03/05 MID : 885001637731 CANNA 1 HO QR"
 *   "MID:885001637731"
 */
function parseMID(description: string | null): string | null {
  if (!description) return null
  const match = description.match(/MID\s*:\s*(\d{6,})/i)
  return match ? match[1] : null
}

/**
 * DFS subset-sum: find a subset of entries (≥ 2) whose amounts sum within
 * `tol` of `target`. Sorted ascending + upper-bound pruning keeps it fast
 * for typical batch sizes of 2–15.
 */
function findSubsetWithSum(
  entries: EngineEntry[],
  target: number,
  tol: number,
  maxSize = 20,
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
      if (newSum > target * (1 + tol)) break // prune: all remaining are larger
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

  // ── Phase 2: N:1 batch matching (QR / EDC batch settlements) ─────────────
  // Bank settles multiple same-terminal entries in one mutation.
  // Try subset-sum on remaining unmatched entries per bank.
  {
    // Build bank → unmatched entries map
    const byBank = new Map<string, EngineEntry[]>()
    for (const entry of entries) {
      if (usedEntries.has(entry.id)) continue
      const key = entry.bankName.toUpperCase()
      if (!byBank.has(key)) byBank.set(key, [])
      byBank.get(key)!.push(entry)
    }

    for (const mutation of crMutations) {
      if (usedMutations.has(mutation.id)) continue

      const bankKey = mutation.bankName.toUpperCase()
      let pool = (byBank.get(bankKey) ?? []).filter(e => !usedEntries.has(e.id))
      if (pool.length < 2) continue

      // Narrow by MID when available (e.g. "MID : 885001637731" in description)
      const mid = parseMID(mutation.description)
      if (mid) {
        const narrowed = pool.filter(e => e.terminalId && e.terminalId.includes(mid))
        if (narrowed.length >= 2) pool = narrowed
      }

      // Narrow by account number when both sides have one
      if (mutation.accountNumber) {
        const narrowed = pool.filter(e => {
          const acct = entryAccount(e)
          return acct === null || acct === mutation.accountNumber
        })
        if (narrowed.length >= 2) pool = narrowed
      }

      const subset = findSubsetWithSum(pool, mutation.grossAmount, TOL)
      if (!subset) continue

      const sumAmount = subset.reduce((s, e) => s + e.amount, 0)
      result.groupMatches.push({
        cashierEntryIds: subset.map(e => e.id),
        bankMutationId:  mutation.id,
        amountDiff:      mutation.grossAmount - sumAmount,
        grossTarget:     mutation.grossAmount,
      })
      usedMutations.add(mutation.id)
      for (const e of subset) usedEntries.add(e.id)
    }
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
