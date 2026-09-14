"use client";

import { useEffect, useRef } from "react";
import Konva from "konva";
import { Arrow, Ellipse, Group, Line, Rect, Text, Transformer } from "react-konva";
import type { DrawingObject } from "@/types/drawing";
import { flattenPoints } from "@/utils/coordinates";
import { transformAtTime } from "@/utils/interpolation";

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

export function DrawingShape({ object, width, height, currentTime, selected, canEdit, onSelect, onChange }: Props) {
  const nodeRef = useRef<Konva.Group>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const transform = transformAtTime(object, currentTime);

  useEffect(() => {
    if (selected && transformerRef.current && nodeRef.current) {
      transformerRef.current.nodes([nodeRef.current]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [selected]);

  const common = {
    stroke: object.style.stroke,
    strokeWidth: object.style.strokeWidth,
    opacity: object.style.opacity,
    dash: object.style.dash,
    lineCap: "round" as const,
    lineJoin: "round" as const,
  };

  const content = (() => {
    const data = object.data;
    switch (data.kind) {
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
        return <Text x={data.origin.x * width} y={data.origin.y * height} text={data.text} fontSize={data.fontSize * height} fontStyle="bold" fontFamily="Inter" fill={object.style.stroke} opacity={object.style.opacity} />;
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
