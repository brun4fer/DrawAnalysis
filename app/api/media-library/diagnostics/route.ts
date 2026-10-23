import { randomUUID } from "node:crypto";
import { handleApiError } from "@/lib/api";
import { requireWorkspace } from "@/lib/auth";
import { mediaPrisma } from "@/lib/media-prisma";
import { probeMediaCors } from "@/lib/media-r2";
import { ensureMediaWorkspace } from "@/lib/media-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requestOrigin(request: Request) {
  const candidates = [request.headers.get("origin"), request.headers.get("referer")];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol === "https:" || parsed.hostname === "localhost") return parsed.origin;
    } catch {
      // Continue with the request URL, which is always controlled by this deployment.
    }
  }
  return new URL(request.url).origin;
}

function endpointHost() {
  try { return new URL(process.env.MEDIA_R2_ENDPOINT || "").host || null; }
  catch { return null; }
}

export async function GET(request: Request) {
  const diagnosticId = randomUUID();
  try {
    const account = await requireWorkspace();
    const { mediaWorkspace } = await ensureMediaWorkspace(account);
    const asset = await mediaPrisma.mediaAsset.findFirst({
      where: { mediaWorkspaceId: mediaWorkspace.id, storageStatus: "READY" },
      orderBy: { uploadedAt: "desc" },
      select: { storageKey: true, mimeType: true, fileSize: true, uploadedAt: true },
    });
    const origin = requestOrigin(request);
    const cors = asset ? await probeMediaCors(asset.storageKey, origin) : null;
    return Response.json({
      diagnosticId,
      checkedAt: new Date().toISOString(),
      environment: {
        node: process.env.NODE_ENV,
        vercel: process.env.VERCEL_ENV || null,
        commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || null,
        region: process.env.VERCEL_REGION || null,
        appOrigin: origin,
      },
      configuration: {
        mediaDatabase: Boolean(process.env.MEDIA_DATABASE_URL),
        r2Endpoint: Boolean(process.env.MEDIA_R2_ENDPOINT),
        r2EndpointHost: endpointHost(),
        r2Bucket: Boolean(process.env.MEDIA_R2_BUCKET_NAME),
        r2AccessKey: Boolean(process.env.MEDIA_R2_ACCESS_KEY_ID),
        r2Secret: Boolean(process.env.MEDIA_R2_SECRET_ACCESS_KEY),
        mediaAppId: Boolean(process.env.MEDIA_LIBRARY_APP_ID),
      },
      asset: asset ? {
        available: true,
        mimeType: asset.mimeType,
        fileSize: asset.fileSize.toString(),
        uploadedAt: asset.uploadedAt?.toISOString() ?? null,
      } : { available: false },
      cors,
    }, { headers: { "Cache-Control": "no-store", "X-Cloud-Diagnostic-Id": diagnosticId } });
  } catch (error) {
    const response = handleApiError(error);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Cloud-Diagnostic-Id", diagnosticId);
    return response;
  }
}
