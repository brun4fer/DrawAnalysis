import type { Point } from "@/types/drawing";
import type { TacticalBoardMark } from "@/types/slide";

export interface TacticalMarkTransition {
  marks: TacticalBoardMark[];
  opacities: Record<string, number>;
  reveals: Record<string, number>;
}

export function isPlayerLinkedMark(mark: TacticalBoardMark) {
  return mark.type === "player-link" || mark.type === "player-polygon";
}

/**
 * Resolves positions (and, when supplied, token colours) for a mark attached
 * to players. This also makes older links and polygons use the players'
 * current team colour instead of their formerly fixed white/blue colour.
 */
export function resolvedTacticalMark(
  mark: TacticalBoardMark,
  positions: Record<string, Point>,
  playerColors?: Record<string, string>,
): TacticalBoardMark {
  if (!isPlayerLinkedMark(mark) || !mark.playerIds?.length) return mark;
  const linkedPoints = mark.playerIds.map((playerId) => positions[playerId]).filter((point): point is Point => Boolean(point));
  if (linkedPoints.length < (mark.type === "player-polygon" ? 3 : 2)) return mark;

  const color = playerColors?.[mark.playerIds[0]];
  return { ...mark, points: linkedPoints, ...(color ? { color, fillColor: color } : {}) };
}

/**
 * Produces the visual layer for a transition without changing persisted data.
 * `drawAfterMovement` is opt-in so legacy saved movements preserve their
 * original reveal timing.
 */
export function resolveTacticalMarkTransition(
  previous: TacticalBoardMark[],
  target: TacticalBoardMark[],
  progress: number,
  drawAfterMovement: boolean,
  removalProgress = progress,
): TacticalMarkTransition {
  const bounded = Math.max(0, Math.min(1, progress));
  const boundedRemoval = Math.max(0, Math.min(1, removalProgress));
  const targetById = new Map(target.map((mark) => [mark.id, mark]));
  const previousIds = new Set(previous.map((mark) => mark.id));
  const marks: TacticalBoardMark[] = [];
  const opacities: Record<string, number> = {};
  const reveals: Record<string, number> = {};

  previous.forEach((mark) => {
    const replacement = targetById.get(mark.id);
    if (replacement) {
      marks.push(drawAfterMovement && bounded < 1 ? mark : replacement);
      opacities[mark.id] = 1;
      reveals[mark.id] = 1;
      return;
    }
    marks.push(mark);
    // Outgoing drawings fade with the player movement. New drawings can still
    // wait for the post-movement drawing phase without leaving old marks on
    // screen when the next stage starts without them.
    opacities[mark.id] = 1 - boundedRemoval;
    reveals[mark.id] = 1;
  });

  target.forEach((mark) => {
    if (previousIds.has(mark.id)) return;
    marks.push(mark);
    opacities[mark.id] = bounded;
    reveals[mark.id] = mark.type === "arrow" ? bounded : 1;
  });

  return { marks, opacities, reveals };
}
