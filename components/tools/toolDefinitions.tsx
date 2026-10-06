import type { LucideIcon } from "lucide-react";
import {
  MousePointer2, CircleDot, Flashlight, Search, CircleEllipsis, MoveUpRight, Spline, Minus, Eye, Triangle, Pentagon,
  Square, Type, Pencil, UserRoundSearch, Ghost,
} from "lucide-react";
import type { Tool } from "@/types/drawing";

export interface ToolDefinition {
  id: Tool;
  label: string;
  shortcut: string;
  icon: LucideIcon;
}

export const TOOLS: ToolDefinition[] = [
  { id: "select", label: "Selecionar", shortcut: "V", icon: MousePointer2 },
  { id: "identifyPlayer", label: "Identificar jogador", shortcut: "I", icon: UserRoundSearch },
  { id: "playerRing", label: "Ring de jogador", shortcut: "Q", icon: CircleDot },
  { id: "ghost", label: "Mover jogador (Ghost)", shortcut: "H", icon: Ghost },
  { id: "spotlight", label: "Spotlight", shortcut: "S", icon: Flashlight },
  { id: "zoom", label: "Lupa / Zoom", shortcut: "Z", icon: Search },
  { id: "ellipse", label: "Marcador", shortcut: "E", icon: CircleEllipsis },
  { id: "arrow", label: "Seta", shortcut: "A", icon: MoveUpRight },
  { id: "longBallArrow", label: "Bola longa", shortcut: "B", icon: Spline },
  { id: "line", label: "Linha", shortcut: "L", icon: Minus },
  { id: "glimpse", label: "Visão do jogador", shortcut: "G", icon: Eye },
  { id: "triangle", label: "Triângulo", shortcut: "3", icon: Triangle },
  { id: "polygon", label: "Zona tática", shortcut: "P", icon: Pentagon },
  { id: "rectangle", label: "Retângulo", shortcut: "R", icon: Square },
  { id: "text", label: "Texto", shortcut: "T", icon: Type },
  { id: "freeDraw", label: "Desenho livre", shortcut: "D", icon: Pencil },
];
