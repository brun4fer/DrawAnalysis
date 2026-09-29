"use client";

import { useEffect, useRef } from "react";
import Konva from "konva";
import { Arc, Arrow, Ellipse, Group, Line, Rect, Text, Transformer } from "react-konva";
import type { DrawingObject } from "@/types/drawing";
import { flattenPoints } from "@/utils/coordinates";
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

export function DrawingShape({ object, width, height, currentTime, selected, canEdit, onSelect, onChange }: Props) {
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

  const content = (() => {
    const data = object.data;
    switch (data.kind) {
      case "playerRing": {
        const x = data.center.x * width;
        const y = data.center.y * height;
        const radiusX = data.radiusX * width;
        const radiusY = data.radiusY * height;
        const primaryColor = solidColor(object.style.stroke, "#f7f8f2");
        const secondaryColor = solidColor(object.style.fill, "#1454c4");
        const glowColor = solidColor(object.style.shadowColor, "#f1e72b");
        const glowStrength = object.style.shadowOpacity;
        const outerBand = Math.min(.34, .17 + object.style.strokeWidth * .018);
        const outerInnerRadius = radiusX * (1 - outerBand);
        const innerOuterRadius = radiusX * .62;
        const innerInnerRadius = radiusX * Math.max(.35, .48 - object.style.strokeWidth * .008);
        const depthOffset = Math.max(2.5, radiusY * .24);
        const occlusionPixels = (data.occlusionWidth ?? data.radiusX * .22) * width;
        const makeSegments = (ringRadius: number) => {
          const ratio = Math.min(.82, occlusionPixels / Math.max(1, ringRadius * 2));
          const gapAngle = Math.max(8, Math.min(25, Math.asin(ratio) * 2 * 180 / Math.PI));
          return Array.from({ length: 8 }, (_, slot) => {
            const center = -90 + slot * 45;
            if (slot !== 0) return [{ slot, start: center - 16, angle: 32 }];
            const partAngle = Math.max(4, 16 - gapAngle / 2);
            return [
              { slot, start: center - 16, angle: partAngle },
              { slot, start: center + gapAngle / 2, angle: partAngle },
            ];
          }).flat();
        };
        const outerSegments = makeSegments(radiusX);
        const innerSegments = makeSegments(innerOuterRadius);
        return (
          <Group opacity={temporalState.opacity}>
            <Ellipse
              x={x - radiusX * .28 + object.style.shadowOffsetX}
              y={y + radiusY * .2 + object.style.shadowOffsetY}
              radiusX={radiusX * .72}
              radiusY={radiusY * .25}
              rotation={-8}
              fill="#000000"
              opacity={.46 * object.style.shadowOpacity}
              shadowColor="#000000"
              shadowBlur={Math.max(4, object.style.shadowBlur * .38)}
              shadowOpacity={.7}
              listening={false}
            />
            <Ellipse
              x={x}
              y={y}
              radiusX={radiusX * 1.12}
              radiusY={radiusY * 1.15}
              fillRadialGradientStartPoint={{ x: 0, y: 0 }}
              fillRadialGradientEndPoint={{ x: 0, y: 0 }}
              fillRadialGradientStartRadius={0}
              fillRadialGradientEndRadius={radiusX * 1.14}
              fillRadialGradientColorStops={[0, withAlpha(glowColor, .32 * glowStrength), .48, withAlpha(glowColor, .2 * glowStrength), 1, withAlpha(glowColor, 0)]}
              shadowColor={glowColor}
              shadowBlur={object.style.shadowBlur}
              shadowOpacity={object.style.shadowOpacity * .75}
              listening={false}
            />
            <Ellipse
              x={x}
              y={y + radiusY * .03}
              radiusX={radiusX * .18}
              radiusY={radiusY * .18}
              fill="#000000"
              opacity={.42}
              shadowColor="#000000"
              shadowBlur={Math.max(3, object.style.shadowBlur * .22)}
              shadowOpacity={.65}
              listening={false}
            />
            <Group x={x} y={y + depthOffset} scaleY={radiusY / radiusX} listening={false}>
              {outerSegments.map((segment, index) => {
                const segmentColor = segment.slot % 2 === 0 ? primaryColor : secondaryColor;
                return (
                  <Arc
                    key={`outer-depth-${index}`}
                    innerRadius={outerInnerRadius}
                    outerRadius={radiusX}
                    angle={segment.angle}
                    rotation={segment.start}
                    fill={shadeColor(segmentColor, -72)}
                    stroke={shadeColor(segmentColor, -105)}
                    strokeWidth={1.2}
                    shadowColor="#000000"
                    shadowBlur={5}
                    shadowOffsetY={3}
                    shadowOpacity={.65}
                  />
                );
              })}
              {innerSegments.map((segment, index) => {
                const segmentColor = segment.slot % 2 === 0 ? secondaryColor : primaryColor;
                return <Arc key={`inner-depth-${index}`} innerRadius={innerInnerRadius} outerRadius={innerOuterRadius} angle={segment.angle} rotation={segment.start} fill={shadeColor(segmentColor, -78)} stroke={shadeColor(segmentColor, -110)} strokeWidth={1} />;
              })}
            </Group>
            <Group x={x} y={y} scaleY={radiusY / radiusX}>
              {outerSegments.map((segment, index) => {
                const segmentColor = segment.slot % 2 === 0 ? primaryColor : secondaryColor;
                return (
                  <Arc
                    key={`outer-face-${index}`}
                    innerRadius={outerInnerRadius}
                    outerRadius={radiusX}
                    angle={segment.angle}
                    rotation={segment.start}
                    fillLinearGradientStartPoint={{ x: 0, y: -radiusX }}
                    fillLinearGradientEndPoint={{ x: 0, y: radiusX }}
                    fillLinearGradientColorStops={[0, shadeColor(segmentColor, 52), .36, shadeColor(segmentColor, 18), .7, segmentColor, 1, shadeColor(segmentColor, -42)]}
                    stroke={shadeColor(segmentColor, index % 2 === 0 ? -25 : 28)}
                    strokeWidth={Math.max(.8, object.style.strokeWidth * .18)}
                    shadowColor="#000000"
                    shadowBlur={3}
                    shadowOffsetY={2}
                    shadowOpacity={.45}
                  />
                );
              })}
              {innerSegments.map((segment, index) => {
                const segmentColor = segment.slot % 2 === 0 ? secondaryColor : primaryColor;
                return (
                  <Arc
                    key={`inner-face-${index}`}
                    innerRadius={innerInnerRadius}
                    outerRadius={innerOuterRadius}
                    angle={segment.angle}
                    rotation={segment.start}
                    fillLinearGradientStartPoint={{ x: 0, y: -innerOuterRadius }}
                    fillLinearGradientEndPoint={{ x: 0, y: innerOuterRadius }}
                    fillLinearGradientColorStops={[0, shadeColor(segmentColor, 48), .38, shadeColor(segmentColor, 14), .72, segmentColor, 1, shadeColor(segmentColor, -38)]}
                    stroke={shadeColor(segmentColor, segment.slot % 2 === 0 ? 24 : -24)}
                    strokeWidth={Math.max(.7, object.style.strokeWidth * .14)}
                    shadowColor="#000000"
                    shadowBlur={2}
                    shadowOffsetY={1.5}
                    shadowOpacity={.42}
                  />
                );
              })}
            </Group>
            <Ellipse x={x} y={y} radiusX={radiusX} radiusY={radiusY} fill="#00000001" />
          </Group>
        );
      }
      case "spotlight": {
        const x = data.target.x * width;
        const y = data.target.y * height;
        const radiusX = data.radiusX * width;
        const radiusY = data.radiusY * height;
        const top = y - data.beamHeight * height;
        return (
          <Group>
            <Line
              points={[x - radiusX * .18, top, x + radiusX * .18, top, x + radiusX, y, x - radiusX, y]}
              closed
              strokeEnabled={false}
              fillLinearGradientStartPoint={{ x, y: top }}
              fillLinearGradientEndPoint={{ x, y }}
              fillLinearGradientColorStops={[0, withAlpha(object.style.stroke, 0), .55, withAlpha(object.style.stroke, .08), 1, withAlpha(object.style.stroke, .28)]}
              opacity={temporalState.opacity}
              listening={false}
            />
            <Ellipse
              {...common}
              x={x}
              y={y}
              radiusX={radiusX}
              radiusY={radiusY}
              stroke={withAlpha(object.style.stroke, .7)}
              fillRadialGradientStartPoint={{ x: 0, y: 0 }}
              fillRadialGradientEndPoint={{ x: 0, y: 0 }}
              fillRadialGradientStartRadius={0}
              fillRadialGradientEndRadius={radiusX}
              fillRadialGradientColorStops={[0, withAlpha(object.style.stroke, .34), .58, withAlpha(object.style.stroke, .16), 1, withAlpha(object.style.stroke, 0)]}
            />
          </Group>
        );
      }
      case "ellipse":
        return <Ellipse {...common} x={data.center.x * width} y={data.center.y * height} radiusX={data.radiusX * width} radiusY={data.radiusY * height} fill={object.style.fill} />;
      case "rectangle":
        return <Rect {...common} x={data.origin.x * width} y={data.origin.y * height} width={data.width * width} height={data.height * height} fill={object.style.fill} />;
      case "arrow":
        return <Arrow {...common} points={flattenPoints(data.points, width, height)} fill={object.style.stroke} pointerLength={12} pointerWidth={12} />;
      case "line":
        return <Line {...common} points={flattenPoints(data.points, width, height)} />;
      case "triangle":
      case "polygon":
        return <Line {...common} points={flattenPoints(data.points, width, height)} closed fill={object.style.fill} />;
      case "freeDraw":
        return <Line {...common} points={flattenPoints(data.points, width, height)} tension={0.35} />;
      case "text":
        return <Text x={data.origin.x * width} y={data.origin.y * height} text={data.text} fontSize={data.fontSize * height} fontStyle="bold" fontFamily="Inter" fill={object.style.stroke} opacity={temporalState.opacity} />;
    }
  })();

  return (
    <>
      <Group
        ref={nodeRef}
        id={object.id}
        listening={canEdit}
        x={transform.x * width}
        y={transform.y * height}
        rotation={transform.rotation}
        scaleX={transform.scaleX}
        scaleY={transform.scaleY}
        draggable={canEdit}
        onPointerDown={(event) => { event.cancelBubble = true; onSelect(); }}
        onClick={(event) => { event.cancelBubble = true; onSelect(); }}
        onTap={(event) => { event.cancelBubble = true; onSelect(); }}
        onDragEnd={(event) => onChange({
          transform: { ...object.transform, x: event.target.x() / width, y: event.target.y() / height },
        })}
        onTransformEnd={() => {
          const node = nodeRef.current;
          if (!node) return;
          onChange({
            transform: {
              x: node.x() / width,
              y: node.y() / height,
              rotation: node.rotation(),
              scaleX: node.scaleX(),
              scaleY: node.scaleY(),
            },
          });
        }}
      >
        {content}
      </Group>
      {selected && canEdit && (
        <Transformer
          ref={transformerRef}
          name="selection-transformer"
          rotateEnabled
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
