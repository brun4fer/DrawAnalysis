import { PrismaClient as MediaPrismaClient } from "@draw-analysis/media-client";

const globalForMedia = globalThis as unknown as { drawAnalysisMediaPrisma?: MediaPrismaClient };
export const mediaPrisma = globalForMedia.drawAnalysisMediaPrisma ?? new MediaPrismaClient();
if (process.env.NODE_ENV !== "production") globalForMedia.drawAnalysisMediaPrisma = mediaPrisma;
