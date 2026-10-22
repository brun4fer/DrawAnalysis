import { randomUUID } from "node:crypto";
import { handleApiError } from "@/lib/api";
import { requireWorkspace } from "@/lib/auth";
import { mediaPrisma } from "@/lib/media-prisma";
import { abortMediaMultipartUpload, createMediaMultipartUpload, listMediaMultipartParts } from "@/lib/media-r2";
import { ensureMediaWorkspace } from "@/lib/media-workspace";
import { inferVideoUploadPartSize, videoUploadPartSize } from "@/lib/video-upload";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 5 * 1024 ** 4 - 5 * 1024 ** 3;

function serializeAsset(asset: {
  id: string;
  fileName: string;
  fileSize: bigint;
  durationSeconds: number;
  mimeType: string;
  uploadedAt: Date | null;
}) {
  return {
    id: asset.id,
    fileName: asset.fileName,
    fileSize: asset.fileSize.toString(),
    durationSeconds: asset.durationSeconds,
    mimeType: asset.mimeType,
    uploadedAt: asset.uploadedAt?.toISOString() ?? null,
  };
}

export async function POST(request: Request) {
  let created: { id: string; key: string; uploadId: string } | null = null;
  try {
    const account = await requireWorkspace();
    const { appId, mediaWorkspace } = await ensureMediaWorkspace(account);
    const body = await request.json();
    const fileName = typeof body.fileName === "string" ? body.fileName.trim() : "";
    const fileSize = Number(body.fileSize);
    const durationSeconds = Number(body.durationSeconds);
    const mimeType = typeof body.mimeType === "string" && body.mimeType.startsWith("video/") ? body.mimeType : "video/mp4";
    const lastModified = body.lastModified ? new Date(body.lastModified) : null;
    if (!fileName || !Number.isSafeInteger(fileSize) || fileSize <= 0 || fileSize > MAX_FILE_SIZE) {
      return Response.json({ error: "O tamanho do vídeo não é válido." }, { status: 400 });
    }
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      return Response.json({ error: "Não foi possível determinar a duração do vídeo." }, { status: 400 });
    }
    if (lastModified && Number.isNaN(lastModified.getTime())) {
      return Response.json({ error: "A data do ficheiro não é válida." }, { status: 400 });
    }

    const partSize = videoUploadPartSize(fileSize);
    const existing = await mediaPrisma.mediaAsset.findFirst({
      where: {
        mediaWorkspaceId: mediaWorkspace.id,
        fileName,
        fileSize: BigInt(fileSize),
        durationSeconds: { gte: durationSeconds - .1, lte: durationSeconds + .1 },
        mimeType,
        lastModified,
        storageStatus: { in: ["READY", "UPLOADING"] },
      },
      orderBy: { updatedAt: "desc" },
    });
    if (existing?.storageStatus === "READY") {
      return Response.json({ asset: serializeAsset(existing), uploadId: null, partSize, completedParts: [], alreadyReady: true });
    }
    if (existing?.storageStatus === "UPLOADING" && existing.uploadId) {
      try {
        const completedParts = await listMediaMultipartParts(existing.storageKey, existing.uploadId);
        return Response.json({
          asset: serializeAsset(existing),
          uploadId: existing.uploadId,
          partSize: inferVideoUploadPartSize(fileSize, completedParts),
          completedParts,
          alreadyReady: false,
        });
      } catch {
        await mediaPrisma.mediaAsset.update({
          where: { id: existing.id },
          data: { storageStatus: "FAILED", uploadId: null },
        }).catch(() => undefined);
      }
    }

    const assetId = randomUUID();
    const storageKey = `workspaces/${mediaWorkspace.id}/assets/${assetId}/video`;
    const uploadId = await createMediaMultipartUpload(storageKey, mimeType);
    created = { id: assetId, key: storageKey, uploadId };
    const asset = await mediaPrisma.mediaAsset.create({
      data: {
        id: assetId,
        mediaWorkspaceId: mediaWorkspace.id,
        createdByAppId: appId,
        fileName,
        fileSize: BigInt(fileSize),
        durationSeconds,
        mimeType,
        lastModified,
        storageKey,
        storageStatus: "UPLOADING",
        uploadId,
      },
    });
    return Response.json({ asset: serializeAsset(asset), uploadId, partSize, completedParts: [], alreadyReady: false }, { status: 201 });
  } catch (error) {
    if (created) {
      await abortMediaMultipartUpload(created.key, created.uploadId).catch(() => undefined);
      await mediaPrisma.mediaAsset.updateMany({
        where: { id: created.id },
        data: { storageStatus: "FAILED", uploadId: null },
      }).catch(() => undefined);
    }
    return handleApiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const account = await requireWorkspace();
    const { mediaWorkspace } = await ensureMediaWorkspace(account);
    const body = await request.json().catch(() => ({}));
    const assetId = typeof body.assetId === "string" ? body.assetId : "";
    const uploadId = typeof body.uploadId === "string" ? body.uploadId : "";
    const asset = await mediaPrisma.mediaAsset.findFirst({
      where: { id: assetId, mediaWorkspaceId: mediaWorkspace.id, storageStatus: "UPLOADING" },
    });
    if (asset?.uploadId && (!uploadId || uploadId === asset.uploadId)) {
      await abortMediaMultipartUpload(asset.storageKey, asset.uploadId).catch(() => undefined);
      await mediaPrisma.mediaAsset.update({
        where: { id: asset.id },
        data: { storageStatus: "FAILED", uploadId: null },
      });
    }
    return Response.json({ aborted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
