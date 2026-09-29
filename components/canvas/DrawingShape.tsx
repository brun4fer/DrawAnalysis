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
  renderMode?: "all" | "base" | "playerLabel";
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

export function DrawingShape({ object, width, height, currentTime, selected, canEdit, onSelect, onChange, renderMode = "all" }: Props) {
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
    if (renderMode === "playerLabel" && data.kind !== "playerRing") return null;
    switch (data.kind) {
      case "playerRing": {
        const x = data.center.x * width;
        const y = data.center.y * height;
        const radiusX = data.radiusX * width;
        const radiusY = Math.min(data.radiusY * height, radiusX * .5);
        const primaryColor = solidColor(object.style.stroke, "#f7f8f2");
        const secondaryColor = solidColor(object.style.fill, "#1454c4");
        const glowColor = solidColor(object.style.shadowColor, "#f1e72b");
        const glowStrength = object.style.shadowOpacity;
        const ringDesign = data.ringDesign ?? "segmented";
        const spinSpeed = data.spinSpeed ?? 1;
        const elapsed = Math.max(0, currentTime - object.startTime);
        const outerRotation = data.spinEnabled === false ? 0 : elapsed * 48 * spinSpeed;
        const innerRotation = data.spinEnabled === false ? 0 : -elapsed * 72 * spinSpeed;
        const outerBand = Math.min(.23, .11 + object.style.strokeWidth * .012);
        const outerInnerRadius = radiusX * (1 - outerBand);
        const innerOuterRadius = radiusX * .63;
        const innerInnerRadius = radiusX * Math.max(.52, .575 - object.style.strokeWidth * .0045);
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
                fill="#050707"
                stroke="#050707"
                strokeWidth={Math.max(1.5, labelFontSize * .11)}
                shadowColor="#000000"
                shadowBlur={4}
                shadowOffsetY={2}
                shadowOpacity={.9}
                listening={false}
              />
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
                stroke="#050707"
                strokeWidth={Math.max(1.2, labelFontSize * .075)}
                shadowColor="#000000"
                shadowBlur={3}
                shadowOffsetY={2}
                shadowOpacity={.8}
              />
            </Group>
          ) : null;
          if (renderMode === "playerLabel") return labelNode;
          return (
            <Group opacity={temporalState.opacity}>
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
              y={y + radiusY * .03}
              radiusX={radiusX * .13}
              radiusY={radiusY * .12}
              fill="#000000"
              opacity={.24}
              shadowColor="#000000"
              shadowBlur={Math.max(3, object.style.shadowBlur * .22)}
              shadowOpacity={.65}
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
                    strokeWidth={1.2}
                    shadowColor="#000000"
                    shadowBlur={5}
                    shadowOffsetY={3}
                    shadowOpacity={.65}
                  />
                );
              })}
              {innerSegments.map((segment, index) => {
                const segmentColor = secondaryColor;
                return <Arc key={`inner-depth-${index}`} innerRadius={innerInnerRadius} outerRadius={innerOuterRadius} angle={segment.angle} rotation={segment.start + innerRotation} fill={shadeColor(segmentColor, -78)} stroke={shadeColor(segmentColor, -110)} strokeWidth={1} />;
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
                    strokeWidth={Math.max(.8, object.style.strokeWidth * .18)}
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
                    strokeWidth={Math.max(.7, object.style.strokeWidth * .14)}
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
                    innerRadius={radiusX * .94}
                    outerRadius={radiusX}
                    angle={segment.angle}
                    rotation={segment.start + outerRotation}
                    fill={shadeColor(primaryColor, -72)}
                    stroke={shadeColor(primaryColor, -100)}
                    strokeWidth={.7}
                  />
                ))}
                {fineInnerSegments.map((segment, index) => (
                  <Arc
                    key={`fine-inner-depth-${index}`}
                    innerRadius={radiusX * .66}
                    outerRadius={radiusX * .72}
                    angle={segment.angle}
                    rotation={segment.start + innerRotation}
                    fill={shadeColor(secondaryColor, -72)}
                    stroke={shadeColor(secondaryColor, -100)}
                    strokeWidth={.7}
                  />
                ))}
              </Group>
              <Group visible={ringDesign === "doubleLine"} x={x} y={y} scaleY={radiusY / radiusX} listening={false}>
                {fineOuterSegments.map((segment, index) => (
                  <Arc
                    key={`fine-outer-face-${index}`}
                    innerRadius={radiusX * .94}
                    outerRadius={radiusX}
                    angle={segment.angle}
                    rotation={segment.start + outerRotation}
                    fill={primaryColor}
                    stroke={shadeColor(primaryColor, 30)}
                    strokeWidth={Math.max(.6, object.style.strokeWidth * .1)}
                    shadowColor={primaryColor}
                    shadowBlur={Math.max(1, object.style.shadowBlur * .18)}
                    shadowOpacity={object.style.shadowOpacity * .7}
                  />
                ))}
                {fineInnerSegments.map((segment, index) => (
                  <Arc
                    key={`fine-inner-face-${index}`}
                    innerRadius={radiusX * .66}
                    outerRadius={radiusX * .72}
                    angle={segment.angle}
                    rotation={segment.start + innerRotation}
                    fill={secondaryColor}
                    stroke={shadeColor(secondaryColor, 30)}
                    strokeWidth={Math.max(.6, object.style.strokeWidth * .1)}
                    shadowColor={secondaryColor}
                    shadowBlur={Math.max(1, object.style.shadowBlur * .18)}
                    shadowOpacity={object.style.shadowOpacity * .7}
                  />
                ))}
              </Group>
              {renderMode !== "base" && labelNode}
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
