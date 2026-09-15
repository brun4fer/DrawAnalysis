import { NextRequest, NextResponse } from "next/server";

const COOKIE = "draw_analysis_session";
const publicPaths = ["/login", "/register", "/api/auth/login", "/api/auth/register", "/api/health"];

function bytes(value: string) { return new TextEncoder().encode(value); }
function base64url(value: ArrayBuffer) { return btoa(String.fromCharCode(...new Uint8Array(value))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_"); }

async function validSession(token?: string) {
  const secret = process.env.AUTH_SECRET || (process.env.NODE_ENV === "production" ? "" : "draw-analysis-local-development-secret");
  if (!token || !secret) return false;
  const [data, signature] = token.split(".");
  if (!data || !signature) return false;
  const key = await crypto.subtle.importKey("raw", bytes(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  if (base64url(await crypto.subtle.sign("HMAC", key, bytes(data))) !== signature) return false;
  try {
    const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
    return (JSON.parse(atob(normalized)) as { exp: number }).exp > Date.now();
  } catch { return false; }
}

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (publicPaths.includes(path) || path.startsWith("/_next") || path.includes(".")) return NextResponse.next();
  if (await validSession(request.cookies.get(COOKIE)?.value)) return NextResponse.next();
  if (path.startsWith("/api/")) return NextResponse.json({ error: "Sessão inválida ou expirada." }, { status: 401 });
  const url = new URL("/login", request.url);
  url.searchParams.set("next", path);
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
