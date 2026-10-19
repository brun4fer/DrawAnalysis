export function normalizeHexColor(value: string | undefined, fallback = "#ffffff") {
  const source = value?.trim() ?? "";
  if (/^#[\da-f]{6}$/i.test(source)) return source.toLowerCase();
  if (/^#[\da-f]{3}$/i.test(source)) return `#${source.slice(1).split("").map((letter) => `${letter}${letter}`).join("")}`.toLowerCase();
  return fallback;
}

export function hexToRgba(value: string | undefined, opacity: number, fallback = "#ffffff") {
  const hex = normalizeHexColor(value, fallback).slice(1);
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  return `rgba(${red},${green},${blue},${Math.max(0, Math.min(1, opacity))})`;
}

export function hexWithoutHash(value: string | undefined, fallback = "#ffffff") {
  return normalizeHexColor(value, fallback).slice(1).toUpperCase();
}
