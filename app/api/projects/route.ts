import type { Prisma } from "@prisma/client";
import { handleApiError, readJson } from "@/lib/api";
import { requireWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const { workspace } = await requireWorkspace();
    const projects = await prisma.project.findMany({ where: { workspaceId: workspace.id }, select: { id: true, name: true, version: true, createdAt: true, updatedAt: true }, orderBy: { updatedAt: "desc" } });
    return Response.json({ projects });
  } catch (error) { return handleApiError(error); }
}

export async function POST(request: Request) {
  try {
    const { user, workspace } = await requireWorkspace();
    const body = await readJson<{ name?: string; data?: unknown }>(request);
    const name = body.name?.trim() || "Nova apresentação";
    if (name.length > 100) throw new Error("O nome é demasiado longo.");
    const project = await prisma.project.create({ data: { name, workspaceId: workspace.id, createdById: user.id, data: (body.data ?? {}) as Prisma.InputJsonValue } });
    return Response.json({ project }, { status: 201 });
  } catch (error) { return handleApiError(error); }
}
