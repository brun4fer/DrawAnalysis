"use client";

import { useState } from "react";
import type { TrainingSessionDetails } from "@/types/slide";

export function TrainingSessionSetupModal({ onCreate, onOpenProjects }: { onCreate: (session: TrainingSessionDetails) => void; onOpenProjects: () => void }) {
  const [session, setSession] = useState<TrainingSessionDetails>({ date: new Date().toISOString().slice(0, 10), season: "", microcycle: "", trainingUnit: "" });
  const ready = Object.values(session).every((value) => value.trim());
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="New training">
    <section className="project-modal training-session-modal">
      <header><div><span>TRAINING EXERCISES</span><h2>New training session</h2><p>Set the session details before creating the exercise diagrams.</p></div></header>
      <div className="training-session-fields">
        <label>Date<input type="date" value={session.date} onChange={(event) => setSession({ ...session, date: event.target.value })} /></label>
        <label>Season<input placeholder="2026/2027" value={session.season} onChange={(event) => setSession({ ...session, season: event.target.value })} /></label>
        <label>Microcycle<input inputMode="numeric" placeholder="e.g. 4" value={session.microcycle} onChange={(event) => setSession({ ...session, microcycle: event.target.value })} /></label>
        <label>Training unit<input inputMode="numeric" placeholder="e.g. 2" value={session.trainingUnit} onChange={(event) => setSession({ ...session, trainingUnit: event.target.value })} /></label>
      </div>
      <footer><button type="button" onClick={onOpenProjects}>Open saved projects</button><button type="button" className="primary" disabled={!ready} onClick={() => onCreate(session)}>Create training</button></footer>
    </section>
  </div>;
}
