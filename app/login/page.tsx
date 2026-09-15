"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível iniciar sessão.");
      router.replace(searchParams.get("next") || "/");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível iniciar sessão.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="auth-card" onSubmit={submit}>
      <div className="auth-brand"><span className="brand-mark">T</span><span>Tacti<strong>Draw</strong></span></div>
      <div><span className="auth-kicker">ÁREA PRIVADA</span><h1>Iniciar sessão</h1><p>Entre no seu workspace de análise.</p></div>
      <label>Utilizador<input autoFocus autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required /></label>
      <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
      {error && <div className="auth-error">{error}</div>}
      <button className="auth-submit" disabled={busy}>{busy ? "A entrar…" : "Entrar"}</button>
      <p className="auth-switch">Ainda não tem conta? <Link href="/register">Criar conta</Link></p>
    </form>
  );
}

export default function LoginPage() {
  return <main className="auth-shell"><Suspense><LoginForm /></Suspense></main>;
}
