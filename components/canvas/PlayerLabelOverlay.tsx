"use client";

import { forwardRef } from "react";
import Konva from "konva";
import { Layer, Stage } from "react-konva";
import type { DrawingObject, PlayerTrack } from "@/types/drawing";
import type { FreezeFrame } from "@/types/slide";
import { getObjectStateAtTime } from "@/utils/temporalRenderer";
import { sourceTimeToTimeline, timelineTimeToSource } from "@/utils/videoTimeline";
import { followsSamTracking, targetAvailableAtTime, targetOffsetAtTime } from "@/utils/playerTracking";
import { DrawingShape } from "./DrawingShape";

interface Props {
  drawings: DrawingObject[];
  playerTracks?: PlayerTrack[];
  currentTime: number;
  width: number;
  height: number;
  editingPreview?: boolean;
  freezeFrames?: FreezeFrame[];
}

export const PlayerLabelOverlay = forwardRef<Konva.Stage, Props>(function PlayerLabelOverlay({ drawings, playerTracks, currentTime, width, height, editingPreview = false, freezeFrames }, ref) {
  const sourceTime = timelineTimeToSource(currentTime, freezeFrames).sourceTime;
  const samTimelineTime = sourceTimeToTimeline(sourceTime, freezeFrames);
  const labels = drawings.filter((drawing) => (drawing.type === "playerRing" || drawing.type === "playerLabel")
    && getObjectStateAtTime(drawing, followsSamTracking(drawing, playerTracks) ? samTimelineTime : currentTime).visible
    && targetAvailableAtTime(drawing, playerTracks, currentTime, sourceTime));

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
            targetOffset={targetOffsetAtTime(drawing, playerTracks, currentTime, sourceTime)}
            playerTracks={playerTracks}
            allDrawings={drawings}
            sourceTime={sourceTime}
            samTimelineTime={samTimelineTime}
          />
        ))}
      </Layer>
    </Stage>
  );
});
