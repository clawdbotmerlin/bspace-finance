# BSpace Finance

Internal finance reconciliation and settlement web application for BSpace group outlets.

The system automates daily reconciliation between **cashier POS data** and **bank settlement mutations**, replacing a manual Excel-based workflow. Finance staff upload cashier reports and bank statements; the engine matches transactions, flags discrepancies, and routes sessions through a sign-off approval flow.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS + shadcn/ui components |
| ORM | Prisma 5 |
| Database | PostgreSQL |
| Auth | NextAuth.js v4 (Credentials + JWT) |
| PDF Generation | Puppeteer |
| Excel Parsing | ExcelJS, xlsx |
| Deployment | PM2 on Ubuntu VPS |

---

## Core Concepts

### Reconciliation Flow

Each **reconciliation session** covers one outlet, one date, and one block type:

- **REG** — regular operating hours
- **EV** — event hours (separate session)

The flow has four stages:

```
uploading → reviewing → pending_signoff → signed_off
```

1. Finance uploads the cashier Excel file and bank mutation files for a given date
2. The system parses both and auto-matches transactions
3. Finance reviews unmatched items and resolves discrepancies
4. Manager or admin signs off the session

### Payment Types

| Code | Meaning |
|---|---|
| QR | QRIS / QR code payment |
| DEBIT | Debit card |
| KK | Kartu Kredit (credit card) |
| CASH | Cash (not reconciled against bank) |
| VOUCHER | Voucher payment |

### Banks

BCA, BNI, BRI, MANDIRI. Each bank has a different file format — BCA exports CSV, BNI exports XLS, BRI exports CSV, MANDIRI exports XLSX. The `BankColumnConfig` model stores parser configuration per bank (column positions, date formats, skip rows, etc.).

### Entities & Outlets

BSpace operates multiple legal entities, each with one or more restaurant/retail outlets. Each outlet has multiple EDC terminals mapped to specific bank accounts.

---

## Project Structure

```
app/
  (app)/                    # Authenticated routes (protected by middleware)
    layout.tsx              # OutletProvider + Navbar
    dashboard/              # Metrics dashboard
    sessions/new/           # Start a new reconciliation session
    history/                # Session history list
    admin/
      users/                # User management (admin only)
      master-data/          # Entities, Outlets, EDC Terminals (admin only)
      audit-log/            # Audit trail (admin only)
  (auth)/
    login/                  # Dark-themed login form
  api/
    auth/[...nextauth]/     # NextAuth handler
    entities/               # Entity CRUD
    entities/[id]/
    outlets/                # Outlet CRUD
    outlets/[id]/
    edc-terminals/          # EDC Terminal CRUD
    edc-terminals/[id]/
    users/                  # User management
    users/[id]/

components/
  layout/
    Navbar.tsx              # Fixed top navbar — role-filtered nav, outlet selector
  providers/
    OutletProvider.tsx      # React context for active outlet selection
  ui/                       # Component library (Button, Badge, Input, Dialog, etc.)

lib/
  auth.ts                   # NextAuth config — CredentialsProvider + bcrypt
  db.ts                     # Prisma client singleton
  guards.ts                 # withAuth() API wrapper, requireRole() server guard
  utils.ts                  # cn(), formatRupiah(), parseIndonesianNumber()

middleware.ts               # Route protection for all app/* paths

prisma/
  schema.prisma             # 10-model schema
  migrations/               # Migration history
  seed/
    index.ts                # Admin user seed
    masterData.ts           # Entities, outlets, EDC terminals from real data
```

---

## Database Schema

```
User              — email, name, passwordHash, role, outletId?, isActive
Entity            — legalName, shortName
Outlet            — entityId, name, code, address
EdcTerminal       — outletId, terminalCode, bankLabel, terminalId, accountNumber
BankColumnConfig  — per-bank parser config (skipRows, dateCol, amountCol, etc.)
ReconciliationSession — outletId, sessionDate, blockType, status, submittedBy, signedOffBy
CashierEntry      — sessionId, terminalCode, bankName, paymentType, amount, matchStatus
BankMutation      — sessionId, bankName, transactionDate, grossAmount, direction (CR/DR), matchStatus
Discrepancy       — sessionId, cashierEntryId?, bankMutationId?, type, status, resolvedBy
AuditLog          — userId, action, entityType, entityId, payloadSummary
```

### User Roles

| Role | Access |
|---|---|
| `admin` | Full access — all pages, user management, master data |
| `finance` | Reconciliation sessions, upload, review, discrepancy management |
| `manager` | Read-only dashboard and history; signs off sessions |

---

## Local Development

### Prerequisites

- Node.js 20+
- PostgreSQL running locally
- `tsx` for seed scripts (included as devDependency)

### Setup

```bash
# 1. Install dependencies
npm install --legacy-peer-deps

# 2. Create environment file
cp .env.example .env.local
# Fill in DATABASE_URL and NEXTAUTH_SECRET

# 3. Run migrations
npx prisma migrate deploy

# 4. Seed database (admin user + master data)
npm run db:seed

# 5. Start dev server
npm run dev -- -p 3002
```

Open http://localhost:3002 and log in with the default admin credentials.

### Environment Variables

```env
DATABASE_URL="postgresql://user:password@localhost:5432/bspace_finance"
NEXTAUTH_URL="http://localhost:3002"
NEXTAUTH_SECRET="your-secret-here"
UPLOAD_DIR="./uploads"
ADMIN_EMAIL="admin@bspace.com"
ADMIN_PASSWORD="admin123"
```

