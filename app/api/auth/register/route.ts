import { Prisma } from "@prisma/client";
import { cookies } from "next/headers";
import { createSessionToken, ensureInitialAdmin, hashPassword, SESSION_COOKIE, sessionCookieOptions, validatePassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { name?: string; username?: string; password?: string; confirmation?: string; workspaceName?: string };
    const name = body.name?.trim() || "";
    const username = body.username?.trim().toLowerCase() || "";
    const workspaceName = body.workspaceName?.trim() || "";
    const password = body.password || "";
    if (name.length < 2 || name.length > 80) throw new Error("O nome deve ter entre 2 e 80 caracteres.");
    if (!/^[a-z0-9._-]{3,40}$/.test(username)) throw new Error("O utilizador deve ter 3–40 caracteres: letras, números, ponto, hífen ou underscore.");
    if (workspaceName.length < 2 || workspaceName.length > 80) throw new Error("O nome do workspace deve ter entre 2 e 80 caracteres.");
    if (password !== body.confirmation) throw new Error("As passwords não coincidem.");
    validatePassword(password);
    await ensureInitialAdmin();
    const user = await prisma.user.create({
      data: { name, username, passwordHash: hashPassword(password), workspace: { create: { name: workspaceName } } },
    });
    const token = createSessionToken({ userId: user.id, username: user.username, role: user.role, workspaceId: user.workspaceId! });
    (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions);
    return Response.json({ id: user.id, name: user.name, username: user.username }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ error: "Este utilizador já existe." }, { status: 409 });
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível criar a conta." }, { status: 400 });
  }
}
