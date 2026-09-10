"use client";

import { Copy, LocateFixed, Trash2 } from "lucide-react";
import { useEditorStore } from "@/store/useEditorStore";

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="field-label">{children}</span>;
}

export function PropertiesPanel() {
  const { drawings, selectedId, updateDrawing, removeDrawing, duplicateDrawing } = useEditorStore();
  const object = drawings.find((drawing) => drawing.id === selectedId);

  if (!object) {
    return (
      <aside className="properties-panel">
        <div className="panel-title"><span>PROPRIEDADES</span></div>
        <div className="no-selection">
          <LocateFixed size={26} />
          <strong>Nenhum objeto selecionado</strong>
          <p>Selecione um desenho no vídeo ou na timeline para editar as propriedades.</p>
        </div>
        <div className="shortcut-card">
          <span>ATALHOS</span>
          <div><kbd>Space</kbd><em>Play / Pause</em></div>
          <div><kbd>← →</kbd><em>Navegar</em></div>
          <div><kbd>, .</kbd><em>Frame a frame</em></div>
          <div><kbd>Del</kbd><em>Eliminar objeto</em></div>
        </div>
      </aside>
    );
  }

  const updateStyle = (patch: Partial<typeof object.style>) => updateDrawing(object.id, { style: { ...object.style, ...patch } });
  const updateTransform = (patch: Partial<typeof object.transform>) => updateDrawing(object.id, { transform: { ...object.transform, ...patch } });
  const duration = Math.max(0, object.endTime - object.startTime);
  const fillColor = object.style.fill.startsWith("#") ? object.style.fill.slice(0, 7) : "#a3ff12";

  return (
    <aside className="properties-panel">
      <div className="panel-title"><span>PROPRIEDADES</span><i>{object.type}</i></div>
      <div className="object-heading">
        <input value={object.name} onChange={(e) => updateDrawing(object.id, { name: e.target.value })} />
        <span>ID {object.id.slice(0, 6).toUpperCase()}</span>
      </div>

      <section className="property-section">
        <h3>APARÊNCIA</h3>
        <label className="field-row"><FieldLabel>Traço</FieldLabel><input type="color" value={object.style.stroke} onChange={(e) => updateStyle({ stroke: e.target.value })} /><code>{object.style.stroke}</code></label>
        {!["arrow", "line", "freeDraw", "text"].includes(object.type) && (
          <label className="field-row"><FieldLabel>Preench.</FieldLabel><input type="color" value={fillColor} onChange={(e) => updateStyle({ fill: `${e.target.value}33` })} /><code>{fillColor}</code></label>
        )}
        <label className="stacked-field"><span><FieldLabel>Espessura</FieldLabel><b>{object.style.strokeWidth}px</b></span><input type="range" min={1} max={16} value={object.style.strokeWidth} onChange={(e) => updateStyle({ strokeWidth: Number(e.target.value) })} /></label>
        <label className="stacked-field"><span><FieldLabel>Opacidade</FieldLabel><b>{Math.round(object.style.opacity * 100)}%</b></span><input type="range" min={0.1} max={1} step={0.05} value={object.style.opacity} onChange={(e) => updateStyle({ opacity: Number(e.target.value) })} /></label>
        {object.type !== "text" && <label className="toggle-row"><FieldLabel>Linha tracejada</FieldLabel><input type="checkbox" checked={object.style.dash.length > 0} onChange={(e) => updateStyle({ dash: e.target.checked ? [10, 7] : [] })} /><span /></label>}
        {object.data.kind === "text" && <TextContentField value={object.data.text} onChange={(text) => updateDrawing(object.id, { data: { kind: "text", origin: object.data.kind === "text" ? object.data.origin : { x: 0, y: 0 }, fontSize: object.data.kind === "text" ? object.data.fontSize : 0.055, text } })} />}
      </section>

      <section className="property-section">
        <h3>TEMPO</h3>
        <div className="two-fields">
          <label><FieldLabel>Início</FieldLabel><input type="number" min={0} step={0.04} value={object.startTime.toFixed(2)} onChange={(e) => updateDrawing(object.id, { startTime: Math.min(Number(e.target.value), object.endTime) })} /></label>
          <label><FieldLabel>Fim</FieldLabel><input type="number" min={0} step={0.04} value={object.endTime.toFixed(2)} onChange={(e) => updateDrawing(object.id, { endTime: Math.max(Number(e.target.value), object.startTime) })} /></label>
        </div>
        <div className="duration-readout"><span>Duração</span><strong>{duration.toFixed(2)} s</strong></div>
      </section>

      <section className="property-section">
        <h3>TRANSFORMAÇÃO</h3>
        <div className="two-fields">
          <label><FieldLabel>X</FieldLabel><input type="number" step={0.01} value={object.transform.x.toFixed(2)} onChange={(e) => updateTransform({ x: Number(e.target.value) })} /></label>
          <label><FieldLabel>Y</FieldLabel><input type="number" step={0.01} value={object.transform.y.toFixed(2)} onChange={(e) => updateTransform({ y: Number(e.target.value) })} /></label>
        </div>
        <label className="field-row numeric"><FieldLabel>Rotação</FieldLabel><input type="number" step={1} value={Math.round(object.transform.rotation)} onChange={(e) => updateTransform({ rotation: Number(e.target.value) })} /><code>°</code></label>
        <button className="secondary-button full" onClick={() => updateTransform({ x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 })}>Repor transformação</button>
      </section>

      <section className="property-section tracking-section">
        <label className="toggle-row"><span><FieldLabel>Tracking</FieldLabel><small>Preparado para fase seguinte</small></span><input type="checkbox" checked={object.trackingEnabled} onChange={(e) => updateDrawing(object.id, { trackingEnabled: e.target.checked })} /><span /></label>
        <div className="keyframe-count">{object.keyframes.length} keyframes</div>
      </section>

      <div className="property-actions">
        <button className="secondary-button" onClick={() => duplicateDrawing(object.id)}><Copy size={15} /> Duplicar</button>
        <button className="danger-button" onClick={() => removeDrawing(object.id)}><Trash2 size={15} /> Eliminar</button>
      </div>
    </aside>
  );
}

function TextContentField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <label className="text-field"><FieldLabel>Conteúdo</FieldLabel><textarea rows={2} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}
