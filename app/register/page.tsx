"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", username: "", workspaceName: "", password: "", confirmation: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const field = (name: keyof typeof form) => ({ value: form[name], onChange: (event: React.ChangeEvent<HTMLInputElement>) => setForm((value) => ({ ...value, [name]: event.target.value })) });

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível criar a conta.");
      router.replace("/");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível criar a conta.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <form className="auth-card auth-card-wide" onSubmit={submit}>
        <div className="auth-brand"><span className="brand-mark">T</span><span>Tacti<strong>Draw</strong></span></div>
        <div><span className="auth-kicker">NOVO WORKSPACE</span><h1>Criar conta</h1><p>Os dados e ligações cloud ficam separados por workspace.</p></div>
        <div className="auth-grid">
          <label>Nome<input autoFocus autoComplete="name" {...field("name")} required /></label>
          <label>Utilizador<input autoComplete="username" {...field("username")} required /></label>
        </div>
        <label>Nome do workspace<input {...field("workspaceName")} placeholder="Ex.: Equipa Sénior" required /></label>
        <div className="auth-grid">
          <label>Password<input type="password" autoComplete="new-password" {...field("password")} required /></label>
          <label>Confirmar password<input type="password" autoComplete="new-password" {...field("confirmation")} required /></label>
        </div>
        <small className="auth-help">Mínimo de 10 caracteres, com maiúscula, minúscula e número.</small>
        {error && <div className="auth-error">{error}</div>}
        <button className="auth-submit" disabled={busy}>{busy ? "A criar…" : "Criar conta e workspace"}</button>
        <p className="auth-switch">Já tem conta? <Link href="/login">Iniciar sessão</Link></p>
      </form>
    </main>
  );
}
