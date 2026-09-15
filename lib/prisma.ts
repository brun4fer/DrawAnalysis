import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { drawAnalysisPrisma?: PrismaClient };

export const prisma = globalForPrisma.drawAnalysisPrisma ?? new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
});

if (process.env.NODE_ENV !== "production") globalForPrisma.drawAnalysisPrisma = prisma;