### Useful Scripts

```bash
npm run dev              # Start development server
npm run build            # Production build
npm run db:migrate       # Create + run new migration (dev)
npm run db:migrate:prod  # Run pending migrations (production)
npm run db:seed          # Seed admin user + master data (idempotent)
npm run db:studio        # Open Prisma Studio
npm run db:reset         # Reset database (dev only — destructive)
```

---

## Seeded Master Data

The seed script (`prisma/seed/masterData.ts`) populates real data extracted from sample files:

**8 Entities:**
- PT CAHAYA MENTARI BERSINAR
- CV BERKAT JAYA BAHAGIA
- CV TUNAS MUDA KREASI
- CV KARYA BERSAMA ANUGERAH
- CV BERSATU DALAM BERKARYA
- CV CAHAYA BERKAT AGUNG
- PT SARANA SAWANGAN JAYA BERSAMA
- CV BERKAT GEMILANG BERSATU

**1 Outlet:** Canna (PT CAHAYA MENTARI BERSINAR)

**12 EDC Terminals for Canna:**

| Terminal Code | Bank | Terminal ID | Account |
|---|---|---|---|
| 2995 | BCA | C2AP2381 | 1462392995 |
| 2995 | BCA | C2AP2382 | — |
| 2995 | BCA | C2BB8572 | — |
| 3029 | BCA | C2CT1910 | — |
| 3029 | BCA | C2AP2384 | — |
| 7-8774 | MANDIRI | MANDIRI-82266801 | 82266801 |
| 7-8774 | MANDIRI | MANDIRI-82032222 | 82032222 |
| 7-8774 | MANDIRI | MANDIRI-82032223 | 82032223 |
| 7-8774 | MANDIRI | MANDIRI-82032224 | 82032224 |
| 4670 | BNI | BNI-08388049 | 08388049 |
| 4670 | BNI | BNI-08388047 | 08388047 |
| 9 303 | BRI | BRI-10836385 | 10836385 |

---

## Deployment

**Production server:** `68.183.229.3:3001` (PM2 process: `bspace-finance`)

```bash
# Deploy latest changes
git push origin main && \
ssh root@68.183.229.3 \
  "cd /opt/bspace-finance/app && git pull origin main && \
   npm install --legacy-peer-deps && npm run build && pm2 restart bspace-finance"
```

To run migrations and re-seed on the server:

```bash
ssh root@68.183.229.3 "cd /opt/bspace-finance/app && \
  npx prisma migrate deploy && npm run db:seed"
```

---

## API Reference

All API routes require authentication (session cookie). Role requirements are noted.

### Entities
| Method | Route | Roles | Description |
|---|---|---|---|
| GET | `/api/entities` | all | List all entities with outlet count |
| POST | `/api/entities` | admin | Create entity |
| PUT | `/api/entities/[id]` | admin | Update entity |
| DELETE | `/api/entities/[id]` | admin | Delete entity |

### Outlets
| Method | Route | Roles | Description |
|---|---|---|---|
| GET | `/api/outlets` | all | List all outlets with entity name and terminal count |
| POST | `/api/outlets` | admin | Create outlet |
| PUT | `/api/outlets/[id]` | admin | Update outlet |
| DELETE | `/api/outlets/[id]` | admin | Delete outlet |

### EDC Terminals
| Method | Route | Roles | Description |
|---|---|---|---|
| GET | `/api/edc-terminals` | all | List all terminals with outlet info |
| POST | `/api/edc-terminals` | admin | Create terminal |
| PUT | `/api/edc-terminals/[id]` | admin | Update terminal |
| DELETE | `/api/edc-terminals/[id]` | admin | Delete terminal |

### Users
| Method | Route | Roles | Description |
|---|---|---|---|
| GET | `/api/users` | admin | List all users |
| POST | `/api/users` | admin | Create user with hashed password |
| PUT | `/api/users/[id]` | admin | Update role or isActive status |

---

## UI Conventions

- Language: **Bahasa Indonesia** throughout
- Navbar: dark navy `#0d1b2a`, 48px tall, underline active state
- Content background: `#f0f2f5`
- Font: Inter, 13px base
- Financial numbers: tabular numerals (`font-feature-settings: 'tnum'`)
- Indonesian currency format: `Rp 4.766.700` (dots as thousands separators)
- Status badges: green = Aktif, outline = Nonaktif
- Bank colour coding: BCA = blue, MANDIRI = yellow, BNI = orange, BRI = blue-dark

---

## Development Progress

| Ticket | Feature | Status |
|---|---|---|
| FIN-01 | Scaffold Next.js project | Done |
| FIN-02 | App shell: layout, navbar, design system | Done |
| FIN-03 | Auth system + user management | Done |
| FIN-04 | Master data — Entities, Outlets, EDC Terminals | Done |
| FIN-05 | Bank column config UI | Pending |
| FIN-06 | Cashier file upload + parser | Pending |
| FIN-07 | Bank mutation upload + parser | Pending |
| FIN-08 | Reconciliation matching engine | Pending |
| FIN-09 | Session review UI | Pending |
| FIN-10 | Sign-off approval flow | Pending |
| FIN-11 | Session history list | Pending |
| FIN-12 | Dashboard metrics | Pending |
| FIN-13 | PDF report generation | Pending |
| FIN-14 | Audit log UI | Pending |
| FIN-15 | Discrepancy management | Pending |
| FIN-16 | Notifications | Pending |
