import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * Bank column configs derived from analysis of real sample mutation files.
 *
 * BCA (CSV): 6 header rows, combined amount+direction in one cell ("1,000.00 CR")
 * BNI (XLS): 11 header rows, Post Date as Excel serial, separate Db/Cr column
 * BRI (CSV): 1 header row, separate MUTASI_DEBET / MUTASI_KREDIT columns, Indonesian dot-separator amounts
 * MANDIRI (XLSX): 1 header row, separate Debit / Credit columns, date as DD/MM/YY
 */
export const BANK_CONFIGS = [
  {
    bankName: 'BCA',
    fileFormat: 'csv',
    skipRowsTop: 6,
    skipRowsBottom: 4,
    dateCol: '0',
    dateFormat: 'DD/MM/YYYY',
    amountCol: '3',
    directionCol: null,
    directionCreditValue: 'CR',
    grossAmountRegex: '([\\d,]+\\.\\d+)\\s+(CR|DB)',
    columnMapping: {
      type: 'combined_amount_direction',
      dateCol: 0,
      descriptionCol: 1,
      amountAndDirectionCol: 3,
      creditIndicator: 'CR',
      debitIndicator: 'DB',
      notes: 'Amount cell contains both value and direction, e.g. "1,731,366.00 CR"',
    },
  },
  {
    bankName: 'BNI',
    fileFormat: 'xls',
    skipRowsTop: 11,
    skipRowsBottom: 0,
    dateCol: '7',
    dateFormat: 'EXCEL_SERIAL',
    amountCol: '20',
    directionCol: '22',
    directionCreditValue: 'C',
    grossAmountRegex: null,
    columnMapping: {
      type: 'separated_direction',
      dateCol: 7,
      descriptionCol: 12,
      amountCol: 20,
      directionCol: 22,
      creditIndicator: 'C',
      debitIndicator: 'D',
      refCol: 11,
      notes: 'Post Date is Excel serial number float. Direction column: C=credit, D=debit.',
    },
  },
  {
    bankName: 'BRI',
    fileFormat: 'csv',
    skipRowsTop: 1,
    skipRowsBottom: 0,
    dateCol: '2',
    dateFormat: 'YYYY-MM-DD HH:mm:ss',
    amountCol: null,
    directionCol: '11',
    directionCreditValue: 'Cr',
    grossAmountRegex: null,
    columnMapping: {
      type: 'dual_column',
      dateCol: 2,
      descriptionCol: 6,
      debitCol: 8,
      creditCol: 9,
      directionCol: 11,
      creditIndicator: 'Cr',
      notes: 'Indonesian dot-separated amounts (e.g. "1.242.065,00"). TGL_TRAN includes time component.',
    },
  },
  {
    bankName: 'MANDIRI',
    fileFormat: 'xlsx',
    skipRowsTop: 1,
    skipRowsBottom: 0,
    dateCol: '1',
    dateFormat: 'DD/MM/YY',
    amountCol: null,
    directionCol: null,
    directionCreditValue: null,
    grossAmountRegex: null,
    columnMapping: {
      type: 'dual_column',
      dateCol: 1,
      descriptionCol: 4,
      debitCol: 7,
      creditCol: 8,
      refCol: 6,
      notes: 'Direction determined by which of Debit/Credit column is non-zero.',
    },
  },
]

export async function seedBankConfigs() {
  for (const config of BANK_CONFIGS) {
    await prisma.bankColumnConfig.upsert({
      where: { bankName: config.bankName },
      update: {},
      create: config,
    })
  }
  console.log(`  Seeded ${BANK_CONFIGS.length} bank column configs (BCA, BNI, BRI, MANDIRI)`)
}
