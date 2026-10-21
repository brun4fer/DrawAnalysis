"use client";

import { forwardRef } from "react";
import Konva from "konva";
import { Layer, Stage } from "react-konva";
import type { DrawingObject, PlayerTrack } from "@/types/drawing";
import { getObjectStateAtTime } from "@/utils/temporalRenderer";
import { targetOffsetAtTime } from "@/utils/playerTracking";
import { DrawingShape } from "./DrawingShape";

interface Props {
  drawings: DrawingObject[];
  playerTracks?: PlayerTrack[];
  currentTime: number;
  width: number;
  height: number;
  editingPreview?: boolean;
}

export const PlayerLabelOverlay = forwardRef<Konva.Stage, Props>(function PlayerLabelOverlay({ drawings, playerTracks, currentTime, width, height, editingPreview = false }, ref) {
  const labels = drawings.filter((drawing) => (drawing.type === "playerRing" || drawing.type === "playerLabel") && getObjectStateAtTime(drawing, currentTime).visible);

  return (
    <Stage ref={ref} width={width} height={height} listening={false} className="drawing-stage player-label-stage">
      <Layer listening={false}>
        {labels.map((drawing) => (
          <DrawingShape
            key={`player-label-${drawing.id}`}
            object={drawing}
            width={width}
            height={height}
            currentTime={currentTime}
            selected={false}
            canEdit={false}
            onSelect={() => undefined}
            onChange={() => undefined}
            renderMode="playerLabel"
            editingPreview={editingPreview}
            targetOffset={targetOffsetAtTime(drawing, playerTracks, currentTime)}
            allDrawings={drawings}
          />
        ))}
      </Layer>
    </Stage>
  );
});
