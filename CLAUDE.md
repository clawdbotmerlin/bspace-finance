# BSpace Finance — Claude Context

## Project Overview
Finance reconciliation & settlement web app for BSpace group outlets.
Stack: Next.js 14 (App Router) · TypeScript · Tailwind CSS · Prisma ORM · PostgreSQL · NextAuth.js

## Repos & Servers
- **GitHub**: https://github.com/clawdbotmerlin/bspace-finance.git
- **Dev server**: http://68.183.229.3:3001 (PM2 process: `bspace-finance`)
- **Server path**: `/opt/bspace-finance/app`
- **SSH**: `sshpass -p 'makeithappen' ssh -o StrictHostKeyChecking=no root@68.183.229.3`
- **Local dev**: `npm run dev -- -p 3002` → http://localhost:3002

## Default Credentials
- Admin login: `admin@bspace.com` / `admin123`
- DB: `postgresql://bspace_finance:bspace_finance@localhost:5432/bspace_finance`

## Deploy Workflow
Server uses NVM; must activate Node 18 before installing/building (Node 14 default breaks Prisma preinstall).
```bash
git push origin main
# Then SSH and run:
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 18 && \
cd /opt/bspace-finance/app && git pull origin main && \
npm install --legacy-peer-deps && npm run build && pm2 restart bspace-finance
```
Use `expect` with password `makeithappen` for automated deploy (see previous sessions).

## Linear Project
- Team: Frontier (FRO), Project: BSpace Finance
- API key: stored in local env / ask project owner (do not commit)
- Done state ID: `af3921c8-e6a0-4455-b058-b9db05b52772`

## Ticket Progress
| Ticket | Title | Status |
|--------|-------|--------|
| FRO-11 / FIN-01 | Scaffold Next.js project | ✅ Done |
| FRO-12 / FIN-02 | App shell: layout, navbar, design system | ✅ Done |
| FRO-13 / FIN-03 | Auth system + user management | ✅ Done |
| FRO-14 / FIN-04 | Master data (Entities, Outlets, EDC) | ✅ Done |
| FRO-15 / FIN-05 | Bank column config UI | ✅ Done |
| FRO-16 / FIN-06 | Cashier file upload + parser | ✅ Done |
| FRO-17 / FIN-07 | Bank mutation upload + parser | ✅ Done |
| FRO-18 / FIN-08 | Reconciliation engine | ✅ Done |
| FRO-19 / FIN-09 | Session review UI | ✅ Done |
| FRO-20 / FIN-10 | Sign-off flow | ✅ Done |
| FRO-21 / FIN-11 | History & session list | ✅ Done |
| FRO-22 / FIN-12 | Dashboard metrics | ✅ Done |
| FRO-23 / FIN-13 | PDF report generation | ✅ Done |
| FRO-24 / FIN-14 | Audit log UI | ✅ Done |
| FRO-25 / FIN-15 | Discrepancy management | ✅ Done |
| FRO-26 / FIN-16 | Notifications | ✅ Done |
| FRO-27       | Self-healing parser (LLM re-config) | ✅ Done |
| FRO-28 / FIN-17 | Cashier parser v3 template support | ✅ Done |
| FRO-29       | Multi-file bank upload in Upload Mutasi Bank step | ✅ Done |
| FRO-30       | Session review UI polish (Excel-style layout, kasir columns, ringkasan) | ✅ Done |
| FRO-31       | Discrepancy ignore action (discrepancies page + review page) | ✅ Done |
| FRO-32       | Delete reconciliation session feature | ✅ Done |
| FRO-33       | Add mutation file to existing session + re-run reconciliation | ✅ Done |
| FRO-34       | Decouple outlets from entities — entityId optional | ✅ Done |

