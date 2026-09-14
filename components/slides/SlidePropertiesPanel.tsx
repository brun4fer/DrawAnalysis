"use client";

import { Clock3, ImagePlus, Layers3 } from "lucide-react";
import { useEditorStore } from "@/store/useEditorStore";
import type { AnalysisSlide, BoardSlideContent, ImageSlideContent, LineupSlideContent, SlideAlignment, SlideContent, TextSlideContent, TitleSlideContent } from "@/types/slide";
import { formationNames, playersForFormation } from "@/utils/slideFactory";

export function SlidePropertiesPanel() {
  const { slides, selectedSlideId, updateSlide } = useEditorStore();
  const slide = slides.find((item) => item.id === selectedSlideId);
  if (!slide) return <aside className="properties-panel"><div className="no-selection"><Layers3 size={26} /><strong>Adicione um slide</strong></div></aside>;
  const setContent = (content: SlideContent) => updateSlide(slide.id, { content });

  return (
    <aside className="properties-panel slide-properties">
      <div className="panel-title"><span>SLIDE</span><i>{slide.type}</i></div>
      <div className="object-heading"><input value={slide.name} onChange={(event) => updateSlide(slide.id, { name: event.target.value })} /><span>{slide.type.toUpperCase()}</span></div>
      {slide.content.kind === "title" && <TitleProperties content={slide.content} onChange={setContent} />}
      {slide.content.kind === "text" && <TextProperties content={slide.content} onChange={setContent} />}
      {slide.content.kind === "lineup" && <LineupProperties content={slide.content} onChange={setContent} />}
      {(slide.content.kind === "kickoff" || slide.content.kind === "tactical-board") && <BoardProperties content={slide.content} onChange={setContent} />}
      {slide.content.kind === "image" && <ImageProperties content={slide.content} onChange={setContent} />}
      {slide.content.kind === "video" && <section className="property-section"><h3>VÍDEO / PLAY</h3><div className="video-slide-info"><span>{slide.content.fileName || "Nenhum vídeo carregado"}</span><small>As ferramentas de vídeo e as propriedades dos desenhos aparecem quando este slide está ativo.</small></div></section>}
      <section className="property-section">
        <h3>APRESENTAÇÃO</h3>
        <label className="slide-prop-field"><span><Clock3 size={12} /> Duração</span><div><input type="number" min={1} max={60} step={.5} value={slide.duration} onChange={(event) => updateSlide(slide.id, { duration: Math.max(1, Number(event.target.value)) })} /><i>s</i></div></label>
        <label className="slide-prop-field vertical"><span>Pergunta deste slide</span><textarea rows={3} placeholder="O que quer perguntar à equipa?" value={slide.question} onChange={(event) => updateSlide(slide.id, { question: event.target.value })} /></label>
      </section>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="property-section slide-content-properties"><h3>{title}</h3>{children}</section>;
}

function AlignmentField({ value, onChange }: { value: SlideAlignment; onChange: (value: SlideAlignment) => void }) {
  return <label className="slide-prop-field"><span>Alinhamento</span><select value={value} onChange={(event) => onChange(event.target.value as SlideAlignment)}><option value="left">Esquerda</option><option value="center">Centro</option><option value="right">Direita</option></select></label>;
}

function BackgroundUpload({ onLoad }: { onLoad: (value: string) => void }) {
  return <label className="upload-property"><ImagePlus size={14} /> Imagem de fundo<input type="file" accept="image/*" onChange={(event) => readImage(event.target.files?.[0], onLoad)} /></label>;
}

function TitleProperties({ content, onChange }: { content: TitleSlideContent; onChange: (value: TitleSlideContent) => void }) {
  return <Section title="CONTEÚDO"><label className="slide-prop-field vertical"><span>Título</span><textarea rows={2} value={content.text} onChange={(event) => onChange({ ...content, text: event.target.value })} /></label><label className="slide-prop-field vertical"><span>Subtítulo</span><input value={content.subtitle} onChange={(event) => onChange({ ...content, subtitle: event.target.value })} /></label><label className="slide-prop-field vertical"><span>Texto adicional</span><textarea rows={2} value={content.body} onChange={(event) => onChange({ ...content, body: event.target.value })} /></label><AlignmentField value={content.alignment} onChange={(alignment) => onChange({ ...content, alignment })} /><label className="slide-prop-field"><span>Tamanho</span><input type="range" min={34} max={88} value={content.fontSize} onChange={(event) => onChange({ ...content, fontSize: Number(event.target.value) })} /></label><label className="slide-prop-field"><span>Fundo</span><input type="color" value={content.background} onChange={(event) => onChange({ ...content, background: event.target.value })} /></label><BackgroundUpload onLoad={(backgroundImage) => onChange({ ...content, backgroundImage })} /></Section>;
}

function TextProperties({ content, onChange }: { content: TextSlideContent; onChange: (value: TextSlideContent) => void }) {
  return <Section title="TEXTO / FRASE"><label className="slide-prop-field vertical"><span>Etiqueta opcional</span><input value={content.title} onChange={(event) => onChange({ ...content, title: event.target.value })} /></label><label className="slide-prop-field vertical"><span>Frase</span><textarea rows={4} value={content.text} onChange={(event) => onChange({ ...content, text: event.target.value })} /></label><AlignmentField value={content.alignment} onChange={(alignment) => onChange({ ...content, alignment })} /><label className="slide-prop-field"><span>Tamanho</span><input type="range" min={24} max={72} value={content.fontSize} onChange={(event) => onChange({ ...content, fontSize: Number(event.target.value) })} /></label><label className="slide-prop-field"><span>Fundo</span><input type="color" value={content.background} onChange={(event) => onChange({ ...content, background: event.target.value })} /></label><BackgroundUpload onLoad={(backgroundImage) => onChange({ ...content, backgroundImage })} /></Section>;
}

function LineupProperties({ content, onChange }: { content: LineupSlideContent; onChange: (value: LineupSlideContent) => void }) {
  return <Section title="FORMAÇÃO"><label className="slide-prop-field"><span>Sistema</span><select value={content.formation} onChange={(event) => { const formation = event.target.value; onChange({ ...content, formation, subtitle: formation, players: playersForFormation(formation) }); }}>{formationNames.map((name) => <option key={name}>{name}</option>)}</select></label><label className="slide-prop-field vertical"><span>Título</span><input value={content.title} onChange={(event) => onChange({ ...content, title: event.target.value })} /></label><div className="two-fields"><label><span className="field-label">Equipa</span><input type="color" value={content.teamColor} onChange={(event) => onChange({ ...content, teamColor: event.target.value })} /></label><label><span className="field-label">Guarda-redes</span><input type="color" value={content.goalkeeperColor} onChange={(event) => onChange({ ...content, goalkeeperColor: event.target.value })} /></label></div><div className="player-properties-list">{content.players.map((player) => <div key={player.id}><input type="number" min={0} max={99} value={player.number} onChange={(event) => onChange({ ...content, players: content.players.map((item) => item.id === player.id ? { ...item, number: Number(event.target.value) } : item) })} /><input value={player.name} onChange={(event) => onChange({ ...content, players: content.players.map((item) => item.id === player.id ? { ...item, name: event.target.value } : item) })} /></div>)}</div></Section>;
}

function BoardProperties({ content, onChange }: { content: BoardSlideContent; onChange: (value: BoardSlideContent) => void }) {
  return <Section title={content.kind === "kickoff" ? "PONTAPÉ DE SAÍDA" : "QUADRO TÁTICO"}><label className="slide-prop-field vertical"><span>Título</span><input value={content.title} onChange={(event) => onChange({ ...content, title: event.target.value })} /></label><div className="two-fields"><label><span className="field-label">Equipa A</span><input type="color" value={content.homeColor} onChange={(event) => onChange({ ...content, homeColor: event.target.value })} /></label><label><span className="field-label">Equipa B</span><input type="color" value={content.awayColor} onChange={(event) => onChange({ ...content, awayColor: event.target.value })} /></label></div><p className="property-help">Arraste os jogadores diretamente no campo. Setas, zonas e sequências serão ligadas à camada tática na fase seguinte.</p></Section>;
}

function ImageProperties({ content, onChange }: { content: ImageSlideContent; onChange: (value: ImageSlideContent) => void }) {
  return <Section title="IMAGEM"><label className="upload-property primary"><ImagePlus size={14} /> Escolher imagem<input type="file" accept="image/*" onChange={(event) => readImage(event.target.files?.[0], (imageDataUrl) => onChange({ ...content, imageDataUrl }))} /></label><label className="slide-prop-field"><span>Ajuste</span><select value={content.fit} onChange={(event) => onChange({ ...content, fit: event.target.value as "contain" | "cover" })}><option value="contain">Conter</option><option value="cover">Preencher</option></select></label></Section>;
}

function readImage(file: File | undefined, onLoad: (value: string) => void) {
  if (!file) return;
  const reader = new FileReader();
  reader.addEventListener("load", () => { if (typeof reader.result === "string") onLoad(reader.result); });
  reader.readAsDataURL(file);
}
