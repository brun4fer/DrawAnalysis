"use client";

import { Plus, Trash2 } from "lucide-react";
import { useEditorStore } from "@/store/useEditorStore";
import { createTrainingExerciseObject, TRAINING_OBJECT_LABELS } from "@/lib/training-exercise";
import type { TrainingExerciseObject, TrainingExerciseObjectType, TrainingExerciseSlideContent, TrainingPlanSlideContent, TrainingPlanText } from "@/types/slide";
import { createId } from "@/utils/id";

type SectionProps = { title: string; children: React.ReactNode };
const Section = ({ title, children }: SectionProps) => <section className="property-section slide-content-properties"><h3>{title}</h3>{children}</section>;

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="slide-prop-field"><span>{label}</span><input aria-label={label} type="color" value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function Range({ label, value, min, max, step = 1, suffix = "", onChange }: { label: string; value: number; min: number; max: number; step?: number; suffix?: string; onChange: (value: number) => void }) {
  return <label className="stacked-field"><span><span className="field-label">{label}</span><b>{Math.round(value * 100) / 100}{suffix}</b></span><input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

const tools: TrainingExerciseObjectType[] = ["player", "arrow", "zigzag-arrow", "line", "pole", "cone", "goal", "ball", "text"];

export function TrainingExerciseProperties({ content, onChange }: { content: TrainingExerciseSlideContent; onChange: (value: TrainingExerciseSlideContent) => void }) {
  const selected = content.objects.find((object) => object.id === content.selectedObjectId);
  const update = (patch: Partial<TrainingExerciseObject>) => selected && onChange({ ...content, objects: content.objects.map((object) => object.id === selected.id ? { ...object, ...patch } : object) });
  const add = (type: TrainingExerciseObjectType) => onChange({ ...content, objects: [...content.objects, createTrainingExerciseObject(type, content.objects.length)], selectedObjectId: undefined });
  return <>
    <Section title="TRAINING OBJECTS">
      <p className="property-help">Add an object, then drag it directly on the pitch. Select an object to edit it here.</p>
      <div className="training-object-grid">{tools.map((type) => <button type="button" key={type} className="report-add-property" onClick={() => add(type)}><Plus size={12} /> {TRAINING_OBJECT_LABELS[type]}</button>)}</div>
    </Section>
    <Section title="PITCH DESIGN">
      <ColorField label="Pitch" value={content.pitchColor} onChange={(pitchColor) => onChange({ ...content, pitchColor })} />
      <ColorField label="Pitch lines" value={content.pitchLineColor} onChange={(pitchLineColor) => onChange({ ...content, pitchLineColor })} />
    </Section>
    <Section title="EXERCISE DETAILS">
      <label className="slide-prop-field vertical"><span>Title</span><input value={content.title ?? ""} placeholder="Exercise 1" onChange={(event) => onChange({ ...content, title: event.target.value })} /></label>
      <label className="slide-prop-field vertical"><span>Description</span><textarea rows={5} value={content.description ?? ""} placeholder="Instructions, objectives and organisation…" onChange={(event) => onChange({ ...content, description: event.target.value })} /></label>
    </Section>
    {selected && <Section title={TRAINING_OBJECT_LABELS[selected.type].toUpperCase()}>
      {(selected.type === "player" || selected.type === "text") && <label className="slide-prop-field vertical"><span>{selected.type === "player" ? "Player name" : "Text"}</span><textarea rows={selected.type === "text" ? 3 : 1} value={selected.label ?? ""} onChange={(event) => update({ label: event.target.value })} /></label>}
      <ColorField label={selected.type === "player" ? "Player colour" : selected.type === "text" ? "Text colour" : "Colour"} value={selected.color ?? "#ffffff"} onChange={(color) => update({ color })} />
      {selected.type === "player" && <><Range label="Player size" value={selected.width} min={2} max={12} step={.25} suffix="%" onChange={(width) => update({ width, height: width })} /><ColorField label="Name colour" value={selected.labelColor ?? "#ffffff"} onChange={(labelColor) => update({ labelColor })} /><label className="checkbox-field"><input type="checkbox" checked={selected.labelBackgroundEnabled ?? false} onChange={(event) => update({ labelBackgroundEnabled: event.target.checked })} /> Name background</label>{selected.labelBackgroundEnabled && <ColorField label="Background colour" value={selected.labelBackgroundColor ?? "#111111"} onChange={(labelBackgroundColor) => update({ labelBackgroundColor })} />}</>}
      {(selected.type === "arrow" || selected.type === "line" || selected.type === "zigzag-arrow") && <Range label="Length" value={selected.width} min={2} max={50} step={.25} suffix="%" onChange={(width) => update({ width })} />}
      {selected.type === "zigzag-arrow" && <Range label="Zig-zag height" value={selected.height} min={1} max={24} step={.25} suffix="%" onChange={(height) => update({ height })} />}
      {selected.type === "pole" && <><Range label="Pole width" value={selected.width} min={.8} max={8} step={.2} suffix="%" onChange={(width) => update({ width })} /><Range label="Pole height" value={selected.height} min={2} max={30} step={.25} suffix="%" onChange={(height) => update({ height })} /></>}
      {selected.type === "cone" && <><Range label="Cone width" value={selected.width} min={1} max={14} step={.2} suffix="%" onChange={(width) => update({ width })} /><Range label="Cone depth" value={selected.height} min={.8} max={10} step={.2} suffix="%" onChange={(height) => update({ height })} /></>}
      {selected.type === "goal" && <><Range label="Goal width" value={selected.width} min={1} max={28} step={.25} suffix="%" onChange={(width) => update({ width })} /><Range label="Goal height" value={selected.height} min={2} max={34} step={.25} suffix="%" onChange={(height) => update({ height })} /></>}
      {selected.type === "ball" && <Range label="Ball size" value={selected.width} min={1} max={10} step={.2} suffix="%" onChange={(width) => update({ width, height: width })} />}
      {["line", "arrow", "zigzag-arrow"].includes(selected.type) && <Range label="Line thickness" value={selected.strokeWidth ?? 1.2} min={.3} max={5} step={.1} suffix="px" onChange={(strokeWidth) => update({ strokeWidth })} />}
      {selected.type === "text" && <>
        <Range label="Font size" value={selected.fontSize ?? 3} min={1} max={9} step={.2} suffix="%" onChange={(fontSize) => update({ fontSize })} />
        <label className="slide-prop-field"><span>Font style</span><select value={selected.fontFamily ?? "heavy"} onChange={(event) => update({ fontFamily: event.target.value as TrainingExerciseObject["fontFamily"] })}><option value="heavy">Heavy</option><option value="sans">Sans</option><option value="condensed">Condensed</option></select></label>
        <label className="checkbox-field"><input type="checkbox" checked={selected.shadow ?? false} onChange={(event) => update({ shadow: event.target.checked })} /> Shadow</label>
      </>}
      {["line", "arrow", "zigzag-arrow"].includes(selected.type) && <label className="checkbox-field"><input type="checkbox" checked={selected.dashed ?? false} onChange={(event) => update({ dashed: event.target.checked })} /> Dashed line</label>}
      <Range label="Opacity" value={selected.opacity ?? 1} min={.1} max={1} step={.05} suffix="%" onChange={(opacity) => update({ opacity })} />
      {["line", "arrow", "zigzag-arrow", "pole", "goal", "text"].includes(selected.type) && <Range label="Rotation" value={selected.rotation ?? 0} min={-180} max={180} suffix="°" onChange={(rotation) => update({ rotation })} />}
      <button type="button" className="report-remove-property" onClick={() => onChange({ ...content, objects: content.objects.filter((object) => object.id !== selected.id), selectedObjectId: undefined })}><Trash2 size={12} /> Remove object</button>
    </Section>}
  </>;
}

export function TrainingPlanProperties({ content, onChange }: { content: TrainingPlanSlideContent; onChange: (value: TrainingPlanSlideContent) => void }) {
  const slides = useEditorStore((state) => state.slides);
  const exercises = slides.filter((slide) => slide.content.kind === "training-exercise");
  const selectedText = content.texts.find((text) => text.id === content.selectedTextId);
  const updateText = (patch: Partial<TrainingPlanText>) => selectedText && onChange({ ...content, texts: content.texts.map((text) => text.id === selectedText.id ? { ...text, ...patch } : text) });
  return <>
    <Section title="EXERCISES IN THIS PLAN">
      <p className="property-help">Choose the exercise slides to include. Their order follows the slide list.</p>
      <p className="property-help">Select up to four exercises per page.</p><div className="training-plan-selector">{exercises.map((slide) => { const selected = content.exerciseSlideIds.includes(slide.id); return <label key={slide.id} className="checkbox-field"><input type="checkbox" disabled={!selected && content.exerciseSlideIds.length >= 4} checked={selected} onChange={(event) => onChange({ ...content, exerciseSlideIds: event.target.checked ? [...content.exerciseSlideIds, slide.id].slice(0, 4) : content.exerciseSlideIds.filter((id) => id !== slide.id) })} /> {slide.name}</label>; })}</div>
      {!exercises.length && <p className="property-help">Create an Exercise slide first.</p>}
    </Section>
    <Section title="PLAN LAYOUT">
      <label className="slide-prop-field"><span>Layout</span><select value={content.layout} onChange={(event) => onChange({ ...content, layout: event.target.value as TrainingPlanSlideContent["layout"] })}><option value="session-grid">Session grid</option><option value="overview-grid">Overview grid</option><option value="timeline">Timeline</option></select></label>
      <ColorField label="Background" value={content.backgroundColor ?? "#ffffff"} onChange={(backgroundColor) => onChange({ ...content, backgroundColor })} />
    </Section>
    <Section title="OPTIONAL TEXT">
      <p className="property-help">Add free text anywhere in the plan; no fixed session fields are required.</p>
      <button type="button" className="report-add-property" onClick={() => { const text: TrainingPlanText = { id: createId(), text: "TRAINING PLAN", x: 18, y: 12, color: "#111111", fontSize: 26, fontFamily: "heavy", shadow: false }; onChange({ ...content, texts: [...content.texts, text], selectedTextId: text.id }); }}><Plus size={12} /> Add text</button>
      {selectedText && <div className="training-plan-text-controls"><label className="slide-prop-field vertical"><span>Text</span><textarea rows={3} value={selectedText.text} onChange={(event) => updateText({ text: event.target.value })} /></label><ColorField label="Colour" value={selectedText.color} onChange={(color) => updateText({ color })} /><Range label="Font size" value={selectedText.fontSize} min={12} max={68} suffix="px" onChange={(fontSize) => updateText({ fontSize })} /><label className="slide-prop-field"><span>Font style</span><select value={selectedText.fontFamily ?? "heavy"} onChange={(event) => updateText({ fontFamily: event.target.value as TrainingPlanText["fontFamily"] })}><option value="heavy">Heavy</option><option value="sans">Sans</option><option value="condensed">Condensed</option></select></label><label className="checkbox-field"><input type="checkbox" checked={selectedText.shadow ?? false} onChange={(event) => updateText({ shadow: event.target.checked })} /> Shadow</label><button type="button" className="report-remove-property" onClick={() => onChange({ ...content, texts: content.texts.filter((text) => text.id !== selectedText.id), selectedTextId: undefined })}><Trash2 size={12} /> Remove text</button></div>}
    </Section>
  </>;
}
