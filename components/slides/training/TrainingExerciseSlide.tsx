"use client";

import { useMemo, useRef } from "react";
import { useEditorStore } from "@/store/useEditorStore";
import type { AnalysisSlide, TrainingExerciseObject, TrainingExerciseSlideContent, TrainingPlanSlideContent, TrainingSessionDetails } from "@/types/slide";
import { clampPitchPosition } from "@/lib/training-exercise";
import styles from "./TrainingExerciseSlide.module.css";

interface ExerciseProps {
  content: TrainingExerciseSlideContent;
  interactive?: boolean;
  onChange?: (content: TrainingExerciseSlideContent) => void;
  miniature?: boolean;
  session?: TrainingSessionDetails | null;
}

type DragState = { id: string; originX: number; originY: number; startX: number; startY: number };

export function TrainingExerciseSlide({ content, interactive = false, onChange, miniature = false, session }: ExerciseProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const select = (id?: string) => onChange?.({ ...content, selectedObjectId: id });
  const update = (id: string, patch: Partial<TrainingExerciseObject>) => onChange?.({ ...content, objects: content.objects.map((object) => object.id === id ? { ...object, ...patch } : object) });
  const beginDrag = (event: React.PointerEvent<SVGGElement>, object: TrainingExerciseObject) => {
    if (!interactive) return;
    event.stopPropagation();
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    select(object.id);
    dragRef.current = { id: object.id, originX: object.x, originY: object.y, startX: event.clientX, startY: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!drag || !rect) return;
    update(drag.id, {
      x: clampPitchPosition(drag.originX + ((event.clientX - drag.startX) / rect.width) * 100),
      y: clampPitchPosition(drag.originY + ((event.clientY - drag.startY) / rect.height) * 100),
    });
  };
  const stopDrag = () => { dragRef.current = null; };
  const pitch = <svg ref={svgRef} className={`${styles.pitch}${miniature ? " training-plan-pitch" : ""}`} viewBox="0 0 100 56.25" preserveAspectRatio="xMidYMid meet" onPointerMove={moveDrag} onPointerUp={stopDrag} onPointerLeave={stopDrag} onPointerDown={() => interactive && select(undefined)}>
      <defs>
        <pattern id="training-stripes" width="14" height="56.25" patternUnits="userSpaceOnUse"><rect width="7" height="56.25" fill={content.pitchColor} /><rect x="7" width="7" height="56.25" fill="#237a28" opacity=".32" /></pattern>
        <pattern id="goal-net" width="1.6" height="1.6" patternUnits="userSpaceOnUse"><path d="M0 0L1.6 1.6M1.6 0L0 1.6" stroke="#d7e3d5" strokeWidth=".13" opacity=".9" /></pattern>
        <marker id="training-arrow-head" markerWidth="4" markerHeight="4" refX="3.3" refY="2" orient="auto"><path d="M0,0 L4,2 L0,4 Z" fill="context-stroke" /></marker>
      </defs>
      <rect width="100" height="56.25" fill="url(#training-stripes)" />
      <g fill="none" stroke={content.pitchLineColor} strokeWidth=".2" opacity=".86">
        <rect x="3.5" y="3.5" width="93" height="49.25" rx=".18" />
        <path d="M50 3.5v49.25M3.5 28.125h93" opacity=".18" />
        <circle cx="50" cy="28.125" r="7" /><circle cx="50" cy="28.125" r=".28" fill={content.pitchLineColor} />
        <rect x="3.5" y="15.1" width="11" height="26" /><rect x="85.5" y="15.1" width="11" height="26" />
        <rect x="3.5" y="21" width="4.3" height="14.2" /><rect x="92.2" y="21" width="4.3" height="14.2" />
        <path d="M14.5 23.8a7.5 7.5 0 0 1 0 8.7M85.5 23.8a7.5 7.5 0 0 0 0 8.7" />
      </g>
      {content.objects.map((object) => <TrainingObject key={object.id} object={object} selected={content.selectedObjectId === object.id} onPointerDown={(event) => beginDrag(event, object)} />)}
    </svg>;
  if (miniature) return pitch;
  return <div className={styles.slide}>
    <header className={styles.sessionHeader}>
      <span><b>SEASON</b>{session?.season || "—"}</span><span><b>DATE</b>{session?.date || "—"}</span><span><b>MICROCYCLE</b>{session?.microcycle || "—"}</span><span><b>TRAINING UNIT</b>{session?.trainingUnit || "—"}</span>
    </header>
    <div className={styles.exerciseBody}><section className={styles.pitchPanel}><h1>{content.title || "EXERCISE"}</h1>{pitch}</section><aside className={styles.description}><h2>DESCRIPTION</h2>{interactive ? <textarea value={content.description ?? ""} placeholder="Add the exercise description…" onChange={(event) => onChange?.({ ...content, description: event.target.value })} /> : <p>{content.description || "No description."}</p>}</aside></div>
  </div>;
}

