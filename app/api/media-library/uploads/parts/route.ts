import { handleApiError } from "@/lib/api";
import { requireWorkspace } from "@/lib/auth";
import { mediaPrisma } from "@/lib/media-prisma";
import { presignMediaMultipartParts } from "@/lib/media-r2";
import { ensureMediaWorkspace } from "@/lib/media-workspace";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const account = await requireWorkspace();
    const { mediaWorkspace } = await ensureMediaWorkspace(account);
    const body = await request.json();
    const assetId = typeof body.assetId === "string" ? body.assetId : "";
    const uploadId = typeof body.uploadId === "string" ? body.uploadId : "";
    const partNumbers: number[] = Array.isArray(body.partNumbers)
      ? [...new Set<number>(body.partNumbers.map(Number))]
      : [];
    if (!assetId || !uploadId || !partNumbers.length || partNumbers.length > 500 || partNumbers.some((part) => !Number.isInteger(part) || part < 1 || part > 10_000)) {
      return Response.json({ error: "O pedido de upload multipart não é válido." }, { status: 400 });
    }
    const asset = await mediaPrisma.mediaAsset.findFirst({
      where: { id: assetId, mediaWorkspaceId: mediaWorkspace.id, storageStatus: "UPLOADING" },
    });
    if (!asset?.uploadId || asset.uploadId !== uploadId) {
      return Response.json({ error: "Este upload já não está ativo." }, { status: 400 });
    }
    return Response.json({ parts: presignMediaMultipartParts(asset.storageKey, asset.uploadId, partNumbers) });
  } catch (error) {
    return handleApiError(error);
  }
}
