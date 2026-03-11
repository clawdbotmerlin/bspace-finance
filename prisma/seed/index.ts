import { PrismaClient } from '@prisma/client'
import { hash } from 'bcryptjs'
import { seedMasterData } from './masterData'
import { seedBankConfigs } from './bankConfigs'

const prisma = new PrismaClient()

async function main() {
  const email = process.env.ADMIN_EMAIL ?? 'admin@bspace.com'
  const password = process.env.ADMIN_PASSWORD ?? 'admin123'
  const name = process.env.ADMIN_NAME ?? 'Admin'

  const existing = await prisma.user.findUnique({ where: { email } })
  if (!existing) {
    const passwordHash = await hash(password, 12)
    await prisma.user.create({
      data: { email, name, passwordHash, role: 'admin', isActive: true },
    })
    console.log(`Created admin: ${email}`)
  } else {
    console.log(`Admin already exists: ${email}`)
  }

  console.log('Seeding master data...')
  await seedMasterData()
  console.log('Seeding bank configs...')
  await seedBankConfigs()
  console.log('Done.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
