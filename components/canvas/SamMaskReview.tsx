"use client";

import { useState, useSyncExternalStore } from "react";
import { Check, LoaderCircle, Play, RotateCcw, ScanSearch, Timer, X } from "lucide-react";
import type { PlayerTrackSample, Point } from "@/types/drawing";
import type { SamTrackingPerformanceReport } from "@/types/samTracking";
import { MAX_SAM_TRACKING_SECONDS, MIN_SAM_TRACKING_SECONDS } from "@/lib/samTrackingLimits";

export interface SamTrackingCandidate {
  id: string;
  name: string;
}

interface Props {
  phase: "loading" | "review" | "error" | "confirmed" | "tracking" | "tracked";
  click: Point;
  sample?: PlayerTrackSample;
  message?: string;
  retryable?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onCancelTracking: () => void;
  onRepeat: () => void;
  onTrack: (duration: number) => void;
  onPlay: () => void;
  performance?: SamTrackingPerformanceReport;
  trackingCandidates?: SamTrackingCandidate[];
  selectedTrackingIds?: string[];
  primaryTrackingId?: string;
  onToggleTrackingPlayer?: (trackId: string) => void;
}

function formatDuration(value: number) {
  return value >= 1_000 ? `${(value / 1_000).toFixed(2)} s` : `${Math.round(value)} ms`;
}

const subscribeToDebugMode = () => () => undefined;
const performanceDebugSnapshot = () => new URLSearchParams(window.location.search).has("samTrackingTimings");

