"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import Konva from "konva";
import { Arc, Circle, Ellipse, Group, Line, Rect, Text, Transformer } from "react-konva";
import type { DrawingData, DrawingObject, ObjectTransform, PlayerTrack, Point } from "@/types/drawing";
import { flattenPoints } from "@/utils/coordinates";
import { automaticLongBallControl, buildCurvedArrowGeometry, quadraticPointAt } from "@/utils/curvedArrowGeometry";
import { samplePlayerTrackAtTime } from "@/utils/playerTracking";
import { getObjectStateAtTime, resolvedDrawingAnimation } from "@/utils/temporalRenderer";

interface Props {
  object: DrawingObject;
  width: number;
  height: number;
  currentTime: number;
  selected: boolean;
  canEdit: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<DrawingObject>) => void;
  renderMode?: "all" | "base" | "playerLabel";
  editingPreview?: boolean;
  targetOffset?: Point;
  playerTracks?: PlayerTrack[];
  allDrawings?: DrawingObject[];
  onTransformPreview?: (transform?: ObjectTransform) => void;
}

function withAlpha(color: string, alpha: number) {
  const hex = color.match(/^#([0-9a-f]{6})/i)?.[1];
  if (!hex) return color;
  const value = Number.parseInt(hex, 16);
  return `rgba(${value >> 16}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

function solidColor(color: string, fallback: string) {
  return color.match(/^#[0-9a-f]{6}/i)?.[0] ?? fallback;
}

function shadeColor(color: string, amount: number) {
  const hex = solidColor(color, "#808080").slice(1);
  const value = Number.parseInt(hex, 16);
  const channel = (shift: number) => Math.max(0, Math.min(255, ((value >> shift) & 255) + amount));
  return `#${[channel(16), channel(8), channel(0)].map((part) => part.toString(16).padStart(2, "0")).join("")}`;
}

function offsetPoints(points: number[], offsetX: number, offsetY: number) {
  return points.map((value, index) => value + (index % 2 === 0 ? offsetX : offsetY));
}

function partialPolylinePoints(points: number[], progress: number) {
  if (points.length < 4 || progress >= .999) return points;
  const clamped = Math.max(0, Math.min(1, progress));
  const segments = Array.from({ length: points.length / 2 - 1 }, (_, index) => {
    const startX = points[index * 2];
    const startY = points[index * 2 + 1];
    const endX = points[index * 2 + 2];
    const endY = points[index * 2 + 3];
    return { startX, startY, endX, endY, length: Math.hypot(endX - startX, endY - startY) };
  });
  const total = segments.reduce((sum, segment) => sum + segment.length, 0);
  const target = total * clamped;
  const result = [points[0], points[1]];
  let travelled = 0;
  for (const segment of segments) {
    if (travelled + segment.length <= target) {
      result.push(segment.endX, segment.endY);
      travelled += segment.length;
      continue;
    }
    const remaining = Math.max(0, target - travelled);
    const ratio = segment.length ? remaining / segment.length : 0;
    result.push(
      segment.startX + (segment.endX - segment.startX) * ratio,
      segment.startY + (segment.endY - segment.startY) * ratio,
    );
    break;
  }
  if (result.length < 4) result.push(points[0] + .01, points[1] + .01);
  return result;
}

function arrowHeadPoints(points: number[], length: number, width: number) {
  if (points.length < 4) return [];
  const tipX = points.at(-2)!;
  const tipY = points.at(-1)!;
  const startX = points[0];
  const startY = points[1];
  const angle = Math.atan2(tipY - startY, tipX - startX);
  const baseX = tipX - Math.cos(angle) * length;
  const baseY = tipY - Math.sin(angle) * length;
  const normalX = -Math.sin(angle) * width / 2;
  const normalY = Math.cos(angle) * width * .31;
  return [tipX, tipY, baseX + normalX, baseY + normalY, baseX - normalX, baseY - normalY];
}

function anchoredLinePoints(data: Extract<DrawingData, { kind: "line" }>, playerTracks: PlayerTrack[] | undefined, currentTime: number) {
  const points = data.points.map((point) => ({ ...point }));
  if (points.length < 2 || !playerTracks?.length) return points;
  const resolve = (target: typeof data.startTarget) => {
    if (!target?.referenceFoot) return null;
    const track = playerTracks.find((item) => item.id === target.trackId);
    if (!track?.samples.length) return null;
    return samplePlayerTrackAtTime(track, currentTime).foot;
  };
  if (data.pointTargets?.length) {
    data.pointTargets.forEach((target, index) => {
      const resolved = resolve(target ?? undefined);
      if (resolved && points[index]) points[index] = resolved;
    });
  } else {
    const start = resolve(data.startTarget);
    const end = resolve(data.endTarget);
    if (start) points[0] = start;
    if (end) points[points.length - 1] = end;
  }
  return points;
}

function anchoredLineSegments(
  data: Extract<DrawingData, { kind: "line" }>,
  playerTracks: PlayerTrack[] | undefined,
  allDrawings: DrawingObject[] | undefined,
  currentTime: number,
  width: number,
  height: number,
  strokeWidth: number,
) {
  const centers = anchoredLinePoints(data, playerTracks, currentTime).map((point) => ({ x: point.x * width, y: point.y * height }));
  const targets = data.pointTargets?.length
    ? data.pointTargets
    : centers.map((_, index) => index === 0 ? data.startTarget ?? null : index === centers.length - 1 ? data.endTarget ?? null : null);
  const boundary = (index: number, unitX: number, unitY: number) => {
    const target = targets[index];
    if (!target) return 0;
    const ring = [...(allDrawings ?? [])].reverse().find((drawing) =>
      drawing.data.kind === "playerRing"
      && drawing.data.showRing !== false
      && drawing.target?.kind === "player"
      && drawing.target.trackId === target.trackId
      && getObjectStateAtTime(drawing, currentTime).visible,
    );
    if (!ring || ring.data.kind !== "playerRing") return 0;
    const ringState = getObjectStateAtTime(ring, currentTime);
    const radiusX = Math.max(1, ring.data.radiusX * width * Math.abs(ringState.transform.scaleX));
    const radiusY = Math.max(1, ring.data.radiusY * height * Math.abs(ringState.transform.scaleY));
    const denominator = Math.sqrt((unitX * unitX) / (radiusX * radiusX) + (unitY * unitY) / (radiusY * radiusY));
    return (denominator ? 1 / denominator : 0) + strokeWidth * .6;
  };
  return centers.slice(0, -1).flatMap((start, index) => {
    const end = centers[index + 1];
    const deltaX = end.x - start.x;
    const deltaY = end.y - start.y;
    const length = Math.hypot(deltaX, deltaY);
    if (length < 1) return [];
    const unitX = deltaX / length;
    const unitY = deltaY / length;
    const startInset = boundary(index, unitX, unitY);
    const endInset = boundary(index + 1, -unitX, -unitY);
    if (startInset + endInset >= length - 1) return [];
    return [[
      start.x + unitX * startInset,
      start.y + unitY * startInset,
      end.x - unitX * endInset,
      end.y - unitY * endInset,
    ]];
  });
}

function partialLineSegments(segments: number[][], progress: number) {
  if (progress >= .999) return segments;
  const lengths = segments.map((segment) => Math.hypot(segment[2] - segment[0], segment[3] - segment[1]));
  let remaining = lengths.reduce((sum, length) => sum + length, 0) * Math.max(0, Math.min(1, progress));
  const visible: number[][] = [];
  segments.forEach((segment, index) => {
    if (remaining <= 0) return;
    const length = lengths[index];
    if (remaining >= length) {
      visible.push(segment);
      remaining -= length;
      return;
    }
    const ratio = length ? remaining / length : 0;
    visible.push([
      segment[0], segment[1],
      segment[0] + (segment[2] - segment[0]) * ratio,
      segment[1] + (segment[3] - segment[1]) * ratio,
    ]);
    remaining = 0;
  });
  return visible;
}

export function DrawingShape({ object, width, height, currentTime, selected, canEdit, onSelect, onChange, renderMode = "all", editingPreview = false, targetOffset = { x: 0, y: 0 }, playerTracks, allDrawings, onTransformPreview }: Props) {
  const nodeRef = useRef<Konva.Group>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const [longBallPreviewData, setLongBallPreviewData] = useState<Extract<DrawingData, { kind: "longBallArrow" }> | null>(null);
  const calculatedTemporalState = getObjectStateAtTime(object, currentTime);
  const temporalState = editingPreview
    ? { ...calculatedTemporalState, opacity: object.style.opacity, entryProgress: 1, exitProgress: 1 }
    : calculatedTemporalState;
  const animation = resolvedDrawingAnimation(object);
  const transform = temporalState.transform;
  const drawProgress = animation.motion === "draw" ? temporalState.entryProgress : 1;
  const revealProgress = animation.motion === "reveal" ? temporalState.entryProgress : 1;

  useEffect(() => {
    if (selected && transformerRef.current && nodeRef.current) {
      transformerRef.current.nodes([nodeRef.current]);
      transformerRef.current.forceUpdate();
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [selected, longBallPreviewData]);

  const sitsOnGround = ["ellipse", "rectangle", "arrow", "longBallArrow", "line", "triangle", "polygon", "freeDraw"].includes(object.type);
  const groundHeight = Math.max(0, Math.min(1, object.style.groundHeight ?? .08));
  const groundShadowFactor = sitsOnGround ? .04 + groundHeight * .96 : 1;
  const effectiveShadow = {
    offsetX: (object.style.shadowOffsetX ?? 0) * groundShadowFactor,
    offsetY: (object.style.shadowOffsetY ?? 0) * groundShadowFactor,
    blur: (object.style.shadowBlur ?? 0) * (.12 + groundHeight * .88),
    opacity: (object.style.shadowOpacity ?? 0) * groundShadowFactor,
  };
  const common = {
    stroke: object.style.stroke,
    strokeWidth: object.style.strokeWidth,
    opacity: temporalState.opacity,
    dash: object.style.dash,
    lineCap: "round" as const,
    lineJoin: "round" as const,
    shadowColor: object.style.shadowColor ?? "#000000",
    shadowBlur: effectiveShadow.blur,
    shadowOpacity: effectiveShadow.opacity,
    shadowOffsetX: effectiveShadow.offsetX,
    shadowOffsetY: effectiveShadow.offsetY,
  };

  const renderPatternShape = (
    points: number[],
    design: "solid" | "striped",
    stripeColorValue?: string,
    stripeSpacingValue?: number,
    stripeAngleValue?: number,
    stripeOpacityValue?: number,
    keyPrefix = "shape",
  ) => {
    if (design === "solid") return <Line {...common} points={points} closed fill={object.style.fill} />;
    const xValues = points.filter((_, index) => index % 2 === 0);
    const yValues = points.filter((_, index) => index % 2 === 1);
    const minX = Math.min(...xValues);
    const maxX = Math.max(...xValues);
    const minY = Math.min(...yValues);
    const maxY = Math.max(...yValues);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const span = Math.hypot(maxX - minX, maxY - minY) + Math.min(width, height) * .2;
    const spacing = Math.max(5, (stripeSpacingValue ?? .014) * Math.min(width, height));
    const angle = (stripeAngleValue ?? 58) * Math.PI / 180;
    const directionX = Math.cos(angle);
    const directionY = Math.sin(angle);
    const normalX = -directionY;
    const normalY = directionX;
    const stripeCount = Math.ceil(span * 2 / spacing);
    const stripeColor = solidColor(stripeColorValue ?? "#ffffff", "#ffffff");
    const stripes = Array.from({ length: stripeCount + 1 }, (_, index) => {
      const offset = (index - stripeCount / 2) * spacing;
      return [
        centerX + normalX * offset - directionX * span,
        centerY + normalY * offset - directionY * span,
        centerX + normalX * offset + directionX * span,
        centerY + normalY * offset + directionY * span,
      ];
    });
    return (
      <Group>
        <Line {...common} points={points} closed fill={withAlpha(solidColor(object.style.fill, object.style.stroke), .12)} />
        <Group
          opacity={temporalState.opacity}
          listening={false}
          clipFunc={(context) => {
            context.beginPath();
            context.moveTo(points[0], points[1]);
            for (let index = 2; index < points.length; index += 2) context.lineTo(points[index], points[index + 1]);
            context.closePath();
          }}
        >
          {stripes.map((stripePoints, index) => (
            <Line key={`${keyPrefix}-stripe-${index}`} points={stripePoints} stroke={withAlpha(stripeColor, stripeOpacityValue ?? .72)} strokeWidth={Math.max(2.2, spacing * .48)} listening={false} />
          ))}
        </Group>
      </Group>
    );
  };

  const content = (() => {
    const data = selected && object.data.kind === "longBallArrow" && longBallPreviewData ? longBallPreviewData : object.data;
    if (renderMode === "playerLabel" && data.kind !== "playerRing" && data.kind !== "playerLabel") return null;
    switch (data.kind) {
      case "identifyPlayer": {
        if (!canEdit || !selected) return null;
        return (
          <Group opacity={selected ? .95 : .55} listening>
            <Ellipse
              x={data.center.x * width}
              y={data.center.y * height}
              radiusX={data.radiusX * width}
              radiusY={data.radiusY * height}
              stroke="#a3ff12"
              strokeWidth={1.5}
              dash={[5, 5]}
              fill="#a3ff1208"
            />
            <Line
              points={[data.center.x * width - 7, data.center.y * height, data.center.x * width + 7, data.center.y * height]}
              stroke="#a3ff12"
              strokeWidth={1}
            />
          </Group>
        );
      }
      case "playerLabel": {
        const x = data.anchor.x * width;
        const y = data.anchor.y * height;
        const labelText = [data.label.number.trim(), data.label.position.trim(), data.label.name.trim()]
          .filter(Boolean)
          .join("/")
          .toUpperCase();
        const fontSize = data.label.fontSize * height;
        const labelY = Math.max(5, y - (data.labelOffsetY ?? .12) * height);
        const labelWidth = Math.max(110, Math.min(420, labelText.length * fontSize * .72));
        if (renderMode === "base") {
          return (
            <Group opacity={temporalState.opacity}>
              <Rect x={x - labelWidth / 2} y={labelY - 4} width={labelWidth} height={fontSize * 1.9} fill="#ffffff01" />
              <Ellipse x={x} y={y} radiusX={8} radiusY={5} fill="#ffffff01" stroke={selected ? "#a3ff12" : "#ffffff01"} strokeWidth={selected ? 1.5 : 1} dash={selected ? [4, 3] : []} />
            </Group>
          );
        }
        if (!data.label.visible || !labelText) return null;
        return (
          <Group opacity={temporalState.opacity} listening={false}>
            <Text
              x={x - labelWidth / 2}
              y={labelY}
              width={labelWidth}
              align="center"
              text={labelText}
              fontSize={fontSize}
              fontStyle="bold"
              fontFamily="Inter, Arial, sans-serif"
              letterSpacing={.45}
              fill={data.label.color}
              shadowColor="#000000"
              shadowBlur={Math.max(3, fontSize * .2)}
              shadowOffsetY={Math.max(1, fontSize * .08)}
              shadowOpacity={.68}
            />
            <Line
              points={[
                x - Math.max(5, fontSize * .24), labelY + fontSize + 4,
                x + Math.max(5, fontSize * .24), labelY + fontSize + 4,
                x, labelY + fontSize + Math.max(11, fontSize * .58),
              ]}
              closed
              fill={data.label.color}
              shadowColor="#000000"
              shadowBlur={Math.max(3, fontSize * .18)}
              shadowOffsetY={Math.max(1, fontSize * .08)}
              shadowOpacity={.62}
            />
          </Group>
        );
      }
      case "playerRing": {
        const x = data.center.x * width;
        const y = data.center.y * height;
        const radiusX = data.radiusX * width;
        const radiusY = Math.min(data.radiusY * height, radiusX * .5);
        const primaryColor = solidColor(object.style.stroke, "#f7f8f2");
        const secondaryColor = solidColor(object.style.fill, "#1454c4");
        const ringDesign = data.ringDesign ?? "segmented";
        const glowColor = ringDesign === "broadcastGlow" ? "#ffffff" : solidColor(object.style.shadowColor, "#f1e72b");
        const glowStrength = object.style.shadowOpacity;
        const appearanceScale = animation.motion === "ringLock" || animation.motion === "scaleIn"
          ? .18 + temporalState.entryProgress * .82
          : 1;
        const spinSpeed = data.spinSpeed ?? 1;
        const elapsed = Math.max(0, currentTime - object.startTime);
        const outerRotation = data.spinEnabled === false ? 0 : elapsed * 48 * spinSpeed;
        const innerRotation = data.spinEnabled === false ? 0 : -elapsed * 72 * spinSpeed;
        const ringThickness = Math.max(0, Math.min(16, object.style.strokeWidth));
        const outerBand = Math.min(.3, ringThickness * .024);
        const outerInnerRadius = radiusX * (1 - outerBand);
        const innerOuterRadius = radiusX * .77;
        const innerInnerRadius = innerOuterRadius - radiusX * Math.min(.24, ringThickness * .021);
        const fineOuterInnerRadius = radiusX * (1 - Math.min(.18, ringThickness * .012));
        const fineInnerOuterRadius = radiusX * .84;
        const fineInnerInnerRadius = fineInnerOuterRadius - radiusX * Math.min(.16, ringThickness * .011);
        const broadcastOuterInnerRadius = radiusX * (1 - Math.min(.2, ringThickness * .016));
        const broadcastInnerOuterRadius = radiusX * .895;
        const broadcastInnerInnerRadius = broadcastInnerOuterRadius - radiusX * Math.min(.3, ringThickness * .036);
        const ringEdgeWidth = ringThickness === 0 ? 0 : Math.max(.45, ringThickness * .14);
        const depthOffset = Math.max(.7, radiusY * .055);
        const makeSegments = (inner = false) => Array.from({ length: 8 }, (_, slot) => {
            const center = -90 + slot * 45;
            const segmentAngle = inner ? 22 : slot % 2 === 0 ? 30 : 24;
            const halfAngle = segmentAngle / 2;
            return { slot, start: center - halfAngle, angle: segmentAngle };
          });
          const outerSegments = makeSegments();
          const innerSegments = makeSegments(true);
          const fineOuterSegments = Array.from({ length: 12 }, (_, slot) => ({ start: -90 + slot * 30 - 10.5, angle: 21 }));
          const fineInnerSegments = Array.from({ length: 10 }, (_, slot) => ({ start: -90 + slot * 36 - 12.5, angle: 25 }));
          const broadcastOuterSegments = Array.from({ length: 8 }, (_, slot) => ({ start: -90 + slot * 45 - 17, angle: 34 }));
          const broadcastInnerSegments = Array.from({ length: 8 }, (_, slot) => ({ start: -90 + slot * 45 - 16, angle: 32 }));
          const labelText = data.label
            ? [data.label.number.trim(), data.label.position.trim(), data.label.name.trim()]
              .filter(Boolean)
              .join("/")
              .toUpperCase()
            : "";
          const labelFontSize = (data.label?.fontSize ?? .032) * height;
          const labelY = Math.max(5, y - (data.labelOffsetY ?? .12) * height);
          const labelWidth = Math.max(110, Math.min(420, labelText.length * labelFontSize * .72));
          const labelNode = data.label?.visible && labelText ? (
            <Group listening={false}>
              <Text
                x={x - labelWidth / 2}
                y={labelY}
                width={labelWidth}
                align="center"
                text={labelText}
                fontSize={labelFontSize}
                fontStyle="bold"
                fontFamily="Inter, Arial, sans-serif"
                letterSpacing={.45}
                fill={data.label.color}
                shadowColor="#000000"
                shadowBlur={Math.max(3, labelFontSize * .2)}
                shadowOffsetY={Math.max(1, labelFontSize * .08)}
                shadowOpacity={.68}
                listening={false}
              />
              <Line
                points={[
                  x - Math.max(5, labelFontSize * .24), labelY + labelFontSize + 4,
                  x + Math.max(5, labelFontSize * .24), labelY + labelFontSize + 4,
                  x, labelY + labelFontSize + Math.max(11, labelFontSize * .58),
                ]}
                closed
                fill={data.label.color}
                shadowColor="#000000"
                shadowBlur={Math.max(3, labelFontSize * .18)}
                shadowOffsetY={Math.max(1, labelFontSize * .08)}
                shadowOpacity={.62}
              />
            </Group>
          ) : null;
          if (renderMode === "playerLabel") return labelNode;
          const splashNodes = data.splashEnabled ? Array.from({ length: 3 }, (_, index) => {
            const phase = ((elapsed * (data.splashSpeed ?? 1) + index / 3) % 1 + 1) % 1;
            const scale = .22 + phase * 1.18;
            return (
              <Ellipse
                key={`splash-${index}`}
                x={x}
                y={y}
                radiusX={radiusX * scale}
                radiusY={radiusY * scale}
                stroke={primaryColor}
                strokeWidth={ringThickness * (1 - phase * .55)}
                opacity={Math.pow(1 - phase, 1.6) * .9}
                shadowColor={primaryColor}
                shadowBlur={Math.max(5, object.style.shadowBlur * .5)}
                shadowOpacity={.65}
                listening={false}
              />
            );
          }) : null;
          return (
            <Group x={x} y={y} offsetX={x} offsetY={y} scaleX={appearanceScale} scaleY={appearanceScale} opacity={temporalState.opacity}>
            {splashNodes}
            <Group visible={data.showRing !== false}>
            <Ellipse
              x={x - radiusX * .34 + object.style.shadowOffsetX}
              y={y + radiusY * .2 + object.style.shadowOffsetY}
              radiusX={radiusX * .68}
              radiusY={radiusY * .2}
              rotation={-8}
              fill="#000000"
              opacity={.36 * object.style.shadowOpacity}
              shadowColor="#000000"
              shadowBlur={Math.max(4, object.style.shadowBlur * .38)}
              shadowOpacity={.7}
              listening={false}
            />
            {ringDesign === "broadcastGlow" && (
              <Ellipse
                x={x}
                y={y}
                radiusX={radiusX * 1.22}
                radiusY={radiusY * 1.32}
                fillRadialGradientStartPoint={{ x: 0, y: 0 }}
                fillRadialGradientEndPoint={{ x: 0, y: 0 }}
                fillRadialGradientStartRadius={radiusX * .58}
                fillRadialGradientEndRadius={radiusX * 1.22}
                fillRadialGradientColorStops={[0, "rgba(255,255,255,0)", .5, "rgba(255,255,255,0.18)", .78, "rgba(255,255,255,0.38)", 1, "rgba(255,255,255,0)"]}
                shadowColor="#ffffff"
                shadowBlur={Math.max(16, object.style.shadowBlur)}
                shadowOpacity={Math.max(.45, object.style.shadowOpacity * .8)}
                listening={false}
              />
            )}
            <Ellipse
              x={x}
              y={y}
              radiusX={radiusX * 1.12}
              radiusY={radiusY * 1.15}
              fillRadialGradientStartPoint={{ x: 0, y: 0 }}
              fillRadialGradientEndPoint={{ x: 0, y: 0 }}
              fillRadialGradientStartRadius={0}
              fillRadialGradientEndRadius={radiusX * 1.14}
              fillRadialGradientColorStops={[0, withAlpha(glowColor, .42 * glowStrength), .52, withAlpha(glowColor, .26 * glowStrength), 1, withAlpha(glowColor, 0)]}
              shadowColor={glowColor}
              shadowBlur={object.style.shadowBlur}
              shadowOpacity={object.style.shadowOpacity * .75}
              listening={false}
            />
            <Ellipse
              x={x}
              y={y + radiusY * .02}
              radiusX={radiusX * .27}
              radiusY={radiusY * .16}
              fill="#000000"
              opacity={.34}
              shadowColor="#000000"
              shadowBlur={Math.max(4, object.style.shadowBlur * .3)}
              shadowOpacity={.72}
              listening={false}
            />
            <Group visible={ringDesign === "segmented"} x={x} y={y + depthOffset} scaleY={radiusY / radiusX} listening={false}>
              {outerSegments.map((segment, index) => {
                const segmentColor = primaryColor;
                return (
                  <Arc
                    key={`outer-depth-${index}`}
                    innerRadius={outerInnerRadius}
                    outerRadius={radiusX}
                    angle={segment.angle}
                    rotation={segment.start + outerRotation}
                    fill={shadeColor(segmentColor, -72)}
                    stroke={shadeColor(segmentColor, -105)}
                    strokeWidth={ringEdgeWidth}
                    shadowColor="#000000"
                    shadowBlur={5}
                    shadowOffsetY={3}
                    shadowOpacity={.65}
                  />
                );
              })}
              {innerSegments.map((segment, index) => {
                const segmentColor = secondaryColor;
                return <Arc key={`inner-depth-${index}`} innerRadius={innerInnerRadius} outerRadius={innerOuterRadius} angle={segment.angle} rotation={segment.start + innerRotation} fill={shadeColor(segmentColor, -78)} stroke={shadeColor(segmentColor, -110)} strokeWidth={ringEdgeWidth} />;
              })}
            </Group>
              <Group visible={ringDesign === "segmented"} x={x} y={y} scaleY={radiusY / radiusX}>
              {outerSegments.map((segment, index) => {
                const segmentColor = primaryColor;
                return (
                  <Arc
                    key={`outer-face-${index}`}
                    innerRadius={outerInnerRadius}
                    outerRadius={radiusX}
                    angle={segment.angle}
                    rotation={segment.start + outerRotation}
                    fillLinearGradientStartPoint={{ x: 0, y: -radiusX }}
                    fillLinearGradientEndPoint={{ x: 0, y: radiusX }}
                    fillLinearGradientColorStops={[0, shadeColor(segmentColor, 52), .36, shadeColor(segmentColor, 18), .7, segmentColor, 1, shadeColor(segmentColor, -42)]}
                    stroke={shadeColor(segmentColor, index % 2 === 0 ? -25 : 28)}
                    strokeWidth={ringEdgeWidth}
                    shadowColor="#000000"
                    shadowBlur={3}
                    shadowOffsetY={2}
                    shadowOpacity={.45}
                  />
                );
              })}
              {innerSegments.map((segment, index) => {
                const segmentColor = secondaryColor;
                return (
                  <Arc
                    key={`inner-face-${index}`}
                    innerRadius={innerInnerRadius}
                    outerRadius={innerOuterRadius}
                    angle={segment.angle}
                    rotation={segment.start + innerRotation}
                    fillLinearGradientStartPoint={{ x: 0, y: -innerOuterRadius }}
                    fillLinearGradientEndPoint={{ x: 0, y: innerOuterRadius }}
                    fillLinearGradientColorStops={[0, shadeColor(segmentColor, 48), .38, shadeColor(segmentColor, 14), .72, segmentColor, 1, shadeColor(segmentColor, -38)]}
                    stroke={shadeColor(segmentColor, 26)}
                    strokeWidth={ringEdgeWidth}
                    shadowColor="#000000"
                    shadowBlur={2}
                    shadowOffsetY={1.5}
                    shadowOpacity={.42}
                  />
                );
                })}
              </Group>
              <Group visible={ringDesign === "doubleLine"} x={x} y={y + depthOffset * .65} scaleY={radiusY / radiusX} listening={false}>
                {fineOuterSegments.map((segment, index) => (
                  <Arc
                    key={`fine-outer-depth-${index}`}
                    innerRadius={fineOuterInnerRadius}
                    outerRadius={radiusX}
                    angle={segment.angle}
                    rotation={segment.start + outerRotation}
                    fill={shadeColor(primaryColor, -72)}
                    stroke={shadeColor(primaryColor, -100)}
                    strokeWidth={ringEdgeWidth}
                  />
                ))}
                {fineInnerSegments.map((segment, index) => (
                  <Arc
                    key={`fine-inner-depth-${index}`}
                    innerRadius={fineInnerInnerRadius}
                    outerRadius={fineInnerOuterRadius}
                    angle={segment.angle}
                    rotation={segment.start + innerRotation}
                    fill={shadeColor(secondaryColor, -72)}
                    stroke={shadeColor(secondaryColor, -100)}
                    strokeWidth={ringEdgeWidth}
                  />
                ))}
              </Group>
              <Group visible={ringDesign === "doubleLine"} x={x} y={y} scaleY={radiusY / radiusX} listening={false}>
                {fineOuterSegments.map((segment, index) => (
                  <Arc
                    key={`fine-outer-face-${index}`}
                    innerRadius={fineOuterInnerRadius}
                    outerRadius={radiusX}
                    angle={segment.angle}
                    rotation={segment.start + outerRotation}
                    fill={primaryColor}
                    stroke={shadeColor(primaryColor, 30)}
                    strokeWidth={ringEdgeWidth}
                    shadowColor={primaryColor}
                    shadowBlur={Math.max(1, object.style.shadowBlur * .18)}
                    shadowOpacity={object.style.shadowOpacity * .7}
                  />
                ))}
                {fineInnerSegments.map((segment, index) => (
                  <Arc
                    key={`fine-inner-face-${index}`}
                    innerRadius={fineInnerInnerRadius}
                    outerRadius={fineInnerOuterRadius}
                    angle={segment.angle}
                    rotation={segment.start + innerRotation}
                    fill={secondaryColor}
                    stroke={shadeColor(secondaryColor, 30)}
                    strokeWidth={ringEdgeWidth}
                    shadowColor={secondaryColor}
                    shadowBlur={Math.max(1, object.style.shadowBlur * .18)}
                    shadowOpacity={object.style.shadowOpacity * .7}
                  />
                ))}
              </Group>
              <Group visible={ringDesign === "broadcast" || ringDesign === "broadcastGlow"} x={x} y={y + depthOffset * .72} scaleY={radiusY / radiusX} listening={false}>
                {broadcastOuterSegments.map((segment, index) => (
                  <Arc
                    key={`broadcast-outer-depth-${index}`}
                    innerRadius={broadcastOuterInnerRadius}
                    outerRadius={radiusX}
                    angle={segment.angle}
                    rotation={segment.start + outerRotation}
                    fill={shadeColor(primaryColor, -88)}
                    stroke={shadeColor(primaryColor, -112)}
                    strokeWidth={ringEdgeWidth}
                    shadowColor="#000000"
                    shadowBlur={4}
                    shadowOffsetY={2.5}
                    shadowOpacity={.6}
                  />
                ))}
                {broadcastInnerSegments.map((segment, index) => (
                  <Arc
                    key={`broadcast-inner-depth-${index}`}
                    innerRadius={broadcastInnerInnerRadius}
                    outerRadius={broadcastInnerOuterRadius}
                    angle={segment.angle}
                    rotation={segment.start + innerRotation}
                    fill={shadeColor(secondaryColor, -82)}
                    stroke={shadeColor(secondaryColor, -108)}
                    strokeWidth={ringEdgeWidth}
                  />
                ))}
              </Group>
              <Group visible={ringDesign === "broadcast" || ringDesign === "broadcastGlow"} x={x} y={y} scaleY={radiusY / radiusX} listening={false}>
                {broadcastOuterSegments.map((segment, index) => (
                  <Arc
                    key={`broadcast-outer-face-${index}`}
                    innerRadius={broadcastOuterInnerRadius}
                    outerRadius={radiusX}
                    angle={segment.angle}
                    rotation={segment.start + outerRotation}
                    fillLinearGradientStartPoint={{ x: 0, y: -radiusX }}
                    fillLinearGradientEndPoint={{ x: 0, y: radiusX }}
                    fillLinearGradientColorStops={[0, shadeColor(primaryColor, 48), .38, shadeColor(primaryColor, 16), .72, primaryColor, 1, shadeColor(primaryColor, -38)]}
                    stroke={shadeColor(primaryColor, -18)}
                    strokeWidth={ringEdgeWidth}
                    shadowColor={ringDesign === "broadcastGlow" ? "#ffffff" : "#000000"}
                    shadowBlur={ringDesign === "broadcastGlow" ? 7 : 2}
                    shadowOpacity={ringDesign === "broadcastGlow" ? .82 : .32}
                  />
                ))}
                {broadcastInnerSegments.map((segment, index) => (
                  <Arc
                    key={`broadcast-inner-face-${index}`}
                    innerRadius={broadcastInnerInnerRadius}
                    outerRadius={broadcastInnerOuterRadius}
                    angle={segment.angle}
                    rotation={segment.start + innerRotation}
                    fillLinearGradientStartPoint={{ x: 0, y: -radiusX * .9 }}
                    fillLinearGradientEndPoint={{ x: 0, y: radiusX * .9 }}
                    fillLinearGradientColorStops={[0, shadeColor(secondaryColor, 58), .32, shadeColor(secondaryColor, 20), .68, secondaryColor, 1, shadeColor(secondaryColor, -48)]}
                    stroke={shadeColor(secondaryColor, -28)}
                    strokeWidth={ringEdgeWidth}
                    shadowColor="#000000"
                    shadowBlur={2.5}
                    shadowOffsetY={1.5}
                    shadowOpacity={.42}
                  />
                ))}
              </Group>
              {renderMode !== "base" && labelNode}
              <Ellipse x={x} y={y} radiusX={radiusX} radiusY={radiusY} fill="#00000001" />
            </Group>
            </Group>
          );
      }
      case "ghost": {
        const destination = { x: data.destination.x * width, y: data.destination.y * height };
        const selectionWidth = Math.max(18, data.radiusX * width * 2 * Math.abs(transform.scaleX));
        const selectionHeight = Math.max(34, data.radiusY * height * 2 * Math.abs(transform.scaleY));
        if (!canEdit) return null;
        return (
          <Group opacity={temporalState.opacity}>
            <Rect
              x={destination.x - selectionWidth / 2}
              y={destination.y - selectionHeight}
              width={selectionWidth}
              height={selectionHeight}
              fill="#ffffff01"
              stroke={selected ? "#a3ff12" : "#ffffff01"}
              strokeWidth={selected ? 1.5 : 1}
              dash={selected ? [5, 4] : []}
            />
          </Group>
        );
      }
      case "spotlight": {
        const x = data.target.x * width;
        const y = data.target.y * height;
        const radiusX = data.radiusX * width;
        const radiusY = Math.max(data.radiusY * height, radiusX * .24);
        const top = y - data.beamHeight * height;
        const lightColor = solidColor(object.style.stroke, "#fff8c7");
        const appearanceScale = animation.motion === "scaleIn" ? .72 + temporalState.entryProgress * .28 : 1;
        const baseDepth = Math.max(2, Math.min(8, radiusY * .22 + object.style.strokeWidth * .28));
        const base3d = (
          <Group listening={false}>
            <Ellipse
              x={x}
              y={y + baseDepth}
              radiusX={radiusX}
              radiusY={radiusY}
              fill={shadeColor(lightColor, -78)}
              stroke={shadeColor(lightColor, -96)}
              strokeWidth={Math.max(0, object.style.strokeWidth * .55)}
            />
            <Ellipse
              x={x}
              y={y}
              radiusX={radiusX}
              radiusY={radiusY}
              fillRadialGradientStartPoint={{ x: 0, y: 0 }}
              fillRadialGradientEndPoint={{ x: 0, y: 0 }}
              fillRadialGradientStartRadius={0}
              fillRadialGradientEndRadius={radiusX}
              fillRadialGradientColorStops={[0, withAlpha(lightColor, .58), .68, withAlpha(lightColor, .52), 1, withAlpha(lightColor, .34)]}
              stroke={withAlpha(shadeColor(lightColor, 28), .9)}
              strokeWidth={object.style.strokeWidth}
              shadowColor={lightColor}
              shadowBlur={Math.max(14, object.style.shadowBlur)}
              shadowOpacity={Math.max(.48, object.style.shadowOpacity)}
            />
          </Group>
        );
        if ((data.design ?? "beam") === "isolation") {
          const darkness = data.darkness ?? .68;
          const feather = data.feather ?? .48;
          return (
            <Group opacity={temporalState.opacity}>
              <Rect x={-width * 2} y={-height * 2} width={width * 5} height={height * 5} fill="#000000" opacity={darkness} listening={false} />
              <Ellipse
                x={x}
                y={y - radiusY * 1.65}
                radiusX={radiusX * 1.3}
                radiusY={Math.max(radiusY * 4.2, data.beamHeight * height * .52)}
                fillRadialGradientStartPoint={{ x: 0, y: 0 }}
                fillRadialGradientEndPoint={{ x: 0, y: 0 }}
                fillRadialGradientStartRadius={0}
                fillRadialGradientEndRadius={radiusX * 1.3}
                fillRadialGradientColorStops={[0, `rgba(255,255,255,${1 - feather * .25})`, .58, `rgba(255,255,255,${.9 - feather * .35})`, 1, "rgba(255,255,255,0)"]}
                globalCompositeOperation="destination-out"
                listening={false}
              />
            </Group>
          );
        }
        return (
          <Group x={x} y={y} offsetX={x} offsetY={y} scaleX={appearanceScale} scaleY={appearanceScale} opacity={temporalState.opacity}>
            <Line
              points={[x - radiusX * .28, top, x + radiusX * .28, top, x + radiusX * 1.12, y, x - radiusX * 1.12, y]}
              closed
              strokeEnabled={false}
              fillLinearGradientStartPoint={{ x, y: top }}
              fillLinearGradientEndPoint={{ x, y }}
              fillLinearGradientColorStops={[0, withAlpha(lightColor, .015), .42, withAlpha(lightColor, .055), .78, withAlpha(lightColor, .12), 1, withAlpha(lightColor, .2)]}
              shadowColor={lightColor}
              shadowBlur={Math.max(24, object.style.shadowBlur * 1.4)}
              shadowOpacity={Math.max(.35, object.style.shadowOpacity * .72)}
              listening={false}
            />
            <Line
              points={[x - radiusX * .1, top, x + radiusX * .1, top, x + radiusX * .58, y, x - radiusX * .58, y]}
              closed
              strokeEnabled={false}
              fillLinearGradientStartPoint={{ x, y: top }}
              fillLinearGradientEndPoint={{ x, y }}
              fillLinearGradientColorStops={[0, withAlpha(lightColor, 0), .45, withAlpha(lightColor, .07), .82, withAlpha(lightColor, .17), 1, withAlpha(lightColor, .28)]}
              shadowColor={lightColor}
              shadowBlur={Math.max(12, object.style.shadowBlur * .65)}
              shadowOpacity={.48}
              listening={false}
            />
            {base3d}
            <Ellipse x={x} y={y} radiusX={radiusX} radiusY={radiusY} fill="#ffffff01" />
          </Group>
        );
      }
      case "zoom": {
        const radius = data.radius * Math.min(width, height);
        return (
          <Ellipse
            x={data.center.x * width}
            y={data.center.y * height}
            radiusX={radius}
            radiusY={radius}
            fill="#ffffff01"
            stroke={selected ? "#a3ff12" : "#ffffff01"}
            strokeWidth={selected ? 1.5 : 1}
            dash={selected ? [5, 4] : []}
          />
        );
      }
      case "ellipse": {
        const x = data.center.x * width;
        const y = data.center.y * height;
        const radiusX = data.radiusX * width;
        const radiusY = data.radiusY * height;
        const faceColor = solidColor(object.style.stroke, "#a3ff12");
        const appearanceScale = animation.motion === "scaleIn" ? .35 + temporalState.entryProgress * .65 : 1;
        return (
          <Group x={x} y={y} offsetX={x} offsetY={y} scaleX={appearanceScale} scaleY={appearanceScale} opacity={temporalState.opacity}>
            <Ellipse
              x={x}
              y={y}
              radiusX={radiusX}
              radiusY={radiusY}
              fill={object.style.fill}
              stroke={faceColor}
              strokeWidth={object.style.strokeWidth}
              dash={object.style.dash}
              shadowColor={object.style.shadowColor}
              shadowBlur={effectiveShadow.blur}
              shadowOpacity={effectiveShadow.opacity}
              shadowOffsetX={effectiveShadow.offsetX}
              shadowOffsetY={effectiveShadow.offsetY}
            />
          </Group>
        );
      }
      case "rectangle": {
        const x = data.origin.x * width;
        const y = data.origin.y * height;
        const rectangleWidth = data.width * width;
        const rectangleHeight = data.height * height;
        if ((data.fillDesign ?? "solid") === "solid") return <Rect {...common} x={x} y={y} width={rectangleWidth} height={rectangleHeight} fill={object.style.fill} />;
        return renderPatternShape(
          [x, y, x + rectangleWidth, y, x + rectangleWidth, y + rectangleHeight, x, y + rectangleHeight],
          "striped",
          data.stripeColor,
          data.stripeSpacing,
          data.stripeAngle,
          data.stripeOpacity,
          "rectangle",
        );
      }
      case "arrow": {
        const fullPoints = flattenPoints(data.points, width, height);
        if (fullPoints.length < 4) return null;
        const points = partialPolylinePoints(fullPoints, drawProgress);
        if (object.style.strokeWidth <= 0) return null;
        const startX = points[0];
        const startY = points[1];
        const endX = points[points.length - 2];
        const endY = points[points.length - 1];
        const travelLength = Math.hypot(endX - startX, endY - startY);
        const faceColor = solidColor(object.style.stroke, "#65d9ff");
        const shadowColor = solidColor(object.style.shadowColor, "#000000");
        const pointerLength = Math.max(24, Math.min(52, travelLength * .12, object.style.strokeWidth * 5.2));
        const pointerWidth = Math.max(25, Math.min(58, travelLength * .135, object.style.strokeWidth * 5.6));
        const headPoints = arrowHeadPoints(points, pointerLength, pointerWidth);
        const shadowHeadPoints = offsetPoints(headPoints, effectiveShadow.offsetX, effectiveShadow.offsetY);
        const headDepth = Math.max(.35, object.style.strokeWidth * (.05 + groundHeight * .27));
        return (
          <Group opacity={temporalState.opacity}>
            <Line
              points={offsetPoints(points, effectiveShadow.offsetX, effectiveShadow.offsetY)}
              stroke={shadowColor}
              strokeWidth={object.style.strokeWidth + 2.2}
              dash={object.style.dash}
              opacity={effectiveShadow.opacity * .62}
              shadowColor={shadowColor}
              shadowBlur={Math.max(.5, effectiveShadow.blur)}
              shadowOpacity={effectiveShadow.opacity}
              lineCap="round"
              lineJoin="round"
              listening={false}
            />
            <Line points={shadowHeadPoints} closed fill={shadowColor} opacity={effectiveShadow.opacity * .62} shadowColor={shadowColor} shadowBlur={Math.max(.5, effectiveShadow.blur)} shadowOpacity={effectiveShadow.opacity} listening={false} />
            <Line
              points={offsetPoints(headPoints, 0, headDepth)}
              closed
              fill={shadeColor(faceColor, -86)}
              stroke={shadeColor(faceColor, -105)}
              strokeWidth={Math.max(.8, object.style.strokeWidth * .16)}
              listening={false}
            />
            <Line
              points={points}
              stroke={faceColor}
              strokeWidth={object.style.strokeWidth}
              strokeLinearGradientStartPoint={{ x: startX, y: startY }}
              strokeLinearGradientEndPoint={{ x: endX, y: endY }}
              strokeLinearGradientColorStops={[0, withAlpha(faceColor, .08), .1, withAlpha(faceColor, .78), .24, faceColor, 1, faceColor]}
              dash={object.style.dash}
              lineCap="round"
              lineJoin="round"
            />
            <Line
              points={headPoints}
              closed
              fill={faceColor}
              stroke={withAlpha(shadeColor(faceColor, 92), .75)}
              strokeWidth={Math.max(.7, object.style.strokeWidth * .13)}
              listening={false}
            />
            <Line
              points={points}
              strokeWidth={Math.max(.7, object.style.strokeWidth * .18)}
              strokeLinearGradientStartPoint={{ x: startX, y: startY }}
              strokeLinearGradientEndPoint={{ x: endX, y: endY }}
              strokeLinearGradientColorStops={[0, withAlpha("#ffffff", 0), .18, withAlpha("#ffffff", .58), 1, withAlpha("#ffffff", .72)]}
              lineCap="round"
              lineJoin="round"
              listening={false}
            />
          </Group>
        );
      }
      case "longBallArrow": {
        const start = { x: data.start.x * width, y: data.start.y * height };
        const end = { x: data.end.x * width, y: data.end.y * height };
        if (object.style.strokeWidth <= 0) return null;
        const control = data.control
          ? { x: data.control.x * width, y: data.control.y * height }
          : automaticLongBallControl(start, end, data.curveHeight, height);
        const renderScale = Math.max(.45, Math.min(3, Math.min(width / 960, height / 540)));
        const bodyWidth = object.style.strokeWidth * renderScale;
        const geometry = buildCurvedArrowGeometry({ start, control, end, bodyWidth, renderScale, progress: drawProgress });
        if (!geometry.polygon.length) return null;
        const groundControl = automaticLongBallControl(
          start,
          end,
          Math.min(.014, Math.max(.003, data.curveHeight * .06)),
          height,
        );
        const groundGeometry = buildCurvedArrowGeometry({
          start,
          control: groundControl,
          end,
          bodyWidth: bodyWidth * .9,
          renderScale,
          progress: drawProgress,
        });
        const faceColor = solidColor(object.style.stroke, "#65d9ff");
        const shadowColor = solidColor(object.style.shadowColor, "#000000");
        const travelLength = Math.hypot(end.x - start.x, end.y - start.y);
        const landingSize = data.landingZoneSize ?? 1;
        const landingColor = solidColor(data.landingZoneColor ?? faceColor, faceColor);
        const landingRadiusX = Math.max(34, Math.min(180, travelLength * .2)) * landingSize;
        const landingRadiusY = landingRadiusX * .28;
        const depth = Math.max(1.4 * renderScale, bodyWidth * (.22 + groundHeight * .32));
        const shadowX = (object.style.shadowOffsetX ?? 0) * .45;
        const shadowY = Math.max(1.5 * renderScale, (object.style.shadowOffsetY ?? 0) * .62);
        const shadowOpacity = Math.max(0, Math.min(.72, object.style.shadowOpacity * .58));
        const landingOpacity = Math.max(0, Math.min(1, (drawProgress - .78) / .22));
        const updatePoint = (key: "start" | "control" | "end", commit = false) => (event: Konva.KonvaEventObject<DragEvent>) => {
          event.cancelBubble = true;
          const point = {
            x: Math.max(0, Math.min(1, event.target.x() / width)),
            y: Math.max(0, Math.min(1, event.target.y() / height)),
          };
          const nextData = { ...data, [key]: point };
          if (commit) {
            onChange({ data: nextData });
            setLongBallPreviewData(null);
          } else {
            setLongBallPreviewData(nextData);
          }
        };
        return (
          <Group opacity={temporalState.opacity}>
            <Line
              points={offsetPoints(groundGeometry.polygon, shadowX, shadowY)}
              closed
              fill={shadowColor}
              stroke={shadowColor}
              strokeWidth={Math.max(.8 * renderScale, bodyWidth * .12)}
              opacity={shadowOpacity}
              shadowColor={shadowColor}
              shadowBlur={Math.max(3 * renderScale, (object.style.shadowBlur ?? 0) * .55)}
              shadowOpacity={shadowOpacity}
              lineJoin="round"
              listening={false}
            />
            {data.showLandingZone !== false && (
              <Ellipse
                x={end.x}
                y={end.y + depth * .45}
                radiusX={landingRadiusX}
                radiusY={landingRadiusY}
                fill={withAlpha(landingColor, .28 * landingOpacity)}
                shadowColor={landingColor}
                shadowBlur={Math.max(12, object.style.shadowBlur)}
                shadowOpacity={.48 * landingOpacity}
                listening={false}
              />
            )}
            <Line
              points={offsetPoints(geometry.polygon, 0, depth)}
              closed
              fill={shadeColor(faceColor, -105)}
              stroke={shadeColor(faceColor, -125)}
              strokeWidth={Math.max(.9 * renderScale, bodyWidth * .17)}
              lineJoin="round"
              listening={false}
            />
            <Line
              points={geometry.polygon}
              closed
              fillLinearGradientStartPoint={start}
              fillLinearGradientEndPoint={end}
              fillLinearGradientColorStops={[
                0, shadeColor(faceColor, -24),
                .34, faceColor,
                .72, shadeColor(faceColor, 28),
                1, faceColor,
              ]}
              stroke={shadeColor(faceColor, -105)}
              strokeWidth={Math.max(1.1 * renderScale, bodyWidth * .2)}
              lineJoin="round"
            />
            <Line
              points={geometry.highlight}
              stroke={withAlpha(shadeColor(faceColor, 105), .82)}
              strokeWidth={Math.max(.75 * renderScale, bodyWidth * .16)}
              lineCap="round"
              lineJoin="round"
              listening={false}
            />
            {selected && canEdit && renderMode !== "playerLabel" && (
              <Group name="selection-transformer">
                <Line points={[start.x, start.y, control.x, control.y, end.x, end.y]} stroke="#ffffff" strokeWidth={1} dash={[5, 5]} opacity={.62} listening={false} />
                {([
                  ["start", start, "#65d9ff"],
                  ["control", control, "#ffd34d"],
                  ["end", end, "#65d9ff"],
                ] as const).map(([key, point, color]) => (
                  <Circle
                    key={key}
                    x={point.x}
                    y={point.y}
                    radius={6.5 * renderScale}
                    fill={color}
                    stroke="#071018"
                    strokeWidth={2 * renderScale}
                    shadowColor="#000000"
                    shadowBlur={4 * renderScale}
                    shadowOpacity={.7}
                    draggable
                    onPointerDown={(event) => { event.cancelBubble = true; }}
                    onDragStart={(event) => { event.cancelBubble = true; }}
                    onDragMove={updatePoint(key)}
                    onDragEnd={updatePoint(key, true)}
                  />
                ))}
              </Group>
            )}
          </Group>
        );
      }
      case "line": {
        const fullSegments = anchoredLineSegments(data, playerTracks, allDrawings, currentTime, width, height, object.style.strokeWidth);
        if (!fullSegments.length || object.style.strokeWidth <= 0) return null;
        const segments = partialLineSegments(fullSegments, drawProgress);
        const design = data.lineDesign ?? "single";
        const primaryColor = solidColor(object.style.stroke, "#65d9ff");
        const shadowColor = solidColor(object.style.shadowColor, "#000000");
        const secondaryColor = solidColor(data.secondaryColor ?? "#ffffff", "#ffffff");
        const shadowX = effectiveShadow.offsetX;
        const shadowY = effectiveShadow.offsetY;
        return (
          <Group opacity={temporalState.opacity}>
            {segments.map((points, index) => {
              const startX = points[0];
              const startY = points[1];
              const endX = points[2];
              const endY = points[3];
              if (design === "single") return (
                <Group key={`line-single-${index}`}>
                  <Line points={offsetPoints(points, shadowX, shadowY)} stroke={shadowColor} strokeWidth={object.style.strokeWidth + 2.2} dash={object.style.dash} lineCap="round" lineJoin="round" opacity={effectiveShadow.opacity * .62} shadowColor={shadowColor} shadowBlur={Math.max(.5, effectiveShadow.blur)} shadowOpacity={effectiveShadow.opacity} listening={false} />
                  <Line points={points} stroke={primaryColor} strokeWidth={object.style.strokeWidth} dash={object.style.dash} lineCap="round" lineJoin="round" />
                  <Line points={offsetPoints(points, 0, -Math.max(.6, object.style.strokeWidth * .13))} stroke={withAlpha("#ffffff", .7)} strokeWidth={Math.max(.7, object.style.strokeWidth * .18)} dash={object.style.dash} lineCap="round" lineJoin="round" listening={false} />
                </Group>
              );
              if (design === "dual") {
                const deltaX = endX - startX;
                const deltaY = endY - startY;
                const lineLength = Math.max(1, Math.hypot(deltaX, deltaY));
                let normalX = -deltaY / lineLength;
                let normalY = deltaX / lineLength;
                if (normalY < 0 || (Math.abs(normalY) < .001 && normalX < 0)) { normalX *= -1; normalY *= -1; }
                const mainWidth = Math.max(object.style.strokeWidth + 3, object.style.strokeWidth * 1.65);
                const accentWidth = Math.max(1.15, object.style.strokeWidth * .32);
                const accentOffset = mainWidth / 2 - accentWidth * .15;
                return (
                  <Group key={`line-dual-${index}`}>
                    <Line points={offsetPoints(points, shadowX, shadowY)} stroke={shadowColor} strokeWidth={mainWidth + 2.2} dash={object.style.dash} lineCap="round" lineJoin="round" opacity={effectiveShadow.opacity * .62} shadowColor={shadowColor} shadowBlur={Math.max(.5, effectiveShadow.blur)} shadowOpacity={effectiveShadow.opacity} listening={false} />
                    <Line points={points} stroke={primaryColor} strokeWidth={mainWidth} dash={object.style.dash} lineCap="round" lineJoin="round" />
                    <Line points={offsetPoints(points, normalX * accentOffset, normalY * accentOffset)} stroke={secondaryColor} strokeWidth={accentWidth} dash={object.style.dash} lineCap="round" lineJoin="round" listening={false} />
                    <Line points={offsetPoints(points, -normalX * mainWidth * .2, -normalY * mainWidth * .2)} stroke={withAlpha("#ffffff", .48)} strokeWidth={Math.max(.7, object.style.strokeWidth * .14)} dash={object.style.dash} lineCap="round" lineJoin="round" listening={false} />
                  </Group>
                );
              }
              return (
                <Group key={`line-fade-${index}`}>
                  <Line points={offsetPoints(points, shadowX, shadowY)} stroke={shadowColor} strokeWidth={object.style.strokeWidth + 3.5} dash={object.style.dash} lineCap="round" lineJoin="round" opacity={effectiveShadow.opacity * .62} shadowColor={shadowColor} shadowBlur={Math.max(.5, effectiveShadow.blur)} shadowOpacity={effectiveShadow.opacity} listening={false} />
                  <Line points={points} strokeWidth={object.style.strokeWidth} dash={object.style.dash} lineCap="round" lineJoin="round" strokeLinearGradientStartPoint={{ x: startX, y: startY }} strokeLinearGradientEndPoint={{ x: endX, y: endY }} strokeLinearGradientColorStops={[0, withAlpha(primaryColor, 0), .14, withAlpha(primaryColor, .48), .28, primaryColor, .72, primaryColor, .86, withAlpha(primaryColor, .48), 1, withAlpha(primaryColor, 0)]} />
                  <Line points={offsetPoints(points, 0, -Math.max(.6, object.style.strokeWidth * .13))} strokeWidth={Math.max(.7, object.style.strokeWidth * .17)} dash={object.style.dash} lineCap="round" lineJoin="round" strokeLinearGradientStartPoint={{ x: startX, y: startY }} strokeLinearGradientEndPoint={{ x: endX, y: endY }} strokeLinearGradientColorStops={[0, withAlpha("#ffffff", 0), .2, withAlpha("#ffffff", .48), .5, withAlpha("#ffffff", .7), .8, withAlpha("#ffffff", .48), 1, withAlpha("#ffffff", 0)]} listening={false} />
                </Group>
              );
            })}
          </Group>
        );
      }
      case "glimpse": {
        const originX = data.origin.x * width;
        const originY = data.origin.y * height;
        const targetX = data.target.x * width;
        const targetY = data.target.y * height;
        const deltaX = targetX - originX;
        const deltaY = targetY - originY;
        const length = Math.max(12, Math.hypot(deltaX, deltaY));
        const rotation = Math.atan2(deltaY, deltaX) * 180 / Math.PI - data.spread / 2;
        const color = solidColor(object.style.stroke, "#ffffff");
        return (
          <Group opacity={temporalState.opacity}>
            <Arc
              x={originX}
              y={originY}
              innerRadius={0}
              outerRadius={length}
              angle={data.spread}
              rotation={rotation}
              fillRadialGradientStartPoint={{ x: 0, y: 0 }}
              fillRadialGradientEndPoint={{ x: 0, y: 0 }}
              fillRadialGradientStartRadius={0}
              fillRadialGradientEndRadius={length}
              fillRadialGradientColorStops={[0, withAlpha(color, .5), .18, withAlpha(color, .4), .62, withAlpha(color, .2), .88, withAlpha(color, .06), 1, withAlpha(color, 0)]}
              shadowColor={color}
              shadowBlur={Math.max(12, object.style.shadowBlur)}
              shadowOpacity={Math.max(.28, object.style.shadowOpacity * .65)}
              listening={false}
            />
            <Arc
              x={originX}
              y={originY}
              innerRadius={0}
              outerRadius={length * .96}
              angle={data.spread * .7}
              rotation={rotation + data.spread * .15}
              fillRadialGradientStartPoint={{ x: 0, y: 0 }}
              fillRadialGradientEndPoint={{ x: 0, y: 0 }}
              fillRadialGradientStartRadius={0}
              fillRadialGradientEndRadius={length * .96}
              fillRadialGradientColorStops={[0, withAlpha(color, .42), .45, withAlpha(color, .2), .82, withAlpha(color, .05), 1, withAlpha(color, 0)]}
            />
          </Group>
        );
      }
      case "triangle":
        return renderPatternShape(flattenPoints(data.points, width, height), data.fillDesign ?? "solid", data.stripeColor, data.stripeSpacing, data.stripeAngle, data.stripeOpacity, "triangle");
      case "polygon": {
        const points = flattenPoints(data.points, width, height);
        return renderPatternShape(points, data.zoneDesign ?? "solid", data.stripeColor, data.stripeSpacing, data.stripeAngle, data.stripeOpacity, "zone");
      }
      case "freeDraw":
        return <Line {...common} points={partialPolylinePoints(flattenPoints(data.points, width, height), drawProgress)} tension={0.35} />;
      case "text": {
        const x = data.origin.x * width;
        const y = data.origin.y * height;
        const fontSize = data.fontSize * height;
        const estimatedWidth = Math.max(fontSize, data.text.length * fontSize * .68);
        const clipText = (node: ReactNode) => (
          <Group
            opacity={temporalState.opacity}
            clipFunc={(context) => {
              context.beginPath();
              context.rect(x - 24, y - fontSize, (estimatedWidth + 54) * revealProgress, fontSize * 3.2);
              context.closePath();
            }}
          >
            {node}
          </Group>
        );
        if ((data.textDesign ?? "flat") === "flat") return clipText(
          <Text
            x={x}
            y={y}
            text={data.text}
            fontSize={fontSize}
            fontStyle="bold"
            fontFamily="Inter, Arial, sans-serif"
            fill={object.style.stroke}
            shadowColor={object.style.shadowColor}
            shadowBlur={object.style.shadowBlur}
            shadowOffsetX={object.style.shadowOffsetX}
            shadowOffsetY={object.style.shadowOffsetY}
            shadowOpacity={object.style.shadowOpacity}
          />,
        );
        const depth = data.groundDepth ?? 7;
        const faceColor = solidColor(object.style.stroke, "#ffffff");
        const depthColor = solidColor(object.style.shadowColor, "#000000");
        const tiltRadians = (data.groundTilt ?? -12) * Math.PI / 180;
        return clipText(
          <Group x={x} y={y} scaleY={.76} skewX={tiltRadians}>
            <Text
              x={depth + object.style.shadowOffsetX}
              y={depth + object.style.shadowOffsetY}
              text={data.text}
              fontSize={fontSize}
              fontStyle="bold italic"
              fontFamily="Inter, Arial, sans-serif"
              fill="#000000"
              opacity={.38}
              shadowColor="#000000"
              shadowBlur={Math.max(7, object.style.shadowBlur)}
              shadowOpacity={.72}
              listening={false}
            />
            {Array.from({ length: Math.max(2, Math.round(depth)) }, (_, index) => (
              <Text
                key={`text-depth-${index}`}
                x={depth - index}
                y={depth - index}
                text={data.text}
                fontSize={fontSize}
                fontStyle="bold italic"
                fontFamily="Inter, Arial, sans-serif"
                fill={shadeColor(depthColor, index * 3)}
                stroke="#000000"
                strokeWidth={Math.max(.5, fontSize * .018)}
                listening={false}
              />
            ))}
            <Text
              text={data.text}
              fontSize={fontSize}
              fontStyle="bold italic"
              fontFamily="Inter, Arial, sans-serif"
              fill={faceColor}
              stroke={shadeColor(faceColor, -115)}
              strokeWidth={Math.max(1, fontSize * .045)}
              shadowColor="#000000"
              shadowBlur={Math.max(3, object.style.shadowBlur * .35)}
              shadowOffsetX={Math.max(1, object.style.shadowOffsetX * .35)}
              shadowOffsetY={Math.max(1, object.style.shadowOffsetY * .35)}
              shadowOpacity={.78}
            />
            <Text
              x={-Math.max(.5, fontSize * .012)}
              y={-Math.max(.5, fontSize * .012)}
              text={data.text}
              fontSize={fontSize}
              fontStyle="bold italic"
              fontFamily="Inter, Arial, sans-serif"
              fill={withAlpha(shadeColor(faceColor, 105), .36)}
              listening={false}
            />
          </Group>
        );
      }
    }
  })();

  const followsTargetAsGroup = object.data.kind !== "ghost";
  const targetX = followsTargetAsGroup ? targetOffset.x : 0;
  const targetY = followsTargetAsGroup ? targetOffset.y : 0;

  const actionLabelNode = (() => {
    const label = object.actionLabel;
    if (renderMode === "playerLabel" || !label?.visible) return null;
    const position = Math.max(0, Math.min(1, label.position));
    let anchor: { x: number; y: number } | null = null;
    if ((object.data.kind === "line" || object.data.kind === "arrow") && object.data.points.length >= 2) {
      const actionPoints = object.data.kind === "line"
        ? anchoredLinePoints(object.data, playerTracks, currentTime)
        : object.data.points;
      const start = actionPoints[0];
      const end = actionPoints[actionPoints.length - 1];
      anchor = { x: (start.x + (end.x - start.x) * position) * width, y: (start.y + (end.y - start.y) * position) * height };
    } else if (object.data.kind === "longBallArrow") {
      const start = { x: object.data.start.x * width, y: object.data.start.y * height };
      const end = { x: object.data.end.x * width, y: object.data.end.y * height };
      const control = object.data.control
        ? { x: object.data.control.x * width, y: object.data.control.y * height }
        : automaticLongBallControl(start, end, object.data.curveHeight, height);
      anchor = quadraticPointAt(start, control, end, position);
    }
    if (!anchor) return null;
    const fontSize = Math.max(10, label.fontSize * height);
    const radius = Math.max(8, fontSize * .72);
    return (
      <Group x={anchor.x} y={anchor.y} opacity={temporalState.opacity} listening={false}>
        <Ellipse
          radiusX={radius}
          radiusY={radius}
          fill={label.backgroundColor}
          stroke={withAlpha(label.color, .82)}
          strokeWidth={Math.max(1, fontSize * .08)}
          shadowColor="#000000"
          shadowBlur={5}
          shadowOffsetY={2}
          shadowOpacity={.7}
        />
        <Text
          x={-radius}
          y={-fontSize * .56}
          width={radius * 2}
          height={fontSize * 1.15}
          align="center"
          verticalAlign="middle"
          text={label.value}
          fontSize={fontSize}
          fontStyle="bold"
          fontFamily="Inter, Arial, sans-serif"
          fill={label.color}
        />
      </Group>
    );
  })();

  return (
    <>
      <Group
        ref={nodeRef}
        id={object.id}
        listening={canEdit}
        x={(transform.x + targetX) * width}
        y={(transform.y + targetY) * height}
        rotation={object.data.kind === "ghost" ? 0 : transform.rotation}
        scaleX={object.data.kind === "ghost" ? 1 : transform.scaleX}
        scaleY={object.data.kind === "ghost" ? 1 : transform.scaleY}
        draggable={canEdit}
        onPointerDown={(event) => { event.cancelBubble = true; if (object.data.kind === "longBallArrow") setLongBallPreviewData(null); onSelect(); }}
        onClick={(event) => { event.cancelBubble = true; onSelect(); }}
        onTap={(event) => { event.cancelBubble = true; onSelect(); }}
        onDragMove={(event) => {
          if (object.data.kind !== "ghost") return;
          onTransformPreview?.({
            ...object.transform,
            x: event.target.x() / width - targetX,
            y: event.target.y() / height - targetY,
          });
        }}
        onDragEnd={(event) => {
          onChange({ transform: { ...object.transform, x: event.target.x() / width - targetX, y: event.target.y() / height - targetY } });
          onTransformPreview?.(undefined);
        }}
        onTransform={() => {
          const node = nodeRef.current;
          if (!node || object.data.kind !== "ghost") return;
          onTransformPreview?.({
            x: node.x() / width - targetX,
            y: node.y() / height - targetY,
            rotation: node.rotation(),
            scaleX: node.scaleX(),
            scaleY: node.scaleY(),
          });
        }}
        onTransformEnd={() => {
          const node = nodeRef.current;
          if (!node) return;
          onChange({
            transform: {
              x: node.x() / width - targetX,
              y: node.y() / height - targetY,
              rotation: node.rotation(),
              scaleX: node.scaleX(),
              scaleY: node.scaleY(),
            },
          });
          onTransformPreview?.(undefined);
        }}
      >
        {content}
        {actionLabelNode}
      </Group>
      {selected && canEdit && (
        <Transformer
          ref={transformerRef}
          name="selection-transformer"
          rotateEnabled={object.data.kind !== "ghost" && object.data.kind !== "longBallArrow"}
          resizeEnabled={object.data.kind !== "ghost" && object.data.kind !== "longBallArrow"}
          flipEnabled={false}
          borderStroke="#ffffff"
          borderDash={[4, 4]}
          anchorFill="#a3ff12"
          anchorStroke="#10130d"
          anchorSize={9}
          rotateAnchorOffset={22}
          boundBoxFunc={(oldBox, newBox) => newBox.width < 8 || newBox.height < 8 ? oldBox : newBox}
        />
      )}
    </>
  );
}
