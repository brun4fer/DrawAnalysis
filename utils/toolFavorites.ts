import type { DrawingData, DrawingObject, ToolFavorite } from "@/types/drawing";

export function favoriteFromDrawing(drawing: DrawingObject, id: string): ToolFavorite {
  return {
    id,
    name: drawing.name,
    type: drawing.type,
    style: structuredClone(drawing.style),
    animation: drawing.animation ? structuredClone(drawing.animation) : undefined,
    actionLabel: drawing.actionLabel ? structuredClone(drawing.actionLabel) : undefined,
    data: structuredClone(drawing.data),
    createdAt: Date.now(),
  };
}

export function applyFavoriteData(base: DrawingData, favorite: ToolFavorite): DrawingData {
  const saved = favorite.data;
  switch (saved.kind) {
    case "identifyPlayer":
      return base.kind === "identifyPlayer" ? { ...base, radiusX: saved.radiusX, radiusY: saved.radiusY } : base;
    case "playerRing":
      return base.kind === "playerRing" ? { ...base, radiusX: saved.radiusX, radiusY: saved.radiusY, occlusionWidth: saved.occlusionWidth, labelOffsetY: saved.labelOffsetY, label: saved.label ? structuredClone(saved.label) : undefined, ringDesign: saved.ringDesign, spinEnabled: saved.spinEnabled, spinSpeed: saved.spinSpeed, showRing: saved.showRing, splashEnabled: saved.splashEnabled, splashSpeed: saved.splashSpeed } : base;
    case "ghost":
      return base.kind === "ghost" ? { ...base, radiusX: saved.radiusX, radiusY: saved.radiusY, hideOriginal: saved.hideOriginal, playerOpacity: saved.playerOpacity, showArrow: saved.showArrow, showOrigin: saved.showOrigin } : base;
    case "spotlight":
      return base.kind === "spotlight" ? { ...base, radiusX: saved.radiusX, radiusY: saved.radiusY, beamHeight: saved.beamHeight, design: saved.design, darkness: saved.darkness, feather: saved.feather } : base;
    case "zoom":
      return base.kind === "zoom" ? { ...base, radius: saved.radius, zoom: saved.zoom } : base;
    case "rectangle":
      return base.kind === "rectangle" ? { ...base, fillDesign: saved.fillDesign, stripeColor: saved.stripeColor, stripeSpacing: saved.stripeSpacing, stripeAngle: saved.stripeAngle } : base;
    case "line":
      return base.kind === "line" ? { ...base, lineDesign: saved.lineDesign, secondaryColor: saved.secondaryColor } : base;
    case "glimpse":
      return base.kind === "glimpse" ? { ...base, spread: saved.spread } : base;
    case "polygon":
      return base.kind === "polygon" ? { ...base, zoneDesign: saved.zoneDesign, stripeColor: saved.stripeColor, stripeSpacing: saved.stripeSpacing, stripeAngle: saved.stripeAngle } : base;
    case "triangle":
      return base.kind === "triangle" ? { ...base, fillDesign: saved.fillDesign, stripeColor: saved.stripeColor, stripeSpacing: saved.stripeSpacing, stripeAngle: saved.stripeAngle } : base;
    case "text":
      return base.kind === "text" ? { ...base, fontSize: saved.fontSize, textDesign: saved.textDesign, groundTilt: saved.groundTilt, groundDepth: saved.groundDepth } : base;
    case "ellipse":
    case "longBallArrow":
    case "arrow":
    case "freeDraw":
      return base;
  }
}

export function isToolFavorite(value: unknown): value is ToolFavorite {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ToolFavorite>;
  return typeof item.id === "string" && typeof item.name === "string" && typeof item.type === "string" && Boolean(item.style) && Boolean(item.data);
}