## Key File Map
```
app/
  (app)/          ← authenticated routes (protected by middleware)
    layout.tsx    ← OutletProvider + Navbar wrapper
    dashboard/            ← FIN-12: metrics dashboard (stat cards + recent sessions)
    sessions/new/        ← 3-step upload wizard
    sessions/[id]/review/ ← FIN-09: review matched/unmatched/discrepancies
    sessions/[id]/signoff/ ← FIN-10: sign-off detail (manager approve/reject)
    signoff/              ← FIN-10: sign-off queue (pending_signoff sessions)
    history/               ← FIN-11: full session list with filters & sorting
    discrepancies/         ← FIN-15: cross-session discrepancy management (admin+finance)
    admin/
      users/      ← user management (admin only)
      master-data/
      audit-log/
  (auth)/
    login/        ← dark-themed login form
  api/
    auth/[...nextauth]/   ← NextAuth handler
    outlets/              ← GET outlets for current session
    users/                ← GET list, POST create (admin only)
    users/[id]/           ← PUT edit role / toggle isActive (admin only)
    sessions/             ← GET list, POST create
    sessions/[id]/        ← GET session detail
    sessions/[id]/upload/ ← POST cashier + bank mutation files
    sessions/[id]/run-matching/ ← POST run reconciliation engine
    sessions/[id]/matches/      ← GET matched pairs + zero count
    sessions/[id]/suggest-bank-config/ ← POST AI column-mapping suggestion (finance+admin)
    sessions/[id]/discrepancies/           ← GET all discrepancies
    sessions/[id]/discrepancies/[did]/     ← PUT update discrepancy status/notes (incl. ignore)
    sessions/[id]/upload/bankmutation      ← POST append additional bank mutation files (never replaces)
    sessions/[id]/submit/       ← POST transition to pending_signoff
    sessions/[id]/signoff/      ← POST approve/reject (manager)
    sessions/[id]/report/       ← GET generate PDF report (signed_off only)
    audit-logs/                 ← GET paginated audit log (admin only, filter by action/entityType/date)
    discrepancies/              ← GET cross-session discrepancies + summary stats (admin+finance)
    notifications/              ← GET role-aware counts (pendingSignoff, openDiscrepancies)

components/
  layout/Navbar.tsx       ← dark topbar, role-filtered nav, outlet selector, notification bell
  providers/OutletProvider.tsx  ← React context for outlet selection
  ui/                     ← shadcn-style: button, badge, input, label,
                            dialog, dropdown-menu, select, separator

lib/
  auth.ts     ← NextAuth authOptions (CredentialsProvider + bcrypt)
  db.ts       ← Prisma singleton
  guards.ts   ← withAuth() for API routes, requireRole() for server components
  utils.ts    ← cn(), formatRupiah(), parseIndonesianNumber()

middleware.ts   ← protects /dashboard/*, /sessions/*, /history/*, /admin/*

prisma/
  schema.prisma       ← 10 models, full schema
  seed/index.ts       ← seeds admin user from ADMIN_EMAIL/ADMIN_PASSWORD env
  migrations/20260311114820_init/
```

## DB Schema Summary
- **User**: id, email, name, passwordHash, role (admin|finance|manager), outletId?, isActive
- **Entity**: legalName, shortName (standalone, not required to link to outlets)
- **Outlet**: entityId? (optional), name, code, address — outlets are standalone; one outlet can represent multiple entities
- **EdcTerminal**: outletId, terminalCode, bankLabel, terminalId, accountNumber
- **BankColumnConfig**: per-bank parser config (skipRows, dateCol, amountCol, etc.)
- **ReconciliationSession**: outletId, sessionDate, blockType (REG|EV), status, kasirNames (Json)
- **CashierEntry**: sessionId, terminalCode, bankName, paymentType, amount, matchStatus, blockType, kasirName, perKasirAmounts (Json)
- **BankMutation**: sessionId, bankName, transactionDate, grossAmount, direction (CR|DR), matchStatus
- **Discrepancy**: sessionId, type, status, resolvedBy
- **AuditLog**: userId, action, entityType, entityId

## Business Domain Notes
- Reconciliation compares **cashier POS data** vs **bank mutations** per outlet per day
- Block types: **REG** (regular hours) and **EV** (event hours) — separate sessions
- Payment types: QR, DEBIT, KK (credit card), CASH, VOUCHER
- Banks in use: BCA, BNI, BRI, MANDIRI
- Cashier file: Excel with dynamic column structure, 3–5 POS columns per sheet
- Indonesian number format: `Rp 4.766.700` (dots as thousands separators)
- Matching uses Post Date for BNI

## UI Conventions
- Navbar background: `bg-[#0e1726]` (dark navy)
- Active nav: `bg-blue-600/20 text-blue-300`
- Role-only nav items: Data Master, Log Audit, Pengguna → admin only
- Outlet selector in navbar → stored in `OutletProvider` context + sessionStorage
- All text in Indonesian (Bahasa Indonesia)

## Cashier Template v3 Column Layout (TEMPLATE_KASIR_FINSETTLE_v3_final.xlsx)
- Sheet names: `"01"`, `"02"` … `"31"` (day of month, zero-padded) — same as before
- Block detection: title row contains `"BLOK REG"` or `"BLOK EV"` in col A
- Col A (0): KODE EDC → terminalCode
- Col B (1): NAMA BANK / TERMINAL → bankName + terminalId (split on first space)
- Col C (2): JENIS → paymentType (QR / DEBIT / KK / CASH / VOUCHER)
- Col D (3): ENTITAS → entityNameRaw  ← **was col J (9) in old format**
- Col E–J (4–9): per-POS amounts (not used directly)
- Col K (10): TOTAL = SUM(E:J) → amount  ← **was col I (8) in old format**
- Col L (11): NOTA BILL → notaBill  ← **was col K (10) in old format**
- Col M (12): CATATAN (notes, not stored)

