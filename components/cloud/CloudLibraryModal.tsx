"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Cloud, Copy, Film, Link2, RefreshCw, X } from "lucide-react";

export interface CloudAssetSelection {
  id: string;
  fileName: string;
  durationSeconds: number;
  url: string;
}

interface Asset { id: string; fileName: string; fileSize: string; durationSeconds: number; mimeType: string; uploadedAt?: string | null }
interface Props { onClose: () => void; onSelect: (asset: CloudAssetSelection) => void }

const formatSize = (raw: string) => {
  const bytes = Number(raw);
  if (!Number.isFinite(bytes)) return "";
  return bytes >= 1_000_000_000 ? `${(bytes / 1_000_000_000).toFixed(1)} GB` : `${(bytes / 1_000_000).toFixed(1)} MB`;
};

export function CloudLibraryModal({ onClose, onSelect }: Props) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [linkedApps, setLinkedApps] = useState<string[]>([]);
  const [claimCode, setClaimCode] = useState("");
  const [generatedCode, setGeneratedCode] = useState("");
  const [busy, setBusy] = useState(true);
  const [selecting, setSelecting] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const [libraryResponse, linkResponse] = await Promise.all([fetch("/api/media-library"), fetch("/api/media-library/link")]);
      const library = await libraryResponse.json() as { assets?: Asset[]; error?: string };
      const link = await linkResponse.json() as { linkedApps?: string[]; error?: string };
      if (!libraryResponse.ok) throw new Error(library.error || "Não foi possível abrir a biblioteca.");
      if (!linkResponse.ok) throw new Error(link.error || "Não foi possível verificar a ligação.");
      setAssets(library.assets ?? []);
      setLinkedApps(link.linkedApps ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível abrir a biblioteca.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function link(action: "create" | "claim") {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/media-library/link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, token: claimCode }) });
      const result = await response.json() as { token?: string; linkedApps?: string[]; error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível ligar o workspace.");
      if (action === "create") setGeneratedCode(result.token ?? "");
      else { setClaimCode(""); setLinkedApps(result.linkedApps ?? []); await load(); }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível ligar o workspace.");
    } finally {
      setBusy(false);
    }
  }

  async function selectAsset(asset: Asset) {
    setSelecting(asset.id);
    setError("");
    try {
      const response = await fetch(`/api/media-library/${encodeURIComponent(asset.id)}/playback`);
      const result = await response.json() as { url?: string; error?: string };
      if (!response.ok || !result.url) throw new Error(result.error || "Não foi possível reproduzir este vídeo.");
      onSelect({ id: asset.id, fileName: asset.fileName, durationSeconds: asset.durationSeconds, url: result.url });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível reproduzir este vídeo.");
      setSelecting("");
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Biblioteca cloud">
      <section className="cloud-modal">
        <header><div><span>BIBLIOTECA PARTILHADA</span><h2><Cloud size={19} /> Vídeos do workspace</h2><p>Acesso apenas de leitura. O DrawAnalysis não envia ficheiros para a cloud.</p></div><button onClick={onClose} title="Fechar"><X size={19} /></button></header>
        <div className="cloud-link-panel">
          <div><strong><Link2 size={14} /> Ligar workspace</strong><small>Use o código gerado num dos outros softwares da mesma conta.</small></div>
          <div className="cloud-code-row"><input value={claimCode} onChange={(event) => setClaimCode(event.target.value)} placeholder="Cole aqui o código de ligação" /><button onClick={() => void link("claim")} disabled={busy || !claimCode.trim()}>Ligar</button></div>
          <div className="cloud-link-meta"><span>Apps ligados: {linkedApps.length ? linkedApps.join(", ") : "apenas DrawAnalysis"}</span><button onClick={() => void link("create")} disabled={busy}>Gerar código para outro software</button></div>
          {generatedCode && <div className="generated-code"><code>{generatedCode}</code><button onClick={() => { void navigator.clipboard.writeText(generatedCode); setCopied(true); }} title="Copiar">{copied ? <Check size={15} /> : <Copy size={15} />}</button><small>Válido durante 30 minutos e utilizável uma vez.</small></div>}
        </div>
        {error && <div className="modal-error">{error}</div>}
        <div className="cloud-assets-head"><strong>Vídeos disponíveis</strong><button onClick={() => void load()} disabled={busy}><RefreshCw size={13} /> Atualizar</button></div>
        <div className="cloud-assets">
          {busy && !assets.length ? <div className="modal-empty">A carregar biblioteca…</div> : assets.length ? assets.map((asset) => (
            <button className="cloud-asset" key={asset.id} onClick={() => void selectAsset(asset)} disabled={Boolean(selecting)}>
              <i><Film size={19} /></i><span><strong>{asset.fileName}</strong><small>{formatSize(asset.fileSize)} · {Math.round(asset.durationSeconds)} s</small></span><em>{selecting === asset.id ? "A abrir…" : "Usar vídeo"}</em>
            </button>
          )) : <div className="modal-empty">Ainda não existem vídeos neste workspace. Ligue-o ao workspace que já contém os vídeos.</div>}
        </div>
      </section>
    </div>
  );
}
