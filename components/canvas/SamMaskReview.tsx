"use client";

import { Check, LoaderCircle, RotateCcw, ScanSearch, X } from "lucide-react";
import type { PlayerTrackSample, Point } from "@/types/drawing";

interface Props {
  phase: "loading" | "review" | "error";
  click: Point;
  sample?: PlayerTrackSample;
  message?: string;
  retryable?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onRepeat: () => void;
}

export function SamMaskReview({ phase, click, sample, message, retryable, onConfirm, onCancel, onRepeat }: Props) {
  const mask = sample?.mask;
  return (
    <div className={`sam-mask-review phase-${phase}`} aria-live="polite">
      {mask && (
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
          <strong>{phase === "loading" ? <><LoaderCircle size={14} className="sam-spinner" /> SAM 3.1 A IDENTIFICAR</> : phase === "review" ? "CONFIRMAR MÁSCARA SAM 3.1" : "IDENTIFICAÇÃO NÃO CONCLUÍDA"}</strong>
          <small>{message || (phase === "loading" ? "Fotograma original enviado em segurança para a Meta…" : `Máscara alinhada · confiança ${Math.round((sample?.confidence ?? 0) * 100)}%`)}</small>
        </div>
        <div className="sam-review-actions">
          {phase === "review" && <button type="button" className="primary" onClick={onConfirm}><Check size={14} /> Confirmar</button>}
          {phase !== "loading" && <button type="button" onClick={onRepeat} title={retryable ? "Tentar novamente" : "Escolher outro ponto"}><RotateCcw size={14} /> Repetir</button>}
          <button type="button" onClick={onCancel}><X size={14} /> Cancelar</button>
        </div>
      </div>
    </div>
  );
}
