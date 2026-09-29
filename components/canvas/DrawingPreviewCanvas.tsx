"use client";

import { useRef } from "react";
import { Layer, Stage } from "react-konva";
import type { DrawingObject, PlayerTrack } from "@/types/drawing";
import { getObjectStateAtTime } from "@/utils/temporalRenderer";
import { DrawingShape } from "./DrawingShape";
import { PlayerOcclusionCanvas } from "./PlayerOcclusionCanvas";

interface Props {
  drawings: DrawingObject[];
  playerTracks?: PlayerTrack[];
  currentTime: number;
  width: number;
  height: number;
  getVideoElement?: () => HTMLVideoElement | null;
}

export function DrawingPreviewCanvas({ drawings, playerTracks, currentTime, width, height, getVideoElement }: Props) {
  const occlusionCanvasRef = useRef<HTMLCanvasElement>(null);
  const visible = drawings.filter((drawing) => getObjectStateAtTime(drawing, currentTime).visible);
  return (
    <>
    <Stage width={width} height={height} listening={false} className="drawing-stage preview-stage">
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
    <PlayerOcclusionCanvas ref={occlusionCanvasRef} drawings={drawings} playerTracks={playerTracks} currentTime={currentTime} width={width} height={height} getVideoElement={getVideoElement} />
    </>
  );
}