function TrainingObject({ object, selected, onPointerDown }: { object: TrainingExerciseObject; selected: boolean; onPointerDown: (event: React.PointerEvent<SVGGElement>) => void }) {
  const x = object.x;
  const y = object.y;
  const w = object.width;
  const h = object.height;
  const color = object.color ?? "#ffffff";
  const opacity = object.opacity ?? 1;
  const cls = `${styles.object}${selected ? ` ${styles.selected}` : ""}`;
  const strokeProps = { stroke: color, strokeWidth: object.strokeWidth ?? 1.3, strokeDasharray: object.dashed ? "2 1.5" : undefined, opacity, fill: "none" };
  const transform = `rotate(${object.rotation ?? 0} ${x} ${y})`;
  if (object.type === "player") return <g className={cls} transform={transform} onPointerDown={onPointerDown} opacity={opacity}><circle cx={x} cy={y} r={Math.max(1.7, w / 2)} fill={color} stroke="#ffffff" strokeWidth=".35" /><text className={styles.name} x={x} y={y + w / 2 + 2.1} textAnchor="middle" fontSize="1.65" fill="#ffffff">{object.label || "PLAYER"}</text></g>;
  if (object.type === "pole") return <g className={cls} transform={transform} onPointerDown={onPointerDown} opacity={opacity}><ellipse cx={x} cy={y + h / 2 - .4} rx={w / 2} ry={Math.max(.7, h * .11)} fill="#171717" /><path d={`M${x} ${y + h / 2 - .55}V${y - h / 2}`} stroke={color} strokeWidth={Math.max(.6, w * .32)} strokeLinecap="round" /><path d={`M${x + .32} ${y + h / 2 - .8}V${y - h / 2 + .35}`} stroke="#ff7666" strokeWidth=".16" /></g>;
  if (object.type === "cone") return <g className={cls} transform={transform} onPointerDown={onPointerDown} opacity={opacity}><ellipse cx={x} cy={y} rx={w / 2} ry={Math.max(.75, h / 2)} fill={color} /><ellipse cx={x} cy={y} rx={w * .21} ry={Math.max(.25, h * .2)} fill="#4c9633" stroke="#ff6a55" strokeWidth=".18" /><ellipse cx={x} cy={y + h * .08} rx={w * .43} ry={Math.max(.4, h * .34)} fill="none" stroke="#ff8273" strokeWidth=".16" /></g>;
  if (object.type === "goal") return <g className={cls} transform={transform} onPointerDown={onPointerDown} opacity={opacity}><rect x={x - w / 2} y={y - h / 2} width={w} height={h} fill="url(#goal-net)" stroke={color} strokeWidth=".35" /><path d={`M${x - w / 2} ${y - h / 2}h${w}M${x - w / 2} ${y + h / 2}h${w}`} stroke="#ffffff" strokeWidth=".35" /></g>;
  if (object.type === "ball") return <g className={cls} transform={transform} onPointerDown={onPointerDown} opacity={opacity}><circle cx={x} cy={y} r={w / 2} fill="#fff" stroke="#151515" strokeWidth=".18" /><path d={`M${x - w * .2} ${y}l${w * .2}-${w * .18} ${w * .2} ${w * .18}-${w * .13} ${w * .18}z`} fill="#121212" /><path d={`M${x - w * .36} ${y - w * .12}l${w * .15} ${w * .08}M${x + w * .33} ${y - w * .14}l-${w * .16} ${w * .08}M${x} ${y + w * .38}v-${w * .17}`} stroke="#151515" strokeWidth=".14" /></g>;
  if (object.type === "text") return <g className={cls} transform={transform} onPointerDown={onPointerDown} opacity={opacity}><text className={styles.text} x={x} y={y} textAnchor="middle" fontSize={object.fontSize ?? 3} fontWeight={object.fontFamily === "heavy" ? 900 : object.fontFamily === "condensed" ? 700 : 500} fontFamily={object.fontFamily === "condensed" ? "Arial Narrow, Arial, sans-serif" : "Inter, Arial, sans-serif"} fill={color} style={object.shadow ? { filter: "drop-shadow(.18px .22px .14px rgba(0,0,0,.65))" } : undefined}>{object.label || "TEXT"}</text></g>;
  if (object.type === "zigzag-arrow") {
    const points = Array.from({ length: 7 }, (_, index) => `${x - w / 2 + index * (w / 6)},${y + (index % 2 ? -h / 2 : h / 2)}`).join(" ");
    return <g className={cls} transform={transform} onPointerDown={onPointerDown}><polyline points={points} {...strokeProps} markerEnd="url(#training-arrow-head)" /></g>;
  }
  if (object.type === "line") return <g className={cls} transform={transform} onPointerDown={onPointerDown}><line x1={x - w / 2} y1={y - h / 2} x2={x + w / 2} y2={y + h / 2} {...strokeProps} /></g>;
  return <g className={cls} transform={transform} onPointerDown={onPointerDown}><line x1={x - w / 2} y1={y + h / 2} x2={x + w / 2} y2={y - h / 2} {...strokeProps} markerEnd="url(#training-arrow-head)" /></g>;
}

