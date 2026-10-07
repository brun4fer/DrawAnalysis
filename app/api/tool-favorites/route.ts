import type { Prisma } from "@prisma/client";
import { handleApiError, readJson } from "@/lib/api";
import { requireWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userSettingsProjectName } from "@/lib/settings";

interface FavoritesData { favorites?: unknown[] }

export async function GET() {
  try {
    const { user, workspace } = await requireWorkspace();
    const settings = await prisma.project.findFirst({
      where: { workspaceId: workspace.id, createdById: user.id, name: userSettingsProjectName(user.id) },
      select: { data: true },
    });
    const data = settings?.data as FavoritesData | undefined;
    return Response.json({ favorites: Array.isArray(data?.favorites) ? data.favorites : [] });
  } catch (error) { return handleApiError(error); }
}

export async function PUT(request: Request) {
  try {
    const { user, workspace } = await requireWorkspace();
    const body = await readJson<{ favorites?: unknown }>(request);
    if (!Array.isArray(body.favorites) || body.favorites.length > 24) throw new Error("A lista de favoritos não é válida.");
    const name = userSettingsProjectName(user.id);
    const data = { favorites: body.favorites } as Prisma.InputJsonValue;
    const current = await prisma.project.findFirst({ where: { workspaceId: workspace.id, createdById: user.id, name }, select: { id: true } });
    if (current) await prisma.project.update({ where: { id: current.id }, data: { data } });
    else await prisma.project.create({ data: { name, data, workspaceId: workspace.id, createdById: user.id } });
    return Response.json({ ok: true });
  } catch (error) { return handleApiError(error); }
}
