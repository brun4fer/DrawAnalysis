import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "./prisma";

export const SESSION_COOKIE = "draw_analysis_session";

function authSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret && process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET não está configurado.");
  return secret || "draw-analysis-local-development-secret";
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function validatePassword(password: string) {
  if (password.length < 10 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
    throw new Error("A password deve ter pelo menos 10 caracteres, incluindo maiúscula, minúscula e número.");
  }
}

type SessionPayload = { userId: string; username: string; role: string; workspaceId: string; exp: number };

export function createSessionToken(payload: Omit<SessionPayload, "exp">) {
  const data = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 1000 * 60 * 60 * 24 * 7 })).toString("base64url");
  const signature = createHmac("sha256", authSecret()).update(data).digest("base64url");
  return `${data}.${signature}`;
}

export function readSessionToken(token?: string | null): SessionPayload | null {
  if (!token) return null;
  const [data, signature] = token.split(".");
  if (!data || !signature) return null;
  const expected = createHmac("sha256", authSecret()).update(data).digest("base64url");
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString()) as SessionPayload;
    return payload.exp > Date.now() ? payload : null;
  } catch { return null; }
}

export async function currentSession() {
  return readSessionToken((await cookies()).get(SESSION_COOKIE)?.value);
}

export async function requireWorkspace() {
  const session = await currentSession();
  if (!session) throw new Error("Sessão inválida ou expirada.");
  const user = await prisma.user.findFirst({ where: { id: session.userId, workspaceId: session.workspaceId }, include: { workspace: true } });
  if (!user?.workspace) throw new Error("A conta já não tem um workspace válido.");
  return { session, user, workspace: user.workspace };
}

export async function ensureInitialAdmin() {
  if (await prisma.user.count()) return;
  const username = process.env.INITIAL_ADMIN_USERNAME?.trim().toLowerCase();
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  if (!username || !password) return;
  validatePassword(password);
  await prisma.$transaction(async (transaction) => {
    const workspace = await transaction.workspace.create({ data: { name: process.env.INITIAL_ADMIN_WORKSPACE?.trim() || "Paulo Workspace" } });
    await transaction.user.create({ data: { name: process.env.INITIAL_ADMIN_NAME?.trim() || "Paulo", username, passwordHash: hashPassword(password), role: "admin", workspaceId: workspace.id } });
  });
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 7,
};
