export interface CloudDiagnosticResult {
  diagnosticId: string;
  checkedAt: string;
  environment: { node: string; vercel: string | null; commit: string | null; region: string | null; appOrigin: string };
  configuration: Record<string, boolean | string | null>;
  asset: { available: boolean; mimeType?: string; fileSize?: string; uploadedAt?: string | null };
  cors: null | {
    origin: string;
    playback: { status: number; allowOrigin: string | null; contentType: string | null; contentRange: string | null; acceptRanges: string | null; ok: boolean };
    upload: { status: number; allowOrigin: string | null; allowMethods: string | null; allowHeaders: string | null; ok: boolean };
  };
}

export async function loadCloudDiagnostics() {
  const response = await fetch("/api/media-library/diagnostics", { cache: "no-store" });
  const result = await response.json().catch(() => ({})) as CloudDiagnosticResult & { error?: string };
  if (!response.ok) throw new Error(result.error || `Diagnóstico cloud falhou (HTTP ${response.status}).`);
  return result;
}

export function formatCloudDiagnostics(result: CloudDiagnosticResult) {
  const environment = result.environment.vercel || result.environment.node;
  const playback = result.cors ? `GET ${result.cors.playback.status} · CORS ${result.cors.playback.ok ? "OK" : "FALHOU"}` : "sem vídeo para testar";
  const upload = result.cors ? `OPTIONS ${result.cors.upload.status} · CORS ${result.cors.upload.ok ? "OK" : "FALHOU"}` : "sem vídeo para testar";
  return `ID ${result.diagnosticId.slice(0, 8)} · ${environment} · origem ${result.environment.appOrigin} · reprodução ${playback} · upload ${upload}`;
}
