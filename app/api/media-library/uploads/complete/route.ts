import { handleApiError } from "@/lib/api";
import { requireWorkspace } from "@/lib/auth";
import { mediaPrisma } from "@/lib/media-prisma";
import { completeMediaMultipartUpload, headMediaObject, listMediaMultipartParts } from "@/lib/media-r2";
import { ensureMediaWorkspace } from "@/lib/media-workspace";
import { legacyVideoUploadPartSize, videoUploadPartSize } from "@/lib/video-upload";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const account = await requireWorkspace();
    const { mediaWorkspace } = await ensureMediaWorkspace(account);
    const body = await request.json();
    const assetId = typeof body.assetId === "string" ? body.assetId : "";
    const uploadId = typeof body.uploadId === "string" ? body.uploadId : "";
    const asset = await mediaPrisma.mediaAsset.findFirst({
      where: { id: assetId, mediaWorkspaceId: mediaWorkspace.id, storageStatus: "UPLOADING" },
    });
    if (!asset?.uploadId || asset.uploadId !== uploadId) {
      return Response.json({ error: "Este upload já não está ativo." }, { status: 400 });
    }

    const fileSize = Number(asset.fileSize);
    const requestedPartSize = Number(body.partSize);
    const parts = await listMediaMultipartParts(asset.storageKey, asset.uploadId);
    const allowedPartSizes = [...new Set([videoUploadPartSize(fileSize), legacyVideoUploadPartSize(fileSize)])];
    const partSize = allowedPartSizes.find((candidate) =>
      candidate === requestedPartSize && Math.ceil(fileSize / candidate) === parts.length
    );
    const expectedParts = partSize ? Math.ceil(fileSize / partSize) : 0;
    const unique = new Set(parts.map((part) => part.partNumber));
    if (parts.length !== expectedParts || unique.size !== expectedParts || parts.some((part) => {
      const expectedSize = part.partNumber === expectedParts
        ? fileSize - ((expectedParts - 1) * (partSize ?? 0))
        : partSize;
      return !Number.isInteger(part.partNumber)
        || part.partNumber < 1
        || part.partNumber > expectedParts
        || !part.etag
        || part.size !== expectedSize;
    })) {
      return Response.json({ error: "Faltam uma ou mais partes do vídeo." }, { status: 400 });
    }

    const etag = await completeMediaMultipartUpload(asset.storageKey, asset.uploadId, parts);
    const head = await headMediaObject(asset.storageKey);
    if (head.contentLength !== fileSize) throw new Error("O tamanho do vídeo guardado na cloud não corresponde ao ficheiro selecionado.");
    const uploadedAt = new Date();
    const saved = await mediaPrisma.mediaAsset.update({
      where: { id: asset.id },
      data: { storageStatus: "READY", uploadId: null, etag: etag || head.etag, uploadedAt },
    });
    return Response.json({
      asset: {
        id: saved.id,
        fileName: saved.fileName,
        fileSize: saved.fileSize.toString(),
        durationSeconds: saved.durationSeconds,
        mimeType: saved.mimeType,
        uploadedAt: saved.uploadedAt?.toISOString() ?? null,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
