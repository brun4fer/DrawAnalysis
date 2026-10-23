import "dotenv/config";
import { mediaPrisma } from "../lib/media-prisma";
import { createMediaPlaybackUrl, presignMediaMultipartParts } from "../lib/media-r2";

const configuredOrigins = process.argv.slice(2).filter((value) => /^https?:\/\//.test(value));
const origins = configuredOrigins.length ? configuredOrigins : [
  "http://localhost:3000",
  "http://localhost:3001",
  "https://draw-analysis.vercel.app",
  "https://ap-gameplan.vercel.app",
];

async function probe(url: string, origin: string, method: "GET" | "OPTIONS") {
  const response = await fetch(url, {
    method,
    headers: method === "OPTIONS"
      ? {
          Origin: origin,
          "Access-Control-Request-Method": "PUT",
          "Access-Control-Request-Headers": "content-type",
        }
      : { Origin: origin, Range: "bytes=0-0" },
    redirect: "manual",
  });
  return {
    method,
    origin,
    status: response.status,
    allowOrigin: response.headers.get("access-control-allow-origin"),
    allowMethods: response.headers.get("access-control-allow-methods"),
    allowHeaders: response.headers.get("access-control-allow-headers"),
    contentType: response.headers.get("content-type"),
    contentLength: response.headers.get("content-length"),
    contentRange: response.headers.get("content-range"),
    acceptRanges: response.headers.get("accept-ranges"),
  };
}

async function main() {
  const asset = await mediaPrisma.mediaAsset.findFirst({
    where: { storageStatus: "READY" },
    orderBy: { fileSize: "asc" },
    select: { storageKey: true, mimeType: true, fileSize: true, uploadedAt: true },
  });
  if (!asset) throw new Error("Não existe um vídeo READY para testar o CORS.");

  const playbackUrl = createMediaPlaybackUrl(asset.storageKey).url;
  const uploadProbeUrl = presignMediaMultipartParts(asset.storageKey, "cors-diagnostic", [1])[0].url;
  const results = [];
  for (const origin of origins) {
    results.push(await probe(playbackUrl, origin, "GET"));
    results.push(await probe(uploadProbeUrl, origin, "OPTIONS"));
  }
  console.table(results);
  console.log({
    asset: {
      mimeType: asset.mimeType,
      fileSize: asset.fileSize.toString(),
      uploadedAt: asset.uploadedAt?.toISOString() ?? null,
    },
    configuredOrigins: origins,
  });
}

main().finally(() => mediaPrisma.$disconnect());
