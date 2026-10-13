"use client";

import { Clock3, ImagePlus, Layers3, Plus, Trash2 } from "lucide-react";
import { useEditorStore } from "@/store/useEditorStore";
import type { AnalysisSlide, BoardSlideContent, ImageSlideContent, LineupSlideContent, SlideAlignment, SlideContent, TextSlideContent, TitleSlideContent, WrittenReportSlideContent } from "@/types/slide";
import { formationNames, playersForFormation } from "@/utils/slideFactory";
import { createId } from "@/utils/id";

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
      {slide.content.kind === "written-report" && <WrittenReportProperties content={slide.content} onChange={setContent} />}
      {(slide.content.kind === "kickoff" || slide.content.kind === "tactical-board") && <BoardProperties content={slide.content} onChange={setContent} />}
      {slide.content.kind === "image" && <ImageProperties content={slide.content} onChange={setContent} />}
      {slide.content.kind === "video" && <section className="property-section"><h3>VÍDEO / PLAY</h3><div className="video-slide-info"><span>{slide.content.fileName || "Nenhum vídeo carregado"}</span><small>As ferramentas de vídeo e as propriedades dos desenhos aparecem quando este slide está ativo.</small></div></section>}
      <section className="property-section">
        <h3>APRESENTAÇÃO</h3>
        <label className="slide-prop-field"><span><Clock3 size={12} /> Duração</span><div><input type="number" min={1} max={60} step={.5} value={slide.duration} onChange={(event) => updateSlide(slide.id, { duration: Math.max(1, Number(event.target.value)) })} /><i>s</i></div></label>
        <label className="slide-prop-field vertical"><span>Legenda no fundo da imagem</span><textarea rows={3} placeholder="Escreva a mensagem a apresentar..." value={slide.caption} onChange={(event) => updateSlide(slide.id, { caption: event.target.value })} /></label>
        <label className="slide-prop-field"><span>Opacidade da legenda</span><input type="range" min={.25} max={1} step={.05} value={slide.captionOpacity ?? .74} onChange={(event) => updateSlide(slide.id, { captionOpacity: Number(event.target.value) })} /></label>
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

const reportMoments = ["Organização ofensiva", "Transição defensiva", "Organização defensiva", "Transição ofensiva", "Bolas paradas ofensivas", "Bolas paradas defensivas"];

