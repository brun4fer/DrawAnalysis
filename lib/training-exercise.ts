import type { TrainingExerciseObject, TrainingExerciseObjectType } from "@/types/slide";
import { createId } from "@/utils/id";

export const TRAINING_OBJECT_LABELS: Record<TrainingExerciseObjectType, string> = {
  player: "Player",
  arrow: "Arrow",
  "zigzag-arrow": "Zig-zag arrow",
  line: "Line",
  pole: "Training pole",
  cone: "Disc cone",
  goal: "Goal",
  ball: "Ball",
  text: "Text",
};

const DEFAULTS: Record<TrainingExerciseObjectType, Omit<TrainingExerciseObject, "id" | "type">> = {
  player: { x: 50, y: 50, width: 4.5, height: 4.5, color: "#f7ed2f", label: "PLAYER", opacity: 1 },
  arrow: { x: 50, y: 50, width: 18, height: 8, color: "#ffe32a", strokeWidth: 1.6, opacity: 1 },
  "zigzag-arrow": { x: 50, y: 50, width: 18, height: 8, color: "#111111", strokeWidth: 1.4, opacity: 1, dashed: true },
  line: { x: 50, y: 50, width: 18, height: 0, color: "#ffffff", strokeWidth: 1.2, opacity: 1, dashed: true },
  pole: { x: 50, y: 50, width: 2.8, height: 9, color: "#e93325", opacity: 1 },
  cone: { x: 50, y: 50, width: 4.4, height: 2.5, color: "#df241e", opacity: 1 },
  goal: { x: 50, y: 50, width: 4, height: 12, color: "#f6f7ef", opacity: 1 },
  ball: { x: 50, y: 50, width: 2.8, height: 2.8, color: "#ffffff", opacity: 1 },
  text: { x: 50, y: 50, width: 0, height: 0, color: "#ffffff", label: "TEXT", fontSize: 3, fontFamily: "heavy", shadow: true, opacity: 1 },
};

export function createTrainingExerciseObject(type: TrainingExerciseObjectType, offset = 0): TrainingExerciseObject {
  const base = DEFAULTS[type];
  const nudged = offset % 6;
  return {
    id: createId(),
    type,
    ...base,
    x: Math.min(88, base.x + nudged * 4),
    y: Math.min(86, base.y + nudged * 3),
    label: type === "text" ? `TEXT ${offset + 1}` : base.label,
  };
}

export function clampPitchPosition(value: number) {
  return Math.max(2, Math.min(98, value));
}