export function SamMaskReview({ phase, click, sample, message, retryable, onConfirm, onCancel, onCancelTracking, onRepeat, onTrack, onPlay, performance, trackingCandidates = [], selectedTrackingIds = [], primaryTrackingId, onToggleTrackingPlayer }: Props) {
  const showPerformanceDebug = useSyncExternalStore(subscribeToDebugMode, performanceDebugSnapshot, () => false);
  const [customDuration, setCustomDuration] = useState("4");
  const mask = sample?.mask;
  const performanceRows = performance ? [
    ["Preparação", performance.clipPreparationMs],
    ["Captura + MP4", performance.clipCaptureMs + performance.clipFinalizeMs],
    ["Reposição do vídeo", performance.clipRestoreMs],
    ["Browser → Vercel", performance.browserTransferMs],
    ["Leitura na Vercel", performance.requestParseMs],
    ["Vercel → Meta", performance.metaUploadMs],
    ["Processamento Meta", performance.metaProcessingMs],
    ["Validação das máscaras", performance.maskConversionMs],
    ["Resultado + rede", performance.responseOverheadMs],
    ["Conversão e armazenamento", performance.clientConversionMs],
    ["Preparação da pré-visualização", performance.previewPreparationMs],
  ] as const : [];
  const title = phase === "loading" ? <><LoaderCircle size={14} className="sam-spinner" /> SAM 3.1 A IDENTIFICAR</>
    : phase === "review" ? "CONFIRMAR MÁSCARA SAM 3.1"
      : phase === "confirmed" ? "IDENTIFICAÇÃO GUARDADA · TRACKING OPCIONAL"
        : phase === "tracking" ? <><LoaderCircle size={14} className="sam-spinner" /> SAM 3.1 A ACOMPANHAR JOGADOR</>
          : phase === "tracked" ? "TRACKING SAM 3.1 PRONTO"
            : "IDENTIFICAÇÃO NÃO CONCLUÍDA";
  return (
    <div className={`sam-mask-review phase-${phase}`} aria-live="polite">
      {mask && phase !== "tracking" && phase !== "tracked" && (
        <div
          className="sam-mask-preview"
          aria-hidden="true"
          style={{
            left: `${mask.bounds.x * 100}%`,
            top: `${mask.bounds.y * 100}%`,
            width: `${mask.bounds.width * 100}%`,
            height: `${mask.bounds.height * 100}%`,
            WebkitMaskImage: `url(${mask.maskDataUrl})`,
            maskImage: `url(${mask.maskDataUrl})`,
          }}
        />
      )}
      {phase === "loading" && (
        <div className="sam-loading-target" style={{ left: `${click.x * 100}%`, top: `${click.y * 100}%` }} aria-hidden="true">
          <ScanSearch size={28} />
        </div>
      )}
      <div className="sam-review-toolbar" onPointerDown={(event) => event.stopPropagation()}>
        <div className="sam-review-copy">
          <strong>{title}</strong>
          <small>{message || (phase === "loading" ? "Fotograma original enviado em segurança para a Meta…" : `Máscara alinhada · confiança ${Math.round((sample?.confidence ?? 0) * 100)}%`)}</small>
        </div>
        <div className="sam-review-actions">
          {phase === "review" && <button type="button" className="primary" onClick={onConfirm}><Check size={14} /> Confirmar</button>}
          {(phase === "confirmed" || phase === "tracked") && <div className="sam-tracking-options">
            <button type="button" onClick={() => onTrack(2)}><Timer size={14} /> 2 s</button>
            <button type="button" onClick={() => onTrack(3)}><Timer size={14} /> 3 s</button>
            <label className="sam-custom-duration" title={`Entre ${MIN_SAM_TRACKING_SECONDS} e ${MAX_SAM_TRACKING_SECONDS} segundos`}>
              <input
                aria-label="Duração personalizada do tracking"
                type="number"
                min={MIN_SAM_TRACKING_SECONDS}
                max={MAX_SAM_TRACKING_SECONDS}
                step="1"
                value={customDuration}
                onChange={(event) => setCustomDuration(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  const seconds = Number(customDuration);
                  if (Number.isInteger(seconds) && seconds >= MIN_SAM_TRACKING_SECONDS && seconds <= MAX_SAM_TRACKING_SECONDS) onTrack(seconds);
                }}
              />
              <button
                type="button"
                disabled={!Number.isInteger(Number(customDuration)) || Number(customDuration) < MIN_SAM_TRACKING_SECONDS || Number(customDuration) > MAX_SAM_TRACKING_SECONDS}
                onClick={() => onTrack(Number(customDuration))}
              >s</button>
            </label>
          </div>}
          {phase === "tracked" && <button type="button" className="primary" onClick={onPlay}><Play size={14} /> Reproduzir</button>}
          {(phase === "review" || phase === "error") && <button type="button" onClick={onRepeat} title={retryable ? "Tentar novamente" : "Escolher outro ponto"}><RotateCcw size={14} /> Repetir</button>}
          {phase === "tracking"
            ? <button type="button" onClick={onCancelTracking}><X size={14} /> Cancelar tracking</button>
            : <button type="button" onClick={onCancel}><X size={14} /> Fechar</button>}
        </div>
      </div>
      {(phase === "confirmed" || phase === "tracked") && trackingCandidates.length > 1 && (
        <div className="sam-tracking-player-picker" onPointerDown={(event) => event.stopPropagation()}>
          <span>Jogadores para tracking ({selectedTrackingIds.length})</span>
          <div>
            {trackingCandidates.map((candidate) => (
              <label key={candidate.id}>
                <input
                  type="checkbox"
                  checked={selectedTrackingIds.includes(candidate.id)}
                  disabled={candidate.id === primaryTrackingId}
                  onChange={() => onToggleTrackingPlayer?.(candidate.id)}
                />
                {candidate.name}{candidate.id === primaryTrackingId ? " (principal)" : ""}
              </label>
            ))}
          </div>
          <small>Processados por ordem, com o mesmo intervalo e fotograma inicial.</small>
        </div>
      )}
      {phase === "tracked" && performance && showPerformanceDebug && (
        <div className="sam-tracking-performance" onPointerDown={(event) => event.stopPropagation()}>
          <div><strong>Tempo real por etapa</strong><span>Total {formatDuration(performance.totalMs)}</span></div>
          {performanceRows.filter(([, milliseconds]) => milliseconds > 0).map(([label, milliseconds]) => (
            <p key={label}>
              <span>{label}</span>
              <b>{formatDuration(milliseconds)}</b>
              <em>{performance.totalMs > 0 ? `${Math.min(100, milliseconds / performance.totalMs * 100).toFixed(1)}%` : "0%"}</em>
            </p>
          ))}
          {(performance.reusedTracking || performance.reusedClip) && <small>{performance.reusedTracking ? "Tracking reutilizado sem novo pedido à Meta." : "Excerto MP4 reutilizado; manteve resolução e fotogramas."}</small>}
        </div>
      )}
    </div>
  );
}