function WrittenReportProperties({ content, onChange }: { content: WrittenReportSlideContent; onChange: (value: WrittenReportSlideContent) => void }) {
  const systems = content.tacticalSystems ?? [];
  const fields = content.generalFields ?? [];
  const updateSystem = (index: number, value: string) => {
    const previous = systems[index];
    const tacticalSystems = systems.map((system, systemIndex) => systemIndex === index ? value : system);
    onChange({ ...content, tacticalSystems, formation: content.formation === previous ? value : content.formation });
  };
  const chooseFormation = (formation: string) => onChange({
    ...content,
    formation,
    players: formationNames.includes(formation) ? playersForFormation(formation) : content.players,
  });
  const addSystem = () => {
    const known = formationNames.find((formation) => !systems.includes(formation));
    const name = known ?? `Novo esquema ${systems.length + 1}`;
    onChange({ ...content, tacticalSystems: [...systems, name] });
  };
  const removeSystem = (index: number) => {
    if (systems.length <= 1) return;
    const removed = systems[index];
    const tacticalSystems = systems.filter((_, systemIndex) => systemIndex !== index);
    const formation = content.formation === removed ? tacticalSystems[0] : content.formation;
    onChange({ ...content, tacticalSystems, formation, players: formationNames.includes(formation) ? playersForFormation(formation) : content.players });
  };

  return <>
    <Section title="IDENTIFICAÇÃO DO JOGO">
      <label className="slide-prop-field vertical"><span>Equipa / adversário</span><input value={content.team} onChange={(event) => onChange({ ...content, team: event.target.value })} /></label>
      <div className="report-property-pair"><label><span>Jornada</span><input value={content.matchday} onChange={(event) => onChange({ ...content, matchday: event.target.value })} /></label><label><span>Data do jogo</span><input type="date" value={content.matchDate} onChange={(event) => onChange({ ...content, matchDate: event.target.value })} /></label></div>
    </Section>
    <Section title="DADOS GERAIS">
      <label className="slide-prop-field vertical"><span>Estádio</span><input value={content.stadium} onChange={(event) => onChange({ ...content, stadium: event.target.value })} /></label>
      <label className="slide-prop-field vertical"><span>Medidas do campo</span><input placeholder="Ex.: 105 × 68 m" value={content.pitchDimensions} onChange={(event) => onChange({ ...content, pitchDimensions: event.target.value })} /></label>
      <label className="slide-prop-field vertical"><span>Previsão meteorológica</span><input value={content.weather} onChange={(event) => onChange({ ...content, weather: event.target.value })} /></label>
      <label className="slide-prop-field vertical"><span>Treinador</span><input value={content.coach} onChange={(event) => onChange({ ...content, coach: event.target.value })} /></label>
      <div className="report-edit-list">{fields.map((field, index) => <div className="report-field-row" key={field.id}><input aria-label="Nome do campo" placeholder="Campo" value={field.label} onChange={(event) => onChange({ ...content, generalFields: fields.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item) })} /><input aria-label="Valor do campo" placeholder="Valor" value={field.value} onChange={(event) => onChange({ ...content, generalFields: fields.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item) })} /><button type="button" onClick={() => onChange({ ...content, generalFields: fields.filter((_, itemIndex) => itemIndex !== index) })} title="Remover campo"><Trash2 size={11} /></button></div>)}</div>
      <button type="button" className="report-add-property" onClick={() => onChange({ ...content, generalFields: [...fields, { id: createId(), label: "", value: "" }] })}><Plus size={12} /> Adicionar dado</button>
    </Section>
    <Section title="ESQUEMAS TÁTICOS UTILIZADOS">
      <label className="slide-prop-field"><span>Esquema neste slide</span><select value={content.formation} onChange={(event) => chooseFormation(event.target.value)}>{systems.map((system, index) => <option key={`${system}-${index}`} value={system}>{system}</option>)}</select></label>
      <div className="report-edit-list">{systems.map((system, index) => <div className="report-system-row" key={index}><input value={system} onChange={(event) => updateSystem(index, event.target.value)} /><button type="button" onClick={() => removeSystem(index)} disabled={systems.length <= 1} title="Remover esquema"><Trash2 size={11} /></button></div>)}</div>
      <button type="button" className="report-add-property" onClick={addSystem}><Plus size={12} /> Adicionar esquema</button>
    </Section>
    <Section title="MOMENTO / SUBMOMENTO">
      <label className="slide-prop-field vertical"><span>Momento</span><input list="report-moments" value={content.moment} onChange={(event) => onChange({ ...content, moment: event.target.value })} /><datalist id="report-moments">{reportMoments.map((moment) => <option key={moment} value={moment} />)}</datalist></label>
      <label className="slide-prop-field vertical"><span>Submomento</span><input placeholder="Ex.: construção, criação, finalização…" value={content.submoment} onChange={(event) => onChange({ ...content, submoment: event.target.value })} /></label>
      <label className="slide-prop-field vertical"><span>Descrição e comportamentos</span><textarea rows={6} value={content.description} onChange={(event) => onChange({ ...content, description: event.target.value })} /></label>
      <p className="property-help">No campo do slide pode mover jogadores, desenhar setas, marcar zonas e desenhar livremente. Duplique este slide para criar outro momento mantendo os dados do jogo.</p>
    </Section>
    <Section title="CAMPO TÁTICO">
      <div className="two-fields"><label><span className="field-label">Equipa</span><input type="color" value={content.teamColor} onChange={(event) => onChange({ ...content, teamColor: event.target.value })} /></label><label><span className="field-label">Guarda-redes</span><input type="color" value={content.goalkeeperColor} onChange={(event) => onChange({ ...content, goalkeeperColor: event.target.value })} /></label></div>
      <div className="player-properties-list">{content.players.map((player) => <div key={player.id}><input type="number" min={0} max={99} value={player.number} onChange={(event) => onChange({ ...content, players: content.players.map((item) => item.id === player.id ? { ...item, number: Number(event.target.value) } : item) })} /><input value={player.name} onChange={(event) => onChange({ ...content, players: content.players.map((item) => item.id === player.id ? { ...item, name: event.target.value } : item) })} /></div>)}</div>
    </Section>
  </>;
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
