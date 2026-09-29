"use client";

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

export function PlayerLabelOverlay({ drawings, currentTime, width, height }: Props) {
  const labels = drawings.filter((drawing) => drawing.type === "playerRing" && getObjectStateAtTime(drawing, currentTime).visible);

  return (
    <Stage width={width} height={height} listening={false} className="drawing-stage player-label-stage">
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
}
