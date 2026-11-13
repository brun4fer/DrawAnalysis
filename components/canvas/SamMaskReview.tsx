"use client";

import { Check, LoaderCircle, Play, RotateCcw, ScanSearch, Timer, X } from "lucide-react";
import type { PlayerTrackSample, Point } from "@/types/drawing";

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
  onTrack: (duration: 2 | 3) => void;
  onPlay: () => void;
}

export function SamMaskReview({ phase, click, sample, message, retryable, onConfirm, onCancel, onCancelTracking, onRepeat, onTrack, onPlay }: Props) {
  const mask = sample?.mask;
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
          </div>}
          {phase === "tracked" && <button type="button" className="primary" onClick={onPlay}><Play size={14} /> Reproduzir</button>}
          {(phase === "review" || phase === "error") && <button type="button" onClick={onRepeat} title={retryable ? "Tentar novamente" : "Escolher outro ponto"}><RotateCcw size={14} /> Repetir</button>}
          {phase === "tracking"
            ? <button type="button" onClick={onCancelTracking}><X size={14} /> Cancelar tracking</button>
            : <button type="button" onClick={onCancel}><X size={14} /> Fechar</button>}
        </div>
      </div>
    </div>
  );
}
