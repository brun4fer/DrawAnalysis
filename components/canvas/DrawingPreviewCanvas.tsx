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

export function DrawingPreviewCanvas({ drawings, currentTime, width, height }: Props) {
  const visible = drawings.filter((drawing) => getObjectStateAtTime(drawing, currentTime).visible);
  return (
    <Stage width={width} height={height} listening={false}>
      <Layer listening={false}>
        {visible.map((object) => (
          <DrawingShape
            key={object.id}
            object={object}
            width={width}
            height={height}
            currentTime={currentTime}
            selected={false}
            canEdit={false}
            onSelect={() => undefined}
            onChange={() => undefined}
          />
        ))}
      </Layer>
    </Stage>
  );
}
