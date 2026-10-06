"use client";

import { useEffect, useRef } from "react";
import Konva from "konva";
import { Layer, Stage } from "react-konva";
import type { DrawingObject, PlayerTrack } from "@/types/drawing";
import { getObjectStateAtTime } from "@/utils/temporalRenderer";
import { DrawingShape } from "./DrawingShape";
import { PlayerOcclusionCanvas } from "./PlayerOcclusionCanvas";
import { PlayerLabelOverlay } from "./PlayerLabelOverlay";
import { ZoomLensCanvas } from "./ZoomLensCanvas";
import { targetOffsetAtTime } from "@/utils/playerTracking";

interface Props {
  drawings: DrawingObject[];
  playerTracks?: PlayerTrack[];
  currentTime: number;
  width: number;
  height: number;
  getVideoElement?: () => HTMLVideoElement | null;
  registerCapture?: (capture: (() => HTMLCanvasElement | null) | null) => void;
}

export function DrawingPreviewCanvas({ drawings, playerTracks, currentTime, width, height, getVideoElement, registerCapture }: Props) {
  const stageRef = useRef<Konva.Stage>(null);
  const labelStageRef = useRef<Konva.Stage>(null);
  const occlusionCanvasRef = useRef<HTMLCanvasElement>(null);
  const zoomCanvasRef = useRef<HTMLCanvasElement>(null);
  const visible = drawings
    .filter((drawing) => getObjectStateAtTime(drawing, currentTime).visible)
    .sort((left, right) => Number(right.data.kind === "spotlight") - Number(left.data.kind === "spotlight"));

  useEffect(() => {
    if (!registerCapture) return;
    registerCapture(() => {
      const stage = stageRef.current;
      if (!stage) return null;
      const canvas = stage.toCanvas({ pixelRatio: 1 });
      const context = canvas.getContext("2d");
      if (!context) return canvas;
      if (occlusionCanvasRef.current) context.drawImage(occlusionCanvasRef.current, 0, 0, canvas.width, canvas.height);
      if (zoomCanvasRef.current) context.drawImage(zoomCanvasRef.current, 0, 0, canvas.width, canvas.height);
      const labelCanvas = labelStageRef.current?.toCanvas({ pixelRatio: 1 });
      if (labelCanvas) context.drawImage(labelCanvas, 0, 0, canvas.width, canvas.height);
      return canvas;
    });
    return () => registerCapture(null);
  }, [registerCapture]);

  return (
    <>
    <Stage ref={stageRef} width={width} height={height} listening={false} className="drawing-stage preview-stage">
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
            renderMode="base"
            targetOffset={targetOffsetAtTime(object, playerTracks, currentTime)}
          />
        ))}
      </Layer>
    </Stage>
    <PlayerOcclusionCanvas ref={occlusionCanvasRef} drawings={drawings} playerTracks={playerTracks} currentTime={currentTime} width={width} height={height} getVideoElement={getVideoElement} />
    <ZoomLensCanvas ref={zoomCanvasRef} drawings={drawings} currentTime={currentTime} width={width} height={height} getVideoElement={getVideoElement} />
    <PlayerLabelOverlay ref={labelStageRef} drawings={drawings} playerTracks={playerTracks} currentTime={currentTime} width={width} height={height} />
    </>
  );
}
