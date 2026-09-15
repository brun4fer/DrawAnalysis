import "dotenv/config";
import { ensureInitialAdmin } from "../lib/auth";
import { prisma } from "../lib/prisma";

async function main() {
  await ensureInitialAdmin();
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
