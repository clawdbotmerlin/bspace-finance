import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function seedMasterData() {
  // ── Entities ──────────────────────────────────────────────────────────────
  const entities = await Promise.all([
    prisma.entity.upsert({
      where: { id: 'entity-cahaya-mentari' },
      update: {},
      create: { id: 'entity-cahaya-mentari', legalName: 'PT CAHAYA MENTARI BERSINAR', shortName: 'Cahaya Mentari' },
    }),
    prisma.entity.upsert({
      where: { id: 'entity-berkat-jaya' },
      update: {},
      create: { id: 'entity-berkat-jaya', legalName: 'CV BERKAT JAYA BAHAGIA', shortName: 'Berkat Jaya' },
    }),
    prisma.entity.upsert({
      where: { id: 'entity-tunas-muda' },
      update: {},
      create: { id: 'entity-tunas-muda', legalName: 'CV TUNAS MUDA KREASI', shortName: 'Tunas Muda' },
    }),
    prisma.entity.upsert({
      where: { id: 'entity-karya-bersama' },
      update: {},
      create: { id: 'entity-karya-bersama', legalName: 'CV KARYA BERSAMA ANUGERAH', shortName: 'Karya Bersama' },
    }),
    prisma.entity.upsert({
      where: { id: 'entity-bersatu-berkarya' },
      update: {},
      create: { id: 'entity-bersatu-berkarya', legalName: 'CV BERSATU DALAM BERKARYA', shortName: 'Bersatu Berkarya' },
    }),
    prisma.entity.upsert({
      where: { id: 'entity-cahaya-berkat' },
      update: {},
      create: { id: 'entity-cahaya-berkat', legalName: 'CV CAHAYA BERKAT AGUNG', shortName: 'Cahaya Berkat' },
    }),
    prisma.entity.upsert({
      where: { id: 'entity-sarana-sawangan' },
      update: {},
      create: { id: 'entity-sarana-sawangan', legalName: 'PT SARANA SAWANGAN JAYA BERSAMA', shortName: 'Sarana Sawangan' },
    }),
    prisma.entity.upsert({
      where: { id: 'entity-berkat-gemilang' },
      update: {},
      create: { id: 'entity-berkat-gemilang', legalName: 'CV BERKAT GEMILANG BERSATU', shortName: 'Berkat Gemilang' },
    }),
  ])

  console.log(`  Seeded ${entities.length} entities`)

  // ── Outlets ───────────────────────────────────────────────────────────────
  const canna = await prisma.outlet.upsert({
    where: { code: 'CANNA' },
    update: {},
    create: {
      id: 'outlet-canna',
      entityId: 'entity-cahaya-mentari',
      name: 'Canna',
      code: 'CANNA',
      address: 'Sawangan, Depok',
    },
  })

  console.log(`  Seeded outlet: ${canna.name}`)

  // ── EDC Terminals for Canna ───────────────────────────────────────────────
  const terminals = [
    // BCA – terminal code 2995
    { terminalCode: '2995', bankLabel: 'BCA C2AP2381', terminalId: 'C2AP2381', accountNumber: '1462392995' },
    { terminalCode: '2995', bankLabel: 'BCA C2AP2382', terminalId: 'C2AP2382', accountNumber: null },
    { terminalCode: '2995', bankLabel: 'BCA C2BB8572', terminalId: 'C2BB8572', accountNumber: null },
    // BCA – terminal code 3029
    { terminalCode: '3029', bankLabel: 'BCA C2CT1910', terminalId: 'C2CT1910', accountNumber: null },
    { terminalCode: '3029', bankLabel: 'BCA C2AP2384', terminalId: 'C2AP2384', accountNumber: null },
    // MANDIRI – terminal code 7-8774
    { terminalCode: '7-8774', bankLabel: 'MANDIRI 82266801', terminalId: 'MANDIRI-82266801', accountNumber: '82266801' },
    { terminalCode: '7-8774', bankLabel: 'MANDIRI 82032222', terminalId: 'MANDIRI-82032222', accountNumber: '82032222' },
    { terminalCode: '7-8774', bankLabel: 'MANDIRI 82032223', terminalId: 'MANDIRI-82032223', accountNumber: '82032223' },
    { terminalCode: '7-8774', bankLabel: 'MANDIRI 82032224', terminalId: 'MANDIRI-82032224', accountNumber: '82032224' },
    // BNI – terminal code 4670
    { terminalCode: '4670', bankLabel: 'BNI 08388049', terminalId: 'BNI-08388049', accountNumber: '08388049' },
    { terminalCode: '4670', bankLabel: 'BNI 08388047', terminalId: 'BNI-08388047', accountNumber: '08388047' },
    // BRI – terminal code 9 303
    { terminalCode: '9 303', bankLabel: 'BRI 10836385', terminalId: 'BRI-10836385', accountNumber: '10836385' },
  ]

  for (const t of terminals) {
    await prisma.edcTerminal.upsert({
      where: { terminalId: t.terminalId },
      update: {},
      create: {
        outletId: canna.id,
        terminalCode: t.terminalCode,
        bankLabel: t.bankLabel,
        terminalId: t.terminalId,
        accountNumber: t.accountNumber ?? undefined,
      },
    })
  }

  console.log(`  Seeded ${terminals.length} EDC terminals for Canna`)
}
