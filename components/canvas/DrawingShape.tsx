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
        const bandRatio = Math.min(.5, .22 + object.style.strokeWidth * .025);
        const innerRadius = radiusX * (1 - bandRatio);
        return (
          <Group opacity={temporalState.opacity}>
            <Ellipse
              x={x + object.style.shadowOffsetX}
              y={y + radiusY * .42 + object.style.shadowOffsetY}
              radiusX={radiusX * 1.03}
              radiusY={radiusY * .72}
              fill="#000000"
              opacity={.3 * object.style.shadowOpacity}
              shadowColor="#000000"
              shadowBlur={Math.max(2, object.style.shadowBlur * .25)}
              shadowOpacity={.45}
              listening={false}
            />
            <Ellipse
              x={x}
              y={y}
              radiusX={radiusX * 1.14}
              radiusY={radiusY * 1.25}
              fillRadialGradientStartPoint={{ x: 0, y: 0 }}
              fillRadialGradientEndPoint={{ x: 0, y: 0 }}
              fillRadialGradientStartRadius={0}
              fillRadialGradientEndRadius={radiusX * 1.14}
              fillRadialGradientColorStops={[0, withAlpha(glowColor, .5 * glowStrength), .46, withAlpha(glowColor, .3 * glowStrength), 1, withAlpha(glowColor, 0)]}
              shadowColor={glowColor}
              shadowBlur={object.style.shadowBlur}
              shadowOpacity={object.style.shadowOpacity * .75}
              listening={false}
            />
            <Ellipse
              x={x}
              y={y}
              radiusX={innerRadius * .98}
              radiusY={radiusY * (innerRadius / radiusX) * .98}
              fill={withAlpha(glowColor, .2 * glowStrength)}
              listening={false}
            />
            <Group x={x} y={y} scaleY={radiusY / radiusX}>
              {Array.from({ length: 8 }, (_, index) => (
                <Arc
                  key={index}
                  innerRadius={innerRadius}
                  outerRadius={radiusX}
                  angle={34}
                  rotation={-107 + index * 45}
                  fill={index % 2 === 0 ? primaryColor : secondaryColor}
                  stroke={withAlpha("#07101b", .48)}
                  strokeWidth={Math.max(.7, object.style.strokeWidth * .16)}
                  shadowColor="#000000"
                  shadowBlur={4}
                  shadowOffsetY={3}
                  shadowOpacity={.55}
                />
              ))}
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
