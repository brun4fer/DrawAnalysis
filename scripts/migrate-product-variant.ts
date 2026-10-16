import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const databaseUrl = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  throw new Error("Defina DIRECT_URL ou DATABASE_URL antes de executar a migração.");
}

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

async function main() {
  const before = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*) AS count FROM "Project"`;

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Project"
    ADD COLUMN IF NOT EXISTS "product_variant" TEXT NOT NULL DEFAULT 'tactidraw'
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "Project_workspaceId_product_variant_updatedAt_idx"
    ON "Project"("workspaceId", "product_variant", "updatedAt")
  `);

  const after = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*) AS count FROM "Project"`;
  const beforeCount = before[0]?.count ?? BigInt(0);
  const afterCount = after[0]?.count ?? BigInt(0);

  if (beforeCount !== afterCount) {
    throw new Error(`A contagem de projetos mudou durante a migração (${beforeCount} → ${afterCount}).`);
  }

  console.log(`Migração concluída. ${afterCount} projetos preservados e associados a Opponent Video Analysis por defeito.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
