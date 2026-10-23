"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Cloud, Copy, Film, Link2, RefreshCw, Upload, X } from "lucide-react";
import { APP_PRODUCT } from "@/lib/product";
import { type CloudUploadStatus, type CloudVideoAsset, uploadCloudVideo } from "@/utils/cloudVideoUpload";

export interface CloudAssetSelection {
  id: string;
  fileName: string;
  durationSeconds: number;
  url: string;
}

interface Props {
  onClose: () => void;
  onSelect: (asset: CloudAssetSelection) => void;
  localFile?: File | null;
  backgroundUpload?: { fileName: string; status: CloudUploadStatus };
}

const formatSize = (raw: string | number) => {
  const bytes = Number(raw);
  if (!Number.isFinite(bytes)) return "";
  return bytes >= 1_000_000_000 ? `${(bytes / 1_000_000_000).toFixed(1)} GB` : `${(bytes / 1_000_000).toFixed(1)} MB`;
};

export function CloudLibraryModal({ onClose, onSelect, localFile, backgroundUpload }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadControllerRef = useRef<AbortController | null>(null);
  const [assets, setAssets] = useState<CloudVideoAsset[]>([]);
  const [linkedApps, setLinkedApps] = useState<string[]>([]);
  const [claimCode, setClaimCode] = useState("");
  const [generatedCode, setGeneratedCode] = useState("");
  const [busy, setBusy] = useState(true);
  const [selecting, setSelecting] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<CloudUploadStatus | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const activeUploadStatus = uploadStatus ?? backgroundUpload?.status;

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const [libraryResponse, linkResponse] = await Promise.all([fetch("/api/media-library"), fetch("/api/media-library/link")]);
      const library = await libraryResponse.json() as { assets?: CloudVideoAsset[]; error?: string };
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
      const response = await fetch("/api/media-library/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, token: claimCode }),
      });
      const result = await response.json() as { token?: string; linkedApps?: string[]; error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível ligar o workspace.");
      if (action === "create") setGeneratedCode(result.token ?? "");
      else {
        setClaimCode("");
        setLinkedApps(result.linkedApps ?? []);
        await load();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível ligar o workspace.");
    } finally {
      setBusy(false);
    }
  }

  async function selectAsset(asset: CloudVideoAsset) {
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

  async function upload(file?: File | null) {
    if (!file || uploading || backgroundUpload) return;
    const controller = new AbortController();
    uploadControllerRef.current = controller;
    setUploading(true);
    setUploadStatus({ phase: "preparing", progress: 0, detail: "A preparar o vídeo…" });
    setError("");
    try {
      const asset = await uploadCloudVideo(file, setUploadStatus, controller.signal);
      setAssets((current) => [asset, ...current.filter((item) => item.id !== asset.id)]);
      await selectAsset(asset);
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === "AbortError")) {
        setError(caught instanceof Error ? caught.message : "Não foi possível guardar o vídeo na cloud.");
      }
    } finally {
      uploadControllerRef.current = null;
      setUploading(false);
      setUploadStatus(null);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Biblioteca cloud">
      <section className="cloud-modal">
        <header>
          <div><span>BIBLIOTECA PARTILHADA</span><h2><Cloud size={19} /> Vídeos do workspace</h2><p>Carregue um vídeo uma vez e reutilize-o em qualquer apresentação desta conta.</p></div>
          <button onClick={onClose} title={uploading ? "Cancele o envio antes de fechar" : "Fechar"} disabled={uploading}><X size={19} /></button>
        </header>
        <input ref={inputRef} className="sr-only" type="file" accept="video/*" onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = ""; }} />
        <div className="cloud-upload-panel">
          <div className="cloud-upload-copy">
            <strong><Upload size={15} /> Guardar vídeo na cloud</strong>
            <small>{localFile ? `${localFile.name} · ${formatSize(localFile.size)}` : "O vídeo ficará disponível em todo o workspace."}</small>
          </div>
          {!uploading && !backgroundUpload ? (
            <div className="cloud-upload-actions">
              {localFile && <button className="primary" onClick={() => void upload(localFile)}>Guardar vídeo atual</button>}
              <button onClick={() => inputRef.current?.click()}>{localFile ? "Escolher outro" : "Escolher vídeo"}</button>
            </div>
          ) : uploading ? (
            <button className="cloud-upload-cancel" onClick={() => uploadControllerRef.current?.abort()}>Cancelar</button>
          ) : (
            <button className="cloud-upload-cancel" disabled>A guardar automaticamente</button>
          )}
          {activeUploadStatus && (
            <div className="cloud-upload-progress">
              <div><i style={{ width: `${Math.round(activeUploadStatus.progress * 100)}%` }} /></div>
              <span>{Math.round(activeUploadStatus.progress * 100)}%</span>
              <small>{activeUploadStatus.detail}</small>
            </div>
          )}
        </div>
        <div className="cloud-link-panel">
          <div><strong><Link2 size={14} /> Ligar workspace</strong><small>Use o código gerado num dos outros softwares da mesma conta.</small></div>
          <div className="cloud-code-row"><input value={claimCode} onChange={(event) => setClaimCode(event.target.value)} placeholder="Cole aqui o código de ligação" /><button onClick={() => void link("claim")} disabled={busy || uploading || !claimCode.trim()}>Ligar</button></div>
          <div className="cloud-link-meta"><span>Apps ligados: {linkedApps.length ? linkedApps.join(", ") : `apenas ${APP_PRODUCT.name}`}</span><button onClick={() => void link("create")} disabled={busy || uploading}>Gerar código para outro software</button></div>
          {generatedCode && <div className="generated-code"><code>{generatedCode}</code><button onClick={() => { void navigator.clipboard.writeText(generatedCode); setCopied(true); }} title="Copiar">{copied ? <Check size={15} /> : <Copy size={15} />}</button><small>Válido durante 30 minutos e utilizável uma vez.</small></div>}
        </div>
        {error && <div className="modal-error">{error}</div>}
        <div className="cloud-assets-head"><strong>Vídeos disponíveis</strong><button onClick={() => void load()} disabled={busy || uploading}><RefreshCw size={13} /> Atualizar</button></div>
        <div className="cloud-assets">
          {busy && !assets.length ? <div className="modal-empty">A carregar biblioteca…</div> : assets.length ? assets.map((asset) => (
            <button className="cloud-asset" key={asset.id} onClick={() => void selectAsset(asset)} disabled={uploading || Boolean(backgroundUpload) || Boolean(selecting)}>
              <i><Film size={19} /></i><span><strong>{asset.fileName}</strong><small>{formatSize(asset.fileSize)} · {Math.round(asset.durationSeconds)} s</small></span><em>{selecting === asset.id ? "A abrir…" : "Usar vídeo"}</em>
            </button>
          )) : <div className="modal-empty">Ainda não existem vídeos neste workspace. Carregue o primeiro vídeo acima ou ligue outro software da mesma conta.</div>}
        </div>
      </section>
    </div>
  );
}
