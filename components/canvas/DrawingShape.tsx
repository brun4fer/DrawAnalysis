"use client";

import { useEffect, useRef } from "react";
import Konva from "konva";
import { Arc, Arrow, Ellipse, Group, Line, Rect, Text, Transformer } from "react-konva";
import type { DrawingData, DrawingObject, ObjectTransform, PlayerTrack, Point } from "@/types/drawing";
import { flattenPoints } from "@/utils/coordinates";
import { samplePlayerTrackAtTime } from "@/utils/playerTracking";
import { getObjectStateAtTime } from "@/utils/temporalRenderer";

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
  targetOffset?: Point;
  playerTracks?: PlayerTrack[];
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

function quadraticCurvePoints(start: { x: number; y: number }, end: { x: number; y: number }, curveHeight: number, height: number) {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const distance = Math.max(1, Math.hypot(deltaX, deltaY));
  let normalX = -deltaY / distance;
  let normalY = deltaX / distance;
  // Keep the arc on the visually upper side of the pass while still making
  // it perpendicular to the direction. This avoids loops and extreme bends
  // when start/end positions are close, vertical or reversed.
  if (normalY > 0 || (Math.abs(normalY) < .001 && normalX > 0)) {
    normalX *= -1;
    normalY *= -1;
  }
  const arcHeight = Math.min(curveHeight * height * 1.6, distance * .68);
  const control = {
    x: (start.x + end.x) / 2 + normalX * arcHeight,
    y: (start.y + end.y) / 2 + normalY * arcHeight,
  };
  return Array.from({ length: 41 }, (_, index) => {
    const t = index / 40;
    const inverse = 1 - t;
    return {
      x: inverse * inverse * start.x + 2 * inverse * t * control.x + t * t * end.x,
      y: inverse * inverse * start.y + 2 * inverse * t * control.y + t * t * end.y,
    };
  }).flatMap(({ x, y }) => [x, y]);
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
  const start = resolve(data.startTarget);
  const end = resolve(data.endTarget);
  if (start) points[0] = start;
  if (end) points[points.length - 1] = end;
  return points;
}

