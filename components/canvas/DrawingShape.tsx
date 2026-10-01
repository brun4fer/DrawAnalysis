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

function offsetPoints(points: number[], offsetX: number, offsetY: number) {
  return points.map((value, index) => value + (index % 2 === 0 ? offsetX : offsetY));
}

function quadraticCurvePoints(start: { x: number; y: number }, end: { x: number; y: number }, curveHeight: number, height: number) {
  const control = {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2 - curveHeight * height * 2,
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

  const renderPatternShape = (
    points: number[],
    design: "solid" | "striped",
    stripeColorValue?: string,
    stripeSpacingValue?: number,
    stripeAngleValue?: number,
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
            <Line key={`${keyPrefix}-stripe-${index}`} points={stripePoints} stroke={withAlpha(stripeColor, .72)} strokeWidth={Math.max(2.2, spacing * .48)} listening={false} />
          ))}
        </Group>
      </Group>
    );
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
        const ringDesign = data.ringDesign ?? "segmented";
        const glowColor = ringDesign === "broadcastGlow" ? "#ffffff" : solidColor(object.style.shadowColor, "#f1e72b");
        const glowStrength = object.style.shadowOpacity;
        const spinSpeed = data.spinSpeed ?? 1;
        const elapsed = Math.max(0, currentTime - object.startTime);
        const outerRotation = data.spinEnabled === false ? 0 : elapsed * 48 * spinSpeed;
        const innerRotation = data.spinEnabled === false ? 0 : -elapsed * 72 * spinSpeed;
        const outerBand = Math.min(.23, .11 + object.style.strokeWidth * .012);
        const outerInnerRadius = radiusX * (1 - outerBand);
        const innerOuterRadius = radiusX * .77;
        const innerInnerRadius = radiusX * Math.max(.67, .71 - object.style.strokeWidth * .0045);
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
                    innerRadius={radiusX * .78}
                    outerRadius={radiusX * .84}
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
                    innerRadius={radiusX * .78}
                    outerRadius={radiusX * .84}
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
              <Group visible={ringDesign === "broadcast" || ringDesign === "broadcastGlow"} x={x} y={y + depthOffset * .72} scaleY={radiusY / radiusX} listening={false}>
                {broadcastOuterSegments.map((segment, index) => (
                  <Arc
                    key={`broadcast-outer-depth-${index}`}
                    innerRadius={radiusX * .935}
                    outerRadius={radiusX}
                    angle={segment.angle}
                    rotation={segment.start + outerRotation}
                    fill={shadeColor(primaryColor, -88)}
                    stroke={shadeColor(primaryColor, -112)}
                    strokeWidth={.8}
                    shadowColor="#000000"
                    shadowBlur={4}
                    shadowOffsetY={2.5}
                    shadowOpacity={.6}
                  />
                ))}
                {broadcastInnerSegments.map((segment, index) => (
                  <Arc
                    key={`broadcast-inner-depth-${index}`}
                    innerRadius={radiusX * .69}
                    outerRadius={radiusX * .895}
                    angle={segment.angle}
                    rotation={segment.start + innerRotation}
                    fill={shadeColor(secondaryColor, -82)}
                    stroke={shadeColor(secondaryColor, -108)}
                    strokeWidth={.9}
                  />
                ))}
              </Group>
              <Group visible={ringDesign === "broadcast" || ringDesign === "broadcastGlow"} x={x} y={y} scaleY={radiusY / radiusX} listening={false}>
                {broadcastOuterSegments.map((segment, index) => (
                  <Arc
                    key={`broadcast-outer-face-${index}`}
                    innerRadius={radiusX * .935}
                    outerRadius={radiusX}
                    angle={segment.angle}
                    rotation={segment.start + outerRotation}
                    fillLinearGradientStartPoint={{ x: 0, y: -radiusX }}
                    fillLinearGradientEndPoint={{ x: 0, y: radiusX }}
                    fillLinearGradientColorStops={[0, shadeColor(primaryColor, 48), .38, shadeColor(primaryColor, 16), .72, primaryColor, 1, shadeColor(primaryColor, -38)]}
                    stroke={shadeColor(primaryColor, -18)}
                    strokeWidth={Math.max(.55, object.style.strokeWidth * .12)}
                    shadowColor={ringDesign === "broadcastGlow" ? "#ffffff" : "#000000"}
                    shadowBlur={ringDesign === "broadcastGlow" ? 7 : 2}
                    shadowOpacity={ringDesign === "broadcastGlow" ? .82 : .32}
                  />
                ))}
                {broadcastInnerSegments.map((segment, index) => (
                  <Arc
                    key={`broadcast-inner-face-${index}`}
                    innerRadius={radiusX * .69}
                    outerRadius={radiusX * .895}
                    angle={segment.angle}
                    rotation={segment.start + innerRotation}
                    fillLinearGradientStartPoint={{ x: 0, y: -radiusX * .9 }}
                    fillLinearGradientEndPoint={{ x: 0, y: radiusX * .9 }}
                    fillLinearGradientColorStops={[0, shadeColor(secondaryColor, 58), .32, shadeColor(secondaryColor, 20), .68, secondaryColor, 1, shadeColor(secondaryColor, -48)]}
                    stroke={shadeColor(secondaryColor, -28)}
                    strokeWidth={Math.max(.65, object.style.strokeWidth * .15)}
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
          );
      }
      case "spotlight": {
        const x = data.target.x * width;
        const y = data.target.y * height;
        const radiusX = data.radiusX * width;
        const radiusY = data.radiusY * height;
        const top = y - data.beamHeight * height;
        const lightColor = solidColor(object.style.stroke, "#fff8c7");
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
            <Ellipse
              x={x}
              y={y}
              radiusX={radiusX * 1.22}
              radiusY={radiusY * 1.35}
              fillRadialGradientStartPoint={{ x: 0, y: 0 }}
              fillRadialGradientEndPoint={{ x: 0, y: 0 }}
              fillRadialGradientStartRadius={0}
              fillRadialGradientEndRadius={radiusX * 1.22}
              fillRadialGradientColorStops={[0, withAlpha(lightColor, .48), .35, withAlpha(lightColor, .35), .7, withAlpha(lightColor, .14), 1, withAlpha(lightColor, 0)]}
              shadowColor={lightColor}
              shadowBlur={Math.max(20, object.style.shadowBlur)}
              shadowOpacity={Math.max(.48, object.style.shadowOpacity)}
              listening={false}
            />
            <Ellipse
              x={x}
              y={y}
              radiusX={radiusX * .65}
              radiusY={radiusY * .7}
              fill={withAlpha(lightColor, .2)}
              shadowColor={lightColor}
              shadowBlur={Math.max(10, object.style.shadowBlur * .55)}
              shadowOpacity={.6}
            />
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
        const depth = Math.max(2, Math.min(radiusY * .22, object.style.strokeWidth * .8));
        return (
          <Group>
            <Ellipse
              x={x + object.style.shadowOffsetX}
              y={y + depth + object.style.shadowOffsetY}
              radiusX={radiusX * 1.04}
              radiusY={radiusY * .9}
              fill="#000000"
              opacity={Math.max(.2, object.style.shadowOpacity * .42) * temporalState.opacity}
              shadowColor="#000000"
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
              strokeWidth={Math.max(1, object.style.strokeWidth * .6)}
              opacity={temporalState.opacity}
              listening={false}
            />
            <Ellipse {...common} x={x} y={y} radiusX={radiusX} radiusY={radiusY} fill={object.style.fill} shadowColor="#000000" />
            <Ellipse
              x={x}
              y={y - radiusY * .14}
              radiusX={radiusX * .91}
              radiusY={radiusY * .72}
              stroke={withAlpha(shadeColor(faceColor, 70), .7)}
              strokeWidth={Math.max(1, object.style.strokeWidth * .22)}
              opacity={temporalState.opacity * .75}
              listening={false}
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
          "rectangle",
        );
      }
      case "arrow": {
        const points = flattenPoints(data.points, width, height);
        if (points.length < 4) return null;
        const startX = points[0];
        const startY = points[1];
        const endX = points[points.length - 2];
        const endY = points[points.length - 1];
        const faceColor = solidColor(object.style.stroke, "#a3ff12");
        const pointerLength = Math.max(12, object.style.strokeWidth * 2.75);
        const pointerWidth = Math.max(13, object.style.strokeWidth * 2.9);
        const depthX = Math.max(1.5, object.style.strokeWidth * .38);
        const depthY = Math.max(2.5, object.style.strokeWidth * .62);
        return (
          <Group opacity={temporalState.opacity}>
            <Arrow
              points={offsetPoints(points, depthX + object.style.shadowOffsetX, depthY + object.style.shadowOffsetY)}
              stroke="#000000"
              fill="#000000"
              strokeWidth={object.style.strokeWidth + 3.5}
              dash={object.style.dash}
              pointerLength={pointerLength + 3}
              pointerWidth={pointerWidth + 4}
              opacity={Math.max(.28, object.style.shadowOpacity * .56)}
              shadowColor="#000000"
              shadowBlur={Math.max(8, object.style.shadowBlur)}
              shadowOpacity={.82}
              lineCap="round"
              lineJoin="round"
              listening={false}
            />
            <Arrow
              points={offsetPoints(points, depthX, depthY)}
              stroke={shadeColor(faceColor, -88)}
              fill={shadeColor(faceColor, -88)}
              strokeWidth={object.style.strokeWidth + 1.8}
              dash={object.style.dash}
              pointerLength={pointerLength + 1.5}
              pointerWidth={pointerWidth + 2}
              lineCap="round"
              lineJoin="round"
              listening={false}
            />
            <Arrow
              points={points}
              stroke={faceColor}
              fill={faceColor}
              strokeWidth={object.style.strokeWidth}
              dash={object.style.dash}
              pointerLength={pointerLength}
              pointerWidth={pointerWidth}
              lineCap="round"
              lineJoin="round"
            />
            <Arrow
              points={[startX, startY - Math.max(.7, object.style.strokeWidth * .13), endX, endY - Math.max(.7, object.style.strokeWidth * .13)]}
              stroke={withAlpha(shadeColor(faceColor, 88), .72)}
              fill={withAlpha(shadeColor(faceColor, 88), .72)}
              strokeWidth={Math.max(.8, object.style.strokeWidth * .22)}
              pointerLength={pointerLength * .82}
              pointerWidth={pointerWidth * .76}
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
        const points = quadraticCurvePoints(start, end, data.curveHeight, height);
        const groundShadowPoints = quadraticCurvePoints(start, end, Math.min(.014, Math.max(.003, data.curveHeight * .055)), height);
        const faceColor = solidColor(object.style.stroke, "#65d9ff");
        const pointerLength = Math.max(13, object.style.strokeWidth * 2.8);
        const pointerWidth = Math.max(14, object.style.strokeWidth * 3);
        const depthX = Math.max(1.2, object.style.strokeWidth * .24);
        const depthY = Math.max(1.8, object.style.strokeWidth * .36);
        const groundOffsetX = object.style.shadowOffsetX * .45;
        const groundOffsetY = Math.max(2, object.style.shadowOffsetY * .55);
        return (
          <Group opacity={temporalState.opacity}>
            <Arrow
              points={offsetPoints(groundShadowPoints, groundOffsetX, groundOffsetY)}
              stroke="#000000"
              fill="#000000"
              strokeWidth={object.style.strokeWidth + 2.5}
              dash={object.style.dash}
              pointerLength={pointerLength + 2}
              pointerWidth={pointerWidth + 3}
              opacity={Math.max(.2, object.style.shadowOpacity * .46)}
              shadowColor="#000000"
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
              fill="#000000"
              opacity={Math.max(.16, object.style.shadowOpacity * .34)}
              shadowColor="#000000"
              shadowBlur={Math.max(7, object.style.shadowBlur * .8)}
              shadowOpacity={.7}
              listening={false}
            />
            <Arrow
              points={offsetPoints(points, depthX, depthY)}
              stroke={shadeColor(faceColor, -72)}
              fill={shadeColor(faceColor, -72)}
              strokeWidth={object.style.strokeWidth + 1.4}
              dash={object.style.dash}
              pointerLength={pointerLength + 1.2}
              pointerWidth={pointerWidth + 1.8}
              lineCap="round"
              lineJoin="round"
              listening={false}
            />
            <Arrow
              points={points}
              stroke={faceColor}
              fill={faceColor}
              strokeWidth={object.style.strokeWidth}
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
        const points = flattenPoints(data.points, width, height);
        if (points.length < 4) return null;
        const design = data.lineDesign ?? "single";
        if (design === "single") return <Line {...common} points={points} />;

        const primaryColor = solidColor(object.style.stroke, "#a3ff12");
        const secondaryColor = solidColor(data.secondaryColor ?? "#ffffff", "#ffffff");
        if (design === "dual") {
          const startX = points[0];
          const startY = points[1];
          const endX = points[points.length - 2];
          const endY = points[points.length - 1];
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
                points={offsetPoints(points, normalX * 1.4, normalY * 1.4)}
                stroke={shadeColor(primaryColor, -72)}
                strokeWidth={mainWidth + 1.4}
                dash={object.style.dash}
                lineCap="round"
                lineJoin="round"
                shadowColor={object.style.shadowColor}
                shadowBlur={object.style.shadowBlur}
                shadowOpacity={object.style.shadowOpacity}
                shadowOffsetX={object.style.shadowOffsetX}
                shadowOffsetY={object.style.shadowOffsetY}
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
            </Group>
          );
        }

        const startX = points[0];
        const startY = points[1];
        const endX = points[points.length - 2];
        const endY = points[points.length - 1];
        const shadowX = object.style.shadowOffsetX || 3;
        const shadowY = object.style.shadowOffsetY || 5;
        return (
          <Group opacity={temporalState.opacity}>
            <Line
              points={offsetPoints(points, shadowX, shadowY)}
              strokeWidth={object.style.strokeWidth + 3.5}
              dash={object.style.dash}
              lineCap="round"
              lineJoin="round"
              strokeLinearGradientStartPoint={{ x: startX, y: startY }}
              strokeLinearGradientEndPoint={{ x: endX, y: endY }}
              strokeLinearGradientColorStops={[0, "rgba(0,0,0,0)", .16, "rgba(0,0,0,.42)", .5, "rgba(0,0,0,.66)", .84, "rgba(0,0,0,.42)", 1, "rgba(0,0,0,0)"]}
              shadowColor="#000000"
              shadowBlur={Math.max(9, object.style.shadowBlur)}
              shadowOpacity={Math.max(.48, object.style.shadowOpacity)}
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
              fillLinearGradientStartPoint={{ x: 0, y: 0 }}
              fillLinearGradientEndPoint={{ x: length, y: 0 }}
              fillLinearGradientColorStops={[0, withAlpha(color, .38), .42, withAlpha(color, .25), .78, withAlpha(color, .1), 1, withAlpha(color, 0)]}
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
              fillLinearGradientStartPoint={{ x: 0, y: 0 }}
              fillLinearGradientEndPoint={{ x: length, y: 0 }}
              fillLinearGradientColorStops={[0, withAlpha(color, .34), .5, withAlpha(color, .18), 1, withAlpha(color, 0)]}
            />
          </Group>
        );
      }
      case "triangle":
        return renderPatternShape(flattenPoints(data.points, width, height), data.fillDesign ?? "solid", data.stripeColor, data.stripeSpacing, data.stripeAngle, "triangle");
      case "polygon": {
        const points = flattenPoints(data.points, width, height);
        return renderPatternShape(points, data.zoneDesign ?? "solid", data.stripeColor, data.stripeSpacing, data.stripeAngle, "zone");
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

  const actionLabelNode = (() => {
    const label = object.actionLabel;
    if (renderMode === "playerLabel" || !label?.visible) return null;
    const position = Math.max(0, Math.min(1, label.position));
    let anchor: { x: number; y: number } | null = null;
    if ((object.data.kind === "line" || object.data.kind === "arrow") && object.data.points.length >= 2) {
      const start = object.data.points[0];
      const end = object.data.points[object.data.points.length - 1];
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
        {actionLabelNode}
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