interface PlanProps { content: TrainingPlanSlideContent; interactive?: boolean; onChange?: (content: TrainingPlanSlideContent) => void; session?: TrainingSessionDetails | null; }

export function TrainingPlanSlide({ content, interactive = false, onChange, session }: PlanProps) {
  const slides = useEditorStore((state) => state.slides);
  const planRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; startX: number; startY: number; x: number; y: number } | null>(null);
  const exercises = useMemo(() => content.exerciseSlideIds.map((id) => slides.find((slide) => slide.id === id)).filter((slide): slide is AnalysisSlide => slide?.content.kind === "training-exercise"), [content.exerciseSlideIds, slides]);
  const beginTextDrag = (event: React.PointerEvent<HTMLDivElement>, id: string, x: number, y: number) => {
    if (!interactive) return;
    event.stopPropagation();
    onChange?.({ ...content, selectedTextId: id });
    dragRef.current = { id, startX: event.clientX, startY: event.clientY, x, y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveText = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const rect = planRef.current?.getBoundingClientRect();
    if (!drag || !rect) return;
    onChange?.({ ...content, texts: content.texts.map((text) => text.id === drag.id ? { ...text, x: clampPitchPosition(drag.x + ((event.clientX - drag.startX) / rect.width) * 100), y: clampPitchPosition(drag.y + ((event.clientY - drag.startY) / rect.height) * 100) } : text) });
  };
  return <div ref={planRef} className={styles.plan} style={{ background: content.backgroundColor ?? "#ffffff" }} onPointerMove={moveText} onPointerUp={() => { dragRef.current = null; }} onPointerLeave={() => { dragRef.current = null; }}>
    <header className={styles.planHeader}><span><b>SEASON</b>{session?.season || "—"}</span><span><b>DATE</b>{session?.date || "—"}</span><span><b>MICROCYCLE</b>{session?.microcycle || "—"}</span><span><b>TRAINING UNIT</b>{session?.trainingUnit || "—"}</span></header>
    {exercises.length ? <div className={`${styles.planGrid} ${content.layout === "overview-grid" ? styles.overviewGrid : content.layout === "timeline" ? styles.timeline : styles.sessionGrid}`}>
      {exercises.map((exercise, index) => <div className={styles.exerciseTile} key={exercise.id}><strong>{index + 1}. {(exercise.content as TrainingExerciseSlideContent).title || exercise.name}</strong><div className={styles.planExercise}><TrainingExerciseSlide content={exercise.content as TrainingExerciseSlideContent} miniature /><p>{(exercise.content as TrainingExerciseSlideContent).description || "—"}</p></div></div>)}
    </div> : <div className={styles.emptyPlan}>Select exercise slides in the panel to build the training plan.</div>}
    {content.texts.map((text) => <div key={text.id} className={`${styles.planText}${content.selectedTextId === text.id ? ` ${styles.planTextSelected}` : ""}`} style={{ left: `${text.x}%`, top: `${text.y}%`, color: text.color, fontSize: `${text.fontSize}px`, fontWeight: text.fontFamily === "heavy" ? 900 : text.fontFamily === "condensed" ? 700 : 500, fontFamily: text.fontFamily === "condensed" ? "Arial Narrow, Arial, sans-serif" : "Inter, Arial, sans-serif", textShadow: text.shadow ? "1px 2px 2px rgba(0,0,0,.3)" : undefined }} onPointerDown={(event) => beginTextDrag(event, text.id, text.x, text.y)}>{text.text}</div>)}
  </div>;
}
