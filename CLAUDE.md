# BSpace Finance — Claude Context

## Project Overview
Finance reconciliation & settlement web app for BSpace group outlets.
Stack: Next.js 14 (App Router) · TypeScript · Tailwind CSS · Prisma ORM · PostgreSQL · NextAuth.js

## Repos & Servers
- **GitHub**: https://github.com/clawdbotmerlin/bspace-finance.git
- **Dev server**: http://68.183.229.3:3001 (PM2 process: `bspace-finance`)
- **Server path**: `/opt/bspace-finance/app`
- **SSH**: `ssh -i ~/.ssh/merlin_aasha root@68.183.229.3`
- **Local dev**: `npm run dev -- -p 3002` → http://localhost:3002

## Default Credentials
- Admin login: `admin@bspace.com` / `admin123`
- DB: `postgresql://bspace_finance:bspace_finance@localhost:5432/bspace_finance`

## Deploy Workflow
```bash
git push origin main && \
ssh -i ~/.ssh/merlin_aasha root@68.183.229.3 \
  "cd /opt/bspace-finance/app && git pull origin main && \
   npm install --legacy-peer-deps && npm run build && pm2 restart bspace-finance"
```

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
| FRO-19 / FIN-09 | Session review UI | ⏳ Pending |
| FRO-20 / FIN-10 | Sign-off flow | ⏳ Pending |
| FRO-21 / FIN-11 | History & session list | ⏳ Pending |
| FRO-22 / FIN-12 | Dashboard metrics | ⏳ Pending |
| FRO-23 / FIN-13 | PDF report generation | ⏳ Pending |
| FRO-24 / FIN-14 | Audit log UI | ⏳ Pending |
| FRO-25 / FIN-15 | Discrepancy management | ⏳ Pending |
| FRO-26 / FIN-16 | Notifications | ⏳ Pending |
| FRO-27       | Self-healing parser (LLM re-config) | ⏳ Pending |

## Key File Map
```
app/
  (app)/          ← authenticated routes (protected by middleware)
    layout.tsx    ← OutletProvider + Navbar wrapper
    dashboard/
    sessions/new/
    history/
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

components/
  layout/Navbar.tsx       ← dark topbar, role-filtered nav, outlet selector
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
- **Entity**: legalName, shortName
- **Outlet**: entityId, name, code, address
- **EdcTerminal**: outletId, terminalCode, bankLabel, terminalId, accountNumber
- **BankColumnConfig**: per-bank parser config (skipRows, dateCol, amountCol, etc.)
- **ReconciliationSession**: outletId, sessionDate, blockType (REG|EV), status
- **CashierEntry**: sessionId, terminalCode, bankName, paymentType, amount, matchStatus
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

## Notes for Next Ticket (FIN-04: Master Data)
- CRUD for Entities, Outlets, EdcTerminals
- Seed script should also seed sample entities/outlets from the real BSpace data
- The entities/outlets are: (to be confirmed with user — check sample-files/ directory)
- Admin-only pages under `/admin/master-data`
