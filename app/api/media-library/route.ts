import { handleApiError } from "@/lib/api";
import { requireWorkspace } from "@/lib/auth";
import { mediaPrisma } from "@/lib/media-prisma";
import { ensureMediaWorkspace } from "@/lib/media-workspace";

export async function GET() {
  try {
    const account = await requireWorkspace();
    const { mediaWorkspace } = await ensureMediaWorkspace(account);
    const records = await mediaPrisma.mediaAsset.findMany({
      where: { mediaWorkspaceId: mediaWorkspace.id, storageStatus: "READY" },
      select: {
        id: true,
        fileName: true,
        fileSize: true,
        mimeType: true,
        durationSeconds: true,
        createdAt: true,
        uploadedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
    const assets = records.map((asset) => ({ ...asset, fileSize: asset.fileSize.toString() }));
    return Response.json({ assets });
  } catch (error) {
    return handleApiError(error);
  }
}
