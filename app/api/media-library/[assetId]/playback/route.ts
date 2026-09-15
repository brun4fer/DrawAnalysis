import { handleApiError } from "@/lib/api";
import { requireWorkspace } from "@/lib/auth";
import { mediaPrisma } from "@/lib/media-prisma";
import { createMediaPlaybackUrl } from "@/lib/media-r2";
import { ensureMediaWorkspace } from "@/lib/media-workspace";

interface Context { params: Promise<{ assetId: string }> }

export async function GET(_: Request, context: Context) {
  try {
    const account = await requireWorkspace();
    const { mediaWorkspace } = await ensureMediaWorkspace(account);
    const { assetId } = await context.params;
    const asset = await mediaPrisma.mediaAsset.findFirst({
      where: { id: assetId, mediaWorkspaceId: mediaWorkspace.id, storageStatus: "READY" },
      select: { id: true, fileName: true, storageKey: true, durationSeconds: true },
    });
    if (!asset) return Response.json({ error: "Vídeo não encontrado neste workspace." }, { status: 404 });
    return Response.json({ asset: { id: asset.id, fileName: asset.fileName, durationSeconds: asset.durationSeconds }, ...createMediaPlaybackUrl(asset.storageKey) });
  } catch (error) {
    return handleApiError(error);
  }
}
