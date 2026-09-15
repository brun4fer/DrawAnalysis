import { cookies } from "next/headers";
import { createSessionToken, ensureInitialAdmin, SESSION_COOKIE, sessionCookieOptions, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { username?: string; password?: string };
    await ensureInitialAdmin();
    const username = body.username?.trim().toLowerCase() || "";
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user || !body.password || !verifyPassword(body.password, user.passwordHash) || !user.workspaceId) {
      return Response.json({ error: "Utilizador ou password inválidos." }, { status: 401 });
    }
    const token = createSessionToken({ userId: user.id, username: user.username, role: user.role, workspaceId: user.workspaceId });
    (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions);
    return Response.json({ id: user.id, name: user.name, username: user.username });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível iniciar sessão." }, { status: 400 });
  }
}
