import type { Prisma } from "@prisma/client";
import { handleApiError, readJson } from "@/lib/api";
import { requireWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface Context { params: Promise<{ projectId: string }> }

export async function GET(_: Request, context: Context) {
  try {
    const { workspace } = await requireWorkspace();
    const { projectId } = await context.params;
    const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId: workspace.id } });
    if (!project) return Response.json({ error: "Projeto não encontrado." }, { status: 404 });
    return Response.json({ project });
  } catch (error) { return handleApiError(error); }
}

export async function PUT(request: Request, context: Context) {
  try {
    const { workspace } = await requireWorkspace();
    const { projectId } = await context.params;
    const existing = await prisma.project.findFirst({ where: { id: projectId, workspaceId: workspace.id }, select: { id: true } });
    if (!existing) return Response.json({ error: "Projeto não encontrado." }, { status: 404 });
    const body = await readJson<{ name?: string; data?: unknown; version?: number }>(request);
    const project = await prisma.project.update({ where: { id: projectId }, data: { name: body.name?.trim(), data: body.data as Prisma.InputJsonValue, version: { increment: 1 } } });
    return Response.json({ project });
  } catch (error) { return handleApiError(error); }
}

export async function DELETE(_: Request, context: Context) {
  try {
    const { workspace } = await requireWorkspace();
    const { projectId } = await context.params;
    await prisma.project.deleteMany({ where: { id: projectId, workspaceId: workspace.id } });
    return Response.json({ ok: true });
  } catch (error) { return handleApiError(error); }
}