export function DrawingShape({ object, width, height, currentTime, selected, canEdit, onSelect, onChange, renderMode = "all", targetOffset = { x: 0, y: 0 }, playerTracks, onTransformPreview }: Props) {
  const nodeRef = useRef<Konva.Group>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const temporalState = getObjectStateAtTime(object, currentTime);
  const transform = temporalState.transform;

  useEffect(() => {
    if (selected && transformerRef.current && nodeRef.current) {
      transformerRef.current.nodes([nodeRef.current]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [selected]);

  const common = {
    stroke: object.style.stroke,
    strokeWidth: object.style.strokeWidth,
    opacity: temporalState.opacity,
    dash: object.style.dash,
    lineCap: "round" as const,
    lineJoin: "round" as const,
    shadowColor: object.style.shadowColor ?? "#000000",
    shadowBlur: object.style.shadowBlur ?? 0,
    shadowOpacity: object.style.shadowOpacity ?? 0,
    shadowOffsetX: object.style.shadowOffsetX ?? 0,
    shadowOffsetY: object.style.shadowOffsetY ?? 0,
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
    const data = object.data;
    if (renderMode === "playerLabel" && data.kind !== "playerRing") return null;
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
            <Group opacity={temporalState.opacity}>
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
        const baseDepth = Math.max(2, Math.min(8, radiusY * .22 + object.style.strokeWidth * .28));
        const base3d = (
          <Group listening={false}>
            <Ellipse
              x={x + object.style.shadowOffsetX}
              y={y + baseDepth * 1.8 + object.style.shadowOffsetY}
              radiusX={radiusX * 1.12}
              radiusY={radiusY * .92}
              fill={withAlpha(object.style.shadowColor || "#000000", Math.max(.12, object.style.shadowOpacity * .38))}
              shadowColor={object.style.shadowColor || "#000000"}
              shadowBlur={Math.max(12, object.style.shadowBlur)}
              shadowOpacity={Math.max(.32, object.style.shadowOpacity)}
            />
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
              <Ellipse
                x={x}
                y={y}
                radiusX={radiusX * 1.12}
                radiusY={radiusY * 1.25}
                fillRadialGradientStartPoint={{ x: 0, y: 0 }}
                fillRadialGradientEndPoint={{ x: 0, y: 0 }}
                fillRadialGradientStartRadius={0}
                fillRadialGradientEndRadius={radiusX * 1.12}
                fillRadialGradientColorStops={[0, withAlpha(lightColor, .42), .55, withAlpha(lightColor, .16), 1, withAlpha(lightColor, 0)]}
                shadowColor={lightColor}
                shadowBlur={Math.max(18, object.style.shadowBlur)}
                shadowOpacity={.65}
                listening={false}
              />
              {base3d}
            </Group>
          );
        }
        return (
          <Group opacity={temporalState.opacity}>
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
        const depth = Math.max(1.5, Math.min(radiusY * .24, 2 + object.style.strokeWidth * .6));
        return (
          <Group opacity={temporalState.opacity}>
            <Ellipse
              x={x + object.style.shadowOffsetX}
              y={y + depth + object.style.shadowOffsetY}
              radiusX={radiusX * 1.04}
              radiusY={radiusY * .9}
              fill="#000000"
              opacity={Math.max(.12, object.style.shadowOpacity * .42)}
              shadowColor={object.style.shadowColor}
              shadowBlur={Math.max(8, object.style.shadowBlur)}
              shadowOpacity={Math.max(.45, object.style.shadowOpacity)}
              listening={false}
            />
            <Ellipse
              x={x}
              y={y + depth}
              radiusX={radiusX}
              radiusY={radiusY}
              fill={shadeColor(faceColor, -90)}
              stroke={shadeColor(faceColor, -110)}
              strokeWidth={object.style.strokeWidth * .55}
              listening={false}
            />
            <Ellipse
              {...common}
              opacity={1}
              x={x}
              y={y}
              radiusX={radiusX}
              radiusY={radiusY}
              fill={object.style.fill}
              shadowColor={object.style.shadowColor}
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
        const points = flattenPoints(data.points, width, height);
        if (points.length < 4) return null;
        if (object.style.strokeWidth <= 0) return null;
        const startX = points[0];
        const startY = points[1];
        const endX = points[points.length - 2];
        const endY = points[points.length - 1];
        const faceColor = solidColor(object.style.stroke, "#65d9ff");
        const shadowColor = solidColor(object.style.shadowColor, "#000000");
        const pointerLength = Math.max(16, object.style.strokeWidth * 3.15);
        const pointerWidth = Math.max(17, object.style.strokeWidth * 3.35);
        return (
          <Group opacity={temporalState.opacity}>
            <Arrow
              points={offsetPoints(points, object.style.shadowOffsetX, object.style.shadowOffsetY)}
              stroke={shadowColor}
              fill={shadowColor}
              strokeWidth={object.style.strokeWidth + 2.2}
              dash={object.style.dash}
              pointerLength={pointerLength + 2}
              pointerWidth={pointerWidth + 3}
              opacity={object.style.shadowOpacity * .62}
              shadowColor={shadowColor}
              shadowBlur={Math.max(8, object.style.shadowBlur)}
              shadowOpacity={object.style.shadowOpacity}
              lineCap="round"
              lineJoin="round"
              listening={false}
            />
            <Arrow
              points={points}
              stroke={faceColor}
              fill={faceColor}
              strokeWidth={object.style.strokeWidth}
              strokeLinearGradientStartPoint={{ x: startX, y: startY }}
              strokeLinearGradientEndPoint={{ x: endX, y: endY }}
              strokeLinearGradientColorStops={[0, withAlpha(faceColor, .08), .1, withAlpha(faceColor, .78), .24, faceColor, 1, faceColor]}
              dash={object.style.dash}
              pointerLength={pointerLength}
              pointerWidth={pointerWidth}
              lineCap="round"
              lineJoin="round"
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
        const points = quadraticCurvePoints(start, end, data.curveHeight, height);
        const groundShadowPoints = quadraticCurvePoints(start, end, Math.min(.014, Math.max(.003, data.curveHeight * .055)), height);
        const faceColor = solidColor(object.style.stroke, "#65d9ff");
        const shadowColor = solidColor(object.style.shadowColor, "#000000");
        const pointerLength = Math.max(13, object.style.strokeWidth * 2.8);
        const pointerWidth = Math.max(14, object.style.strokeWidth * 3);
        const groundOffsetX = object.style.shadowOffsetX * .45;
        const groundOffsetY = Math.max(2, object.style.shadowOffsetY * .55);
        const landingSize = data.landingZoneSize ?? 1;
        const landingColor = solidColor(data.landingZoneColor ?? faceColor, faceColor);
        const travelLength = Math.hypot(end.x - start.x, end.y - start.y);
        const landingRadiusX = Math.max(34, Math.min(180, travelLength * .2)) * landingSize;
        const landingRadiusY = landingRadiusX * .28;
        return (
          <Group opacity={temporalState.opacity}>
            {data.showLandingZone !== false && (
              <Ellipse
                x={end.x}
                y={end.y + groundOffsetY}
                radiusX={landingRadiusX}
                radiusY={landingRadiusY}
                fill={withAlpha(landingColor, .28)}
                shadowColor={landingColor}
                shadowBlur={Math.max(12, object.style.shadowBlur)}
                shadowOpacity={.48}
                listening={false}
              />
            )}
            <Arrow
              points={offsetPoints(groundShadowPoints, groundOffsetX, groundOffsetY)}
              stroke={shadowColor}
              fill={shadowColor}
              strokeWidth={object.style.strokeWidth + 2.5}
              dash={object.style.dash}
              pointerLength={pointerLength + 2}
              pointerWidth={pointerWidth + 3}
              opacity={object.style.shadowOpacity * .52}
              shadowColor={shadowColor}
              shadowBlur={Math.max(10, object.style.shadowBlur * 1.15)}
              shadowOpacity={.72}
              lineCap="round"
              lineJoin="round"
              listening={false}
            />
            <Ellipse
              x={start.x + groundOffsetX}
              y={start.y + groundOffsetY}
              radiusX={Math.max(7, object.style.strokeWidth * 1.8)}
              radiusY={Math.max(2, object.style.strokeWidth * .48)}
              fill={shadowColor}
              opacity={object.style.shadowOpacity * .34}
              shadowColor={shadowColor}
              shadowBlur={Math.max(7, object.style.shadowBlur * .8)}
              shadowOpacity={.7}
              listening={false}
            />
            <Arrow
              points={points}
              stroke={faceColor}
              fill={faceColor}
              strokeWidth={object.style.strokeWidth}
              strokeLinearGradientStartPoint={start}
              strokeLinearGradientEndPoint={end}
              strokeLinearGradientColorStops={[0, withAlpha(faceColor, .12), .1, withAlpha(faceColor, .82), .24, faceColor, 1, faceColor]}
              dash={object.style.dash}
              pointerLength={pointerLength}
              pointerWidth={pointerWidth}
              lineCap="round"
              lineJoin="round"
            />
            <Line
              points={offsetPoints(points, 0, -Math.max(.8, object.style.strokeWidth * .16))}
              stroke={withAlpha(shadeColor(faceColor, 92), .78)}
              strokeWidth={Math.max(.8, object.style.strokeWidth * .24)}
              lineCap="round"
              lineJoin="round"
              listening={false}
            />
          </Group>
        );
      }
      case "line": {
        const points = flattenPoints(anchoredLinePoints(data, playerTracks, currentTime), width, height);
        if (points.length < 4 || object.style.strokeWidth <= 0) return null;
        const design = data.lineDesign ?? "single";
        const primaryColor = solidColor(object.style.stroke, "#65d9ff");
        const shadowColor = solidColor(object.style.shadowColor, "#000000");
        const secondaryColor = solidColor(data.secondaryColor ?? "#ffffff", "#ffffff");
        const startX = points[0];
        const startY = points[1];
        const endX = points[points.length - 2];
        const endY = points[points.length - 1];
        const shadowX = object.style.shadowOffsetX || 4;
        const shadowY = object.style.shadowOffsetY || 7;

        if (design === "single") {
          return (
            <Group opacity={temporalState.opacity}>
              <Line
                points={offsetPoints(points, shadowX, shadowY)}
                stroke={shadowColor}
                strokeWidth={object.style.strokeWidth + 2.2}
                dash={object.style.dash}
                lineCap="round"
                lineJoin="round"
                opacity={object.style.shadowOpacity * .62}
                shadowColor={shadowColor}
                shadowBlur={Math.max(8, object.style.shadowBlur)}
                shadowOpacity={object.style.shadowOpacity}
                listening={false}
              />
              <Line
                points={points}
                stroke={primaryColor}
                strokeWidth={object.style.strokeWidth}
                dash={object.style.dash}
                lineCap="round"
                lineJoin="round"
              />
              <Line
                points={offsetPoints(points, 0, -Math.max(.6, object.style.strokeWidth * .13))}
                stroke={withAlpha("#ffffff", .7)}
                strokeWidth={Math.max(.7, object.style.strokeWidth * .18)}
                dash={object.style.dash}
                lineCap="round"
                lineJoin="round"
                listening={false}
              />
            </Group>
          );
        }

        if (design === "dual") {
          const deltaX = endX - startX;
          const deltaY = endY - startY;
          const lineLength = Math.max(1, Math.hypot(deltaX, deltaY));
          let normalX = -deltaY / lineLength;
          let normalY = deltaX / lineLength;
          if (normalY < 0 || (Math.abs(normalY) < .001 && normalX < 0)) {
            normalX *= -1;
            normalY *= -1;
          }
          const mainWidth = Math.max(object.style.strokeWidth + 3, object.style.strokeWidth * 1.65);
          const accentWidth = Math.max(1.15, object.style.strokeWidth * .32);
          const accentOffset = mainWidth / 2 - accentWidth * .15;
          const accentPoints = offsetPoints(points, normalX * accentOffset, normalY * accentOffset);
          return (
            <Group opacity={temporalState.opacity}>
              <Line
                points={offsetPoints(points, shadowX, shadowY)}
                stroke={shadowColor}
                strokeWidth={mainWidth + 2.2}
                dash={object.style.dash}
                lineCap="round"
                lineJoin="round"
                opacity={object.style.shadowOpacity * .62}
                shadowColor={shadowColor}
                shadowBlur={Math.max(8, object.style.shadowBlur)}
                shadowOpacity={object.style.shadowOpacity}
                listening={false}
              />
              <Line
                points={points}
                stroke={primaryColor}
                strokeWidth={mainWidth}
                dash={object.style.dash}
                lineCap="round"
                lineJoin="round"
              />
              <Line
                points={accentPoints}
                stroke={secondaryColor}
                strokeWidth={accentWidth}
                dash={object.style.dash}
                lineCap="round"
                lineJoin="round"
                listening={false}
              />
              <Line
                points={offsetPoints(points, -normalX * mainWidth * .2, -normalY * mainWidth * .2)}
                stroke={withAlpha("#ffffff", .48)}
                strokeWidth={Math.max(.7, object.style.strokeWidth * .14)}
                dash={object.style.dash}
                lineCap="round"
                lineJoin="round"
                listening={false}
              />
            </Group>
          );
        }

        return (
          <Group opacity={temporalState.opacity}>
            <Line
              points={offsetPoints(points, shadowX, shadowY)}
              stroke={shadowColor}
              strokeWidth={object.style.strokeWidth + 3.5}
              dash={object.style.dash}
              lineCap="round"
              lineJoin="round"
              opacity={object.style.shadowOpacity * .62}
              shadowColor={shadowColor}
              shadowBlur={Math.max(9, object.style.shadowBlur)}
              shadowOpacity={object.style.shadowOpacity}
              listening={false}
            />
            <Line
              points={points}
              strokeWidth={object.style.strokeWidth}
              dash={object.style.dash}
              lineCap="round"
              lineJoin="round"
              strokeLinearGradientStartPoint={{ x: startX, y: startY }}
              strokeLinearGradientEndPoint={{ x: endX, y: endY }}
              strokeLinearGradientColorStops={[0, withAlpha(primaryColor, 0), .14, withAlpha(primaryColor, .48), .28, primaryColor, .72, primaryColor, .86, withAlpha(primaryColor, .48), 1, withAlpha(primaryColor, 0)]}
            />
            <Line
              points={offsetPoints(points, 0, -Math.max(.6, object.style.strokeWidth * .13))}
              strokeWidth={Math.max(.7, object.style.strokeWidth * .17)}
              dash={object.style.dash}
              lineCap="round"
              lineJoin="round"
              strokeLinearGradientStartPoint={{ x: startX, y: startY }}
              strokeLinearGradientEndPoint={{ x: endX, y: endY }}
              strokeLinearGradientColorStops={[0, withAlpha("#ffffff", 0), .2, withAlpha("#ffffff", .48), .5, withAlpha("#ffffff", .7), .8, withAlpha("#ffffff", .48), 1, withAlpha("#ffffff", 0)]}
              listening={false}
            />
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
            <Ellipse x={originX} y={originY} radiusX={3.5} radiusY={3.5} fill={withAlpha(color, .86)} shadowColor={color} shadowBlur={8} shadowOpacity={.7} listening={false} />
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
        return <Line {...common} points={flattenPoints(data.points, width, height)} tension={0.35} />;
      case "text": {
        const x = data.origin.x * width;
        const y = data.origin.y * height;
        const fontSize = data.fontSize * height;
        if ((data.textDesign ?? "flat") === "flat") return <Text x={x} y={y} text={data.text} fontSize={fontSize} fontStyle="bold" fontFamily="Inter" fill={object.style.stroke} opacity={temporalState.opacity} />;
        const depth = data.groundDepth ?? 7;
        const faceColor = solidColor(object.style.stroke, "#ffffff");
        const depthColor = solidColor(object.style.shadowColor, "#000000");
        const tiltRadians = (data.groundTilt ?? -12) * Math.PI / 180;
        return (
          <Group x={x} y={y} scaleY={.76} skewX={tiltRadians} opacity={temporalState.opacity}>
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
                listening={false}
              />
            ))}
            <Text
              text={data.text}
              fontSize={fontSize}
              fontStyle="bold italic"
              fontFamily="Inter, Arial, sans-serif"
              fill={faceColor}
              shadowColor="#000000"
              shadowBlur={2}
              shadowOffsetX={1}
              shadowOffsetY={1}
              shadowOpacity={.62}
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
      const curve = quadraticCurvePoints(
        { x: object.data.start.x * width, y: object.data.start.y * height },
        { x: object.data.end.x * width, y: object.data.end.y * height },
        object.data.curveHeight,
        height,
      );
      const index = Math.min(curve.length / 2 - 1, Math.round(position * (curve.length / 2 - 1)));
      anchor = { x: curve[index * 2], y: curve[index * 2 + 1] };
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
        onPointerDown={(event) => { event.cancelBubble = true; onSelect(); }}
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
          rotateEnabled={object.data.kind !== "ghost"}
          resizeEnabled={object.data.kind !== "ghost"}
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
