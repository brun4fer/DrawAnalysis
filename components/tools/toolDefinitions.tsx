import type { LucideIcon } from "lucide-react";
import {
  MousePointer2, CircleEllipsis, MoveUpRight, Minus, Triangle, Pentagon,
  Square, Type, Pencil,
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
  { id: "ellipse", label: "Marcador", shortcut: "E", icon: CircleEllipsis },
  { id: "arrow", label: "Seta", shortcut: "A", icon: MoveUpRight },
  { id: "line", label: "Linha", shortcut: "L", icon: Minus },
  { id: "triangle", label: "Triângulo", shortcut: "3", icon: Triangle },
  { id: "polygon", label: "Zona tática", shortcut: "P", icon: Pentagon },
  { id: "rectangle", label: "Retângulo", shortcut: "R", icon: Square },
  { id: "text", label: "Texto", shortcut: "T", icon: Type },
  { id: "freeDraw", label: "Desenho livre", shortcut: "D", icon: Pencil },
];
