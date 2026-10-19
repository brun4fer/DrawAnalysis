"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Palette, Pipette, X } from "lucide-react";

const PENCIL_COLORS = [
  ["#ffffff", "#e5e7eb", "#cbd5e1", "#94a3b8", "#64748b", "#475569", "#334155", "#1e293b", "#0f172a", "#111111"],
  ["#fee2e2", "#fed7aa", "#fef3c7", "#ecfccb", "#d1fae5", "#cffafe", "#dbeafe", "#ede9fe", "#fae8ff", "#fce7f3"],
  ["#ef4444", "#f97316", "#facc15", "#a3e635", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#d946ef", "#ec4899"],
  ["#991b1b", "#9a3412", "#854d0e", "#3f6212", "#166534", "#155e75", "#1e40af", "#5b21b6", "#86198f", "#9d174d"],
];

type EyeDropperConstructor = new () => { open: () => Promise<{ sRGBHex: string }> };

interface Props {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  opacity?: number;
  onOpacityChange?: (value: number) => void;
  className?: string;
}

function normalizedHex(value: string, fallback = "#ffffff") {
  const next = value.trim();
  if (/^#[\da-f]{6}$/i.test(next)) return next.toLowerCase();
  if (/^#[\da-f]{3}$/i.test(next)) return `#${next.slice(1).split("").map((letter) => `${letter}${letter}`).join("")}`.toLowerCase();
  return fallback;
}

export function ColorPalettePicker({ value, onChange, label = "Escolher cor", opacity, onOpacityChange, className = "" }: Props) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(normalizedHex(value));
  const [position, setPosition] = useState({ left: 8, top: 8 });
  const [recent, setRecent] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = JSON.parse(window.localStorage.getItem("tactidraw-recent-colors") ?? "[]") as unknown;
      return Array.isArray(saved) ? saved.filter((item): item is string => typeof item === "string").slice(0, 10) : [];
    } catch { return []; }
  });
  const color = normalizedHex(value, draft);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".color-palette-popover") || buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", escape);
    };
  }, [open]);

  const selectColor = (nextValue: string) => {
    const next = normalizedHex(nextValue, color);
    setDraft(next);
    onChange(next);
    const nextRecent = [next, ...recent.filter((item) => item !== next)].slice(0, 10);
    setRecent(nextRecent);
    try { window.localStorage.setItem("tactidraw-recent-colors", JSON.stringify(nextRecent)); } catch { /* Optional convenience only. */ }
  };

  const toggle = () => {
    const bounds = buttonRef.current?.getBoundingClientRect();
    if (bounds) {
      const width = 292;
      const height = onOpacityChange ? 330 : 286;
      setPosition({
        left: Math.max(8, Math.min(window.innerWidth - width - 8, bounds.right - width)),
        top: Math.max(8, Math.min(window.innerHeight - height - 8, bounds.bottom + 6)),
      });
    }
    if (!open) setDraft(color);
    setOpen((current) => !current);
  };

  const pickFromScreen = async () => {
    const EyeDropper = (window as unknown as { EyeDropper?: EyeDropperConstructor }).EyeDropper;
    if (!EyeDropper) return;
    try {
      const result = await new EyeDropper().open();
      selectColor(result.sRGBHex);
    } catch { /* The user cancelled the picker. */ }
  };

  return (
    <>
      <button ref={buttonRef} type="button" className={`color-palette-trigger ${className}`} onClick={toggle} title={label} aria-label={`${label}: ${color}`} aria-expanded={open}>
        <i style={{ backgroundColor: color }} />
        <code>{color}</code>
        <Palette size={13} />
      </button>
      {open && createPortal(
        <section className="color-palette-popover" style={position} role="dialog" aria-label={label}>
          <header><span><Palette size={14} /> CORES</span><button type="button" onClick={() => setOpen(false)} title="Fechar"><X size={14} /></button></header>
          <div className="color-pencil-grid">
            {PENCIL_COLORS.flat().map((pencil) => (
              <button key={pencil} type="button" className={color === pencil ? "active" : ""} onClick={() => selectColor(pencil)} title={pencil}>
                <i style={{ backgroundColor: pencil }} /><b style={{ borderTopColor: pencil }} />
              </button>
            ))}
          </div>
          {recent.length > 0 && <div className="color-recent-row"><span>Recentes</span><div>{recent.map((item) => <button key={item} type="button" className={color === item ? "active" : ""} style={{ backgroundColor: item }} onClick={() => selectColor(item)} title={item} />)}</div></div>}
          {onOpacityChange && <label className="color-opacity-row"><span>Opacidade</span><input type="range" min={0} max={1} step={.01} value={opacity ?? 1} onChange={(event) => onOpacityChange(Number(event.target.value))} /><b>{Math.round((opacity ?? 1) * 100)}%</b></label>}
          <footer>
            <span className="color-preview" style={{ backgroundColor: color }} />
            <input value={draft} aria-label="Código hexadecimal" onChange={(event) => setDraft(event.target.value)} onBlur={() => selectColor(draft)} onKeyDown={(event) => { if (event.key === "Enter") selectColor(draft); }} />
            <button type="button" className="eyedropper" onClick={() => void pickFromScreen()} title="Conta-gotas"><Pipette size={14} /></button>
            <label className="native-color" title="Seletor de cor do sistema"><input type="color" value={color} onChange={(event) => selectColor(event.target.value)} /><Palette size={14} /></label>
          </footer>
        </section>,
        document.body,
      )}
    </>
  );
}