## FRO-27: Self-healing Parser Notes
- Triggered when bank mutation upload returns 0 parsed mutations
- `POST /api/sessions/[id]/suggest-bank-config` accepts the same file + bankName FormData
- Reads first 40 rows with `xlsx`, sends to Moonshot Kimi K2 (`kimi-k2`) via OpenAI-compatible API
- Returns `{ configId, suggestion: { skipRowsTop, skipRowsBottom, columnMapping } }`
- UI shows editable JSON textarea; user can modify before saving
- `PUT /api/bank-configs/[id]` (now allows finance role) persists the accepted config
- After save, "Coba Ulang Upload" re-runs the bank upload with the now-corrected config
- Requires `MOONSHOT_API_KEY` env var on the server (add to `/opt/bspace-finance/app/.env` then `pm2 restart bspace-finance`)

## Roles
- DB values unchanged: `admin`, `finance`, `manager`
- UI labels: admin → **Administrator**, finance → **Finance Staff**, manager → **Finance Head**
- Finance Head = manager role = can sign off sessions
- Sign-off page has "Lihat Detail Rekonsiliasi" link back to review page for Finance Head to inspect before approving

## Discrepancy Ignore (FRO-31)
- Discrepancy `status` values: `open`, `resolved`, `ignored`
- "Ignore" button on both `/discrepancies` page and review page
- "Ignore All" bulk action on `/discrepancies` page
- Ignored discrepancies are excluded from warning banner counts on review page

## Delete Session (FRO-32)
- Available on review page (admin + finance roles)
- Cascades: deletes CashierEntries, BankMutations, Discrepancies for the session
- Redirects to `/history` after deletion

## Add Mutation File (FRO-33)
- "Tambah File Mutasi" button on review page (shown when session is not yet signed off)
- Opens modal: select bank name + upload file(s)
- Always appends — never replaces existing bank mutations for that session
- Automatically re-runs matching after upload
- Use case: staff forgot to upload a bank file, wants to add it without deleting the session

## Review Page (FRO-30) — Architecture Notes

### Layout
- Excel-style table mirroring the cashier file structure
- REG block always renders before EV block
- Each block is a card (`rounded-xl border shadow-sm`) followed immediately by its Ringkasan card
- Unexpected mutations render as a separate card **outside** the main tabs card
- Tabs: Semua Entri / Perlu Perhatian / Cocok Saja

### BlockSection
- Blue header (REG) / purple header (EV) with subtotal
- Per-bank sub-sections, each as a `rounded-lg border shadow-sm` card
- Columns: Kode | Bank/Terminal | Jenis | Entitas | [kasir cols…] | Total | Status Bank
- Total column has `bg-slate-100` / `bg-slate-200` header for visual separation
- CASH and VOUCHER rows render below the EDC bank cards in their own card
- SUBTOTAL row at bottom (dark navy `bg-slate-800`)

### Kasir Columns
- `kasirNames: string[]` stored as JSON on `ReconciliationSession`, populated on cashier upload
- `perKasirAmounts: Record<string, number>` stored as JSON on `CashierEntry`
- `kasirColMap` in parser: cols 4–11 (E–J), filtered for valid names (≤20 chars, no arrows/instruction text)

### RingkasanSection
- Shows per-kasir totals: TOTAL SALES (green), yellow manual rows (shown as —), per-bank breakdown, CASH, TOTAL PAYMENT, SELISIH
- `kasirNames.length === 0` → returns null (hidden if no kasir data)

### Summary Cards
- All amounts/counts computed client-side from `entries` state — never rely on stale API summary values
- "Tidak Ada di Bank": uses `edcEntries.filter(e => e.matchStatus === 'unmatched')` for both amount and count
- "Nol/Lewati": uses `entries.filter(e => e.matchStatus === 'zero').length`
- Warning banner: only counts `missing_in_bank` open discrepancies (not unexpected mutations)
- Success banner: shown when zero open missing_in_bank discrepancies

### Action Logic
- "Tindak" button: only on EDC entries (`missing_in_bank`, `amount_mismatch`) — NOT on unexpected mutations
- Unexpected mutations are informational only (bank has money, no cashier record)
- Missing in bank = high alert (cashier has sales, no bank transfer received)

### Known Bugs Fixed
- **ExcelJS formula cells**: `cellNum()` extracts `.result` from `{formula, result}` objects
- **CASH/VOUCHER matchStatus**: run-matching reset all to `'unmatched'` but engine skipped CASH/VOUCHER. Fixed by pushing them to `result.zeros` in `lib/engine/matching.ts`
- **Duplicate VOUCHER entries**: RINGKASAN summary rows triggered VOUCHER detection. Fixed by requiring `VALID_PAYMENT_TYPES.has(paymentTypeRaw)` for VOUCHER rows
- **"← Ganti nama kasir" as kasir name**: filtered in parser with length/char/regex guard

### Tooltip Component
- Custom `Tooltip` component in review page: 700ms show delay (setTimeout), instant hide
- Used on: summary cards (wide=true), truncated entitas text, bank mutation description
- Dark slate-900 pill with arrow indicator

