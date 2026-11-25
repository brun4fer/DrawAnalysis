"use client";

import { useState } from "react";
import type { AnalysisSlide } from "@/types/slide";

export function TrainingPlanSelectModal({ slides, onConfirm, onCancel }: { slides: AnalysisSlide[]; onConfirm: (ids: string[]) => void; onCancel: () => void }) {
  const exercises = slides.filter((slide) => slide.content.kind === "training-exercise");
  const [ids, setIds] = useState<string[]>(exercises.slice(0, 4).map((slide) => slide.id));
  const toggle = (id: string) => setIds((current) => current.includes(id) ? current.filter((value) => value !== id) : current.length < 4 ? [...current, id] : current);
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Select exercises"><section className="project-modal training-session-modal"><header><div><span>TRAINING PLAN</span><h2>Select exercises</h2><p>Choose up to four exercises for this page.</p></div></header><div className="training-plan-selector modal-plan-selector">{exercises.map((slide) => <label key={slide.id} className="checkbox-field"><input type="checkbox" checked={ids.includes(slide.id)} disabled={!ids.includes(slide.id) && ids.length >= 4} onChange={() => toggle(slide.id)} /> {slide.content.kind === "training-exercise" ? slide.content.title || slide.name : slide.name}</label>)}</div><footer><button onClick={onCancel}>Cancel</button><button className="primary" onClick={() => onConfirm(ids)}>Create plan</button></footer></section></div>;
}
