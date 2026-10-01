"use client";

import { forwardRef } from "react";
import Konva from "konva";
import { Layer, Stage } from "react-konva";
import type { DrawingObject } from "@/types/drawing";
import { getObjectStateAtTime } from "@/utils/temporalRenderer";
import { DrawingShape } from "./DrawingShape";

interface Props {
  drawings: DrawingObject[];
  currentTime: number;
  width: number;
  height: number;
}

export const PlayerLabelOverlay = forwardRef<Konva.Stage, Props>(function PlayerLabelOverlay({ drawings, currentTime, width, height }, ref) {
  const labels = drawings.filter((drawing) => drawing.type === "playerRing" && getObjectStateAtTime(drawing, currentTime).visible);

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
          />
        ))}
      </Layer>
    </Stage>
  );
});
