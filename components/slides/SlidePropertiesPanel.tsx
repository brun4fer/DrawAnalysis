"use client";

import { Clock3, Film, ImagePlus, Layers3, Plus, Trash2, X } from "lucide-react";
import { useEditorStore } from "@/store/useEditorStore";
import type { AnalysisSlide, BoardSlideContent, ImageSlideContent, LineupSlideContent, MatchPresentationSlideContent, SlideAlignment, SlideContent, TeamOverviewSlideContent, TextSlideContent, TitleSlideContent, WrittenReportSlideContent } from "@/types/slide";
import { formationNames, playersForFormation } from "@/utils/slideFactory";
import { createId } from "@/utils/id";
import { CaptionControls } from "./CaptionControls";
import { ColorPalettePicker } from "@/components/ui/ColorPalettePicker";

export function SlidePropertiesPanel() {
  const { slides, selectedSlideId, updateSlide } = useEditorStore();
  const slide = slides.find((item) => item.id === selectedSlideId);
  if (!slide) return <aside className="properties-panel"><div className="no-selection"><Layers3 size={26} /><strong>Adicione um slide</strong></div></aside>;
  const setContent = (content: SlideContent) => updateSlide(slide.id, { content });
  const slideTypeLabel = slide.type === "text" ? "Conclusão" : slide.type === "team-overview" ? "Dados gerais da equipa" : slide.type === "written-report" ? "Esquema tático + descrição" : slide.type === "kickoff" ? "Apresentação de jogo" : slide.type;

  return (
    <aside className="properties-panel slide-properties">
      <div className="panel-title"><span>SLIDE</span><i>{slideTypeLabel}</i></div>
      <div className="object-heading"><input value={slide.name} onChange={(event) => updateSlide(slide.id, { name: event.target.value })} /><span>{slideTypeLabel.toUpperCase()}</span></div>
      {slide.content.kind === "title" && <TitleProperties content={slide.content} onChange={setContent} />}
      {slide.content.kind === "text" && <TextProperties content={slide.content} onChange={setContent} />}
      {slide.content.kind === "lineup" && <LineupProperties content={slide.content} onChange={setContent} />}
      {slide.content.kind === "team-overview" && <TeamOverviewProperties content={slide.content} onChange={setContent} />}
      {slide.content.kind === "written-report" && <WrittenReportProperties content={slide.content} onChange={setContent} />}
      {slide.content.kind === "kickoff" && <MatchPresentationProperties content={slide.content} onChange={setContent} />}
      {slide.content.kind === "tactical-board" && <BoardProperties content={slide.content} onChange={setContent} />}
      {slide.content.kind === "image" && <ImageProperties content={slide.content} onChange={setContent} />}
      {slide.content.kind === "video" && <section className="property-section"><h3>VÍDEO / PLAY</h3><div className="video-slide-info"><span>{slide.content.fileName || "Nenhum vídeo carregado"}</span><small>As ferramentas de vídeo e as propriedades dos desenhos aparecem quando este slide está ativo.</small></div></section>}
      <section className="property-section">
        <h3>APRESENTAÇÃO</h3>
        <label className="slide-prop-field"><span><Clock3 size={12} /> Duração</span><div><input type="number" min={1} max={60} step={.5} value={slide.duration} onChange={(event) => updateSlide(slide.id, { duration: Math.max(1, Number(event.target.value)) })} /><i>s</i></div></label>
        <CaptionControls slide={slide} onChange={(patch) => updateSlide(slide.id, patch)} />
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

function ColorPaletteField({ label, value, onChange, opacity, onOpacityChange }: { label: string; value: string; onChange: (value: string) => void; opacity?: number; onOpacityChange?: (value: number) => void }) {
  return (
    <div className="slide-palette-field">
      <span>{label}</span>
      <ColorPalettePicker value={value} onChange={onChange} opacity={opacity} onOpacityChange={onOpacityChange} label={label} />
    </div>
  );
}

function MediaUpload({ name, onLoad, onClear }: { name?: string; onLoad: (value: { url: string; type: "image" | "video"; name: string }) => void; onClear: () => void }) {
  return (
    <div className="slide-media-control">
      <label className="upload-property"><Film size={14} /> Imagem ou vídeo de fundo<input type="file" accept="image/*,video/*" onChange={(event) => readMedia(event.target.files?.[0], onLoad)} /></label>
      {name && <div><span title={name}>{name}</span><button type="button" onClick={onClear} title="Remover fundo"><X size={12} /></button></div>}
    </div>
  );
}

function ImageAssetUpload({ label, value, onLoad, onClear, maxDimension = 640 }: { label: string; value?: string; onLoad: (value: string) => void; onClear: () => void; maxDimension?: number }) {
  return (
    <div className="slide-media-control compact">
      <label className="upload-property"><ImagePlus size={13} /> {label}<input type="file" accept="image/*" onChange={(event) => readImage(event.target.files?.[0], onLoad, maxDimension)} /></label>
      {value && <button type="button" className="remove-media-button" onClick={onClear}><X size={12} /> Remover</button>}
    </div>
  );
}

function TitleProperties({ content, onChange }: { content: TitleSlideContent; onChange: (value: TitleSlideContent) => void }) {
  const mediaUrl = content.backgroundMediaUrl ?? content.backgroundImage;
  return <>
    <Section title="TÍTULO / MOMENTO">
      <label className="slide-prop-field vertical"><span>Título</span><textarea rows={2} value={content.text} onChange={(event) => onChange({ ...content, text: event.target.value })} /></label>
      <label className="slide-prop-field vertical"><span>Momento / subtítulo</span><input value={content.subtitle} onChange={(event) => onChange({ ...content, subtitle: event.target.value })} /></label>
      <label className="slide-prop-field vertical"><span>Texto adicional</span><textarea rows={2} value={content.body} onChange={(event) => onChange({ ...content, body: event.target.value })} /></label>
      <AlignmentField value={content.alignment} onChange={(alignment) => onChange({ ...content, alignment })} />
      <label className="stacked-field"><span><span className="field-label">Tamanho do título</span><b>{content.fontSize}px</b></span><input type="range" min={34} max={96} value={content.fontSize} onChange={(event) => onChange({ ...content, fontSize: Number(event.target.value) })} /></label>
      <label className="stacked-field"><span><span className="field-label">Tamanho do subtítulo</span><b>{content.subtitleFontSize ?? 16}px</b></span><input type="range" min={8} max={44} value={content.subtitleFontSize ?? 16} onChange={(event) => onChange({ ...content, subtitleFontSize: Number(event.target.value) })} /></label>
      <ColorPaletteField label="Linha lateral" value={content.accentColor ?? "#a3ff12"} onChange={(accentColor) => onChange({ ...content, accentColor })} />
    </Section>
    <Section title="FUNDO">
      <ColorPaletteField label="Cor de fundo" value={content.background} onChange={(background) => onChange({ ...content, background })} opacity={content.backgroundOpacity ?? (mediaUrl ? .38 : 1)} onOpacityChange={(backgroundOpacity) => onChange({ ...content, backgroundOpacity })} />
      <label className="slide-prop-field"><span>Gradiente de leitura</span><input type="range" min={0} max={1} step={.05} value={content.overlayOpacity ?? (mediaUrl ? .62 : .12)} onChange={(event) => onChange({ ...content, overlayOpacity: Number(event.target.value) })} /></label>
      <MediaUpload name={content.backgroundMediaName ?? (mediaUrl ? "Imagem de fundo" : undefined)} onLoad={(media) => onChange({ ...content, backgroundImage: undefined, backgroundMediaUrl: media.url, backgroundMediaType: media.type, backgroundMediaName: media.name, backgroundOpacity: mediaUrl ? content.backgroundOpacity : .38, overlayOpacity: mediaUrl ? content.overlayOpacity : .62 })} onClear={() => onChange({ ...content, backgroundImage: undefined, backgroundMediaUrl: undefined, backgroundMediaType: undefined, backgroundMediaName: undefined })} />
    </Section>
    <Section title="EMBLEMA DO ADVERSÁRIO">
      <ImageAssetUpload label="Escolher emblema" value={content.crestImage} onLoad={(crestImage) => onChange({ ...content, crestImage })} onClear={() => onChange({ ...content, crestImage: undefined })} />
      <label className="slide-prop-field"><span>Canto</span><select value={content.crestCorner ?? "top-right"} onChange={(event) => onChange({ ...content, crestCorner: event.target.value as NonNullable<TitleSlideContent["crestCorner"]> })}><option value="top-left">Superior esquerdo</option><option value="top-right">Superior direito</option><option value="bottom-left">Inferior esquerdo</option><option value="bottom-right">Inferior direito</option></select></label>
    </Section>
  </>;
}

function TextProperties({ content, onChange }: { content: TextSlideContent; onChange: (value: TextSlideContent) => void }) {
  return <Section title="CONCLUSÃO"><label className="slide-prop-field vertical"><span>Etiqueta opcional</span><input value={content.title} onChange={(event) => onChange({ ...content, title: event.target.value })} /></label><label className="slide-prop-field vertical"><span>Conclusão</span><textarea rows={4} value={content.text} onChange={(event) => onChange({ ...content, text: event.target.value })} /></label><AlignmentField value={content.alignment} onChange={(alignment) => onChange({ ...content, alignment })} /><label className="slide-prop-field"><span>Tamanho</span><input type="range" min={24} max={72} value={content.fontSize} onChange={(event) => onChange({ ...content, fontSize: Number(event.target.value) })} /></label><ColorPaletteField label="Fundo" value={content.background} onChange={(background) => onChange({ ...content, background })} /><BackgroundUpload onLoad={(backgroundImage) => onChange({ ...content, backgroundImage })} /></Section>;
}

function LineupProperties({ content, onChange }: { content: LineupSlideContent; onChange: (value: LineupSlideContent) => void }) {
  const systems = content.tacticalSystems ?? [];
  const updatePlayer = (playerId: string, patch: Partial<LineupSlideContent["players"][number]>) => onChange({ ...content, players: content.players.map((player) => player.id === playerId ? { ...player, ...patch } : player) });
  const updateSystem = (index: number, value: string) => onChange({ ...content, tacticalSystems: systems.map((system, systemIndex) => systemIndex === index ? value : system) });
  return <>
    <Section title="ONZE PROVÁVEL">
      <label className="slide-prop-field vertical"><span>Nome do clube</span><input value={content.clubName ?? content.title} onChange={(event) => onChange({ ...content, clubName: event.target.value })} /></label>
      <label className="slide-prop-field vertical"><span>Texto “Onze provável”</span><input placeholder="Deixe vazio para ocultar" value={content.title} onChange={(event) => onChange({ ...content, title: event.target.value })} /></label>
      <label className="stacked-field"><span><span className="field-label">Tamanho de “Onze provável”</span><b>{content.lineupLabelFontSize ?? 7}px</b></span><input type="range" min={5} max={18} step={1} value={content.lineupLabelFontSize ?? 7} onChange={(event) => onChange({ ...content, lineupLabelFontSize: Number(event.target.value) })} /></label>
      <label className="slide-prop-field"><span>Formação dos jogadores</span><select value={content.formation} onChange={(event) => { const formation = event.target.value; onChange({ ...content, formation, subtitle: formation, players: playersForFormation(formation) }); }}>{formationNames.map((name) => <option key={name}>{name}</option>)}</select></label>
      <label className="slide-prop-field"><span>Template</span><select value={content.template ?? "broadcast"} onChange={(event) => onChange({ ...content, template: event.target.value as NonNullable<LineupSlideContent["template"]> })}><option value="broadcast">Broadcast · referência</option><option value="glass">Painel de vidro</option><option value="tactical">Tático</option></select></label>
      <ImageAssetUpload label="Emblema do clube" value={content.clubCrest} onLoad={(clubCrest) => onChange({ ...content, clubCrest })} onClear={() => onChange({ ...content, clubCrest: undefined })} />
      <ColorPaletteField label="Cor dos jogadores" value={content.teamColor} onChange={(teamColor) => onChange({ ...content, teamColor })} />
      <ColorPaletteField label="Cor do guarda-redes" value={content.goalkeeperColor} onChange={(goalkeeperColor) => onChange({ ...content, goalkeeperColor })} />
    </Section>
    <Section title="ESQUEMAS DA ESQUERDA">
      <p className="property-help">Esta lista é independente da formação dos jogadores. Pode deixá-la vazia ou adicionar os esquemas que quiser.</p>
      <div className="report-edit-list">{systems.map((system, index) => <div className="report-system-row" key={index}><input value={system} placeholder="Ex.: 1-4-3-3" onChange={(event) => updateSystem(index, event.target.value)} /><button type="button" onClick={() => onChange({ ...content, tacticalSystems: systems.filter((_, systemIndex) => systemIndex !== index) })} title="Remover esquema"><Trash2 size={11} /></button></div>)}</div>
      <button type="button" className="report-add-property" onClick={() => onChange({ ...content, tacticalSystems: [...systems, `1-${content.formation}`] })}><Plus size={12} /> Adicionar esquema</button>
      <ColorPaletteField label="Cor dos pontos dos jogadores" value={content.miniPlayerColor ?? "#92969a"} onChange={(miniPlayerColor) => onChange({ ...content, miniPlayerColor })} />
      <label className="stacked-field"><span><span className="field-label">Tamanho dos pontos dos jogadores</span><b>{Math.round((content.miniPlayerScale ?? 1) * 100)}%</b></span><input type="range" min={.5} max={2} step={.05} value={content.miniPlayerScale ?? 1} onChange={(event) => onChange({ ...content, miniPlayerScale: Number(event.target.value) })} /></label>
    </Section>
    <Section title="TREINADOR">
      <label className="slide-prop-field vertical"><span>Nome</span><input value={content.coachName ?? ""} onChange={(event) => onChange({ ...content, coachName: event.target.value })} /></label>
      <ImageAssetUpload label="Fotografia do treinador" value={content.coachPhoto} onLoad={(coachPhoto) => onChange({ ...content, coachPhoto })} onClear={() => onChange({ ...content, coachPhoto: undefined })} />
    </Section>
    <Section title="DESIGN DO ONZE">
      <ColorPaletteField label="Cor da moldura" value={content.frameColor ?? "#ffffff"} onChange={(frameColor) => onChange({ ...content, frameColor })} />
      <ColorPaletteField label="Cor do campo" value={content.pitchColor ?? "#07131a"} onChange={(pitchColor) => onChange({ ...content, pitchColor })} />
      <ColorPaletteField label="Fundo do nome do clube" value={content.headerBackgroundColor ?? "#ffffff"} onChange={(headerBackgroundColor) => onChange({ ...content, headerBackgroundColor })} />
      <ColorPaletteField label="Texto do cabeçalho" value={content.headerTextColor ?? "#050505"} onChange={(headerTextColor) => onChange({ ...content, headerTextColor })} />
      <label className="stacked-field"><span><span className="field-label">Opacidade do painel</span><b>{Math.round((content.panelOpacity ?? .82) * 100)}%</b></span><input type="range" min={0} max={1} step={.02} value={content.panelOpacity ?? .82} onChange={(event) => onChange({ ...content, panelOpacity: Number(event.target.value) })} /></label>
      <label className="stacked-field"><span><span className="field-label">Tamanho do painel</span><b>{Math.round((content.panelScale ?? 1) * 100)}%</b></span><input type="range" min={.72} max={1.08} step={.01} value={content.panelScale ?? 1} onChange={(event) => onChange({ ...content, panelScale: Number(event.target.value) })} /></label>
      <label className="stacked-field"><span><span className="field-label">Moldura dos jogadores</span><b>{Math.round((content.playerCardScale ?? 1) * 100)}%</b></span><input type="range" min={.65} max={1.65} step={.05} value={content.playerCardScale ?? 1} onChange={(event) => onChange({ ...content, playerCardScale: Number(event.target.value) })} /></label>
      <label className="stacked-field"><span><span className="field-label">Fotografias</span><b>{Math.round((content.playerPhotoScale ?? 1) * 100)}%</b></span><input type="range" min={.65} max={1.6} step={.05} value={content.playerPhotoScale ?? 1} onChange={(event) => onChange({ ...content, playerPhotoScale: Number(event.target.value) })} /></label>
      <label className="stacked-field"><span><span className="field-label">Números</span><b>{content.playerNumberSize ?? 18}px</b></span><input type="range" min={10} max={34} step={1} value={content.playerNumberSize ?? 18} onChange={(event) => onChange({ ...content, playerNumberSize: Number(event.target.value) })} /></label>
      <label className="stacked-field"><span><span className="field-label">Nomes</span><b>{content.playerNameSize ?? 9}px</b></span><input type="range" min={6} max={18} step={1} value={content.playerNameSize ?? 9} onChange={(event) => onChange({ ...content, playerNameSize: Number(event.target.value) })} /></label>
    </Section>
    <Section title="FUNDO">
      <ColorPaletteField label="Cor de fundo" value={content.background ?? "#0a0d0f"} onChange={(background) => onChange({ ...content, background })} opacity={content.backgroundOpacity ?? (content.backgroundMediaUrl ? .08 : 1)} onOpacityChange={(backgroundOpacity) => onChange({ ...content, backgroundOpacity })} />
      <label className="slide-prop-field"><span>Escurecimento</span><input type="range" min={0} max={1} step={.05} value={content.overlayOpacity ?? .62} onChange={(event) => onChange({ ...content, overlayOpacity: Number(event.target.value) })} /></label>
      <MediaUpload name={content.backgroundMediaName} onLoad={(media) => onChange({ ...content, backgroundMediaUrl: media.url, backgroundMediaType: media.type, backgroundMediaName: media.name, backgroundOpacity: content.backgroundMediaUrl ? content.backgroundOpacity : .08 })} onClear={() => onChange({ ...content, backgroundMediaUrl: undefined, backgroundMediaType: undefined, backgroundMediaName: undefined })} />
    </Section>
    <Section title="JOGADORES">
      <p className="property-help">Pode arrastar os jogadores diretamente no campo. Carregue uma fotografia para substituir a silhueta.</p>
      <label className="slide-prop-field"><span>Marca dos esquerdinos</span><select value={content.leftFootMarker ?? "both"} onChange={(event) => onChange({ ...content, leftFootMarker: event.target.value as NonNullable<LineupSlideContent["leftFootMarker"]> })}><option value="foot">Pé esquerdo</option><option value="letter">Letra E</option><option value="both">Pé + letra E</option></select></label>
      <ColorPaletteField label="Cor do pé esquerdo" value={content.leftFootMarkerColor ?? "#efff29"} onChange={(leftFootMarkerColor) => onChange({ ...content, leftFootMarkerColor })} />
      <div className="probable-player-properties">{content.players.map((player) => <div key={player.id}><input aria-label="Número" type="number" min={0} max={999} value={player.number} onChange={(event) => updatePlayer(player.id, { number: Number(event.target.value) })} /><input aria-label="Nome" value={player.name} onChange={(event) => updatePlayer(player.id, { name: event.target.value })} /><label className={`preferred-foot-toggle${player.preferredFoot === "left" ? " active" : ""}`} title="Marcar como esquerdino"><input type="checkbox" checked={player.preferredFoot === "left"} onChange={(event) => updatePlayer(player.id, { preferredFoot: event.target.checked ? "left" : "right" })} /><b>E</b></label><label className={player.photoUrl ? "has-photo" : ""} title="Fotografia do jogador"><ImagePlus size={12} /><input type="file" accept="image/*" onChange={(event) => readImage(event.target.files?.[0], (photoUrl) => updatePlayer(player.id, { photoUrl }), 640)} /></label>{player.photoUrl ? <button type="button" title="Remover fotografia" onClick={() => updatePlayer(player.id, { photoUrl: undefined })}><X size={11} /></button> : <span />}</div>)}</div>
    </Section>
  </>;
}

function TeamOverviewProperties({ content, onChange }: { content: TeamOverviewSlideContent; onChange: (value: TeamOverviewSlideContent) => void }) {
  const systems = content.tacticalSystems ?? [];
  const setTemplate = (template: NonNullable<TeamOverviewSlideContent["template"]>) => {
    const palette = template === "light"
      ? { panelColor: "#f2f3f1", textColor: "#151918", mutedTextColor: "#65706a", accentColor: "#467b2b" }
      : template === "accent"
        ? { panelColor: "#172620", textColor: "#ffffff", mutedTextColor: "#a4b3aa", accentColor: "#f0a227" }
        : { panelColor: "#0d1312", textColor: "#f3f5f4", mutedTextColor: "#87918c", accentColor: "#a3ff12" };
    onChange({ ...content, template, ...palette });
  };
  const updateSystem = (index: number, value: string) => onChange({ ...content, tacticalSystems: systems.map((system, systemIndex) => systemIndex === index ? value : system) });

  return <>
    <Section title="DADOS GERAIS DA EQUIPA">
      <label className="slide-prop-field vertical"><span>Etiqueta</span><input value={content.eyebrow} onChange={(event) => onChange({ ...content, eyebrow: event.target.value })} /></label>
      <label className="slide-prop-field vertical"><span>Nome da equipa</span><input value={content.team} onChange={(event) => onChange({ ...content, team: event.target.value })} /></label>
      <label className="slide-prop-field vertical"><span>Estádio</span><input value={content.stadium} onChange={(event) => onChange({ ...content, stadium: event.target.value })} /></label>
      <label className="slide-prop-field vertical"><span>Dimensões do campo</span><input placeholder="Ex.: 105 × 68 m" value={content.pitchDimensions} onChange={(event) => onChange({ ...content, pitchDimensions: event.target.value })} /></label>
      <label className="slide-prop-field vertical"><span>Meteorologia</span><input value={content.weather} onChange={(event) => onChange({ ...content, weather: event.target.value })} /></label>
      <label className="slide-prop-field vertical"><span>Treinador</span><input value={content.coach} onChange={(event) => onChange({ ...content, coach: event.target.value })} /></label>
    </Section>
    <Section title="ESQUEMAS TÁTICOS">
      <div className="report-edit-list">{systems.map((system, index) => <div className="report-system-row" key={index}><input value={system} placeholder="Ex.: 4-3-3" onChange={(event) => updateSystem(index, event.target.value)} /><button type="button" onClick={() => onChange({ ...content, tacticalSystems: systems.filter((_, systemIndex) => systemIndex !== index) })} title="Remover esquema"><Trash2 size={11} /></button></div>)}</div>
      <button type="button" className="report-add-property" onClick={() => onChange({ ...content, tacticalSystems: [...systems, "Novo esquema"] })}><Plus size={12} /> Adicionar esquema</button>
    </Section>
    <Section title="FOTOGRAFIA DO ESTÁDIO">
      <ImageAssetUpload label="Escolher fotografia" value={content.stadiumImage} maxDimension={1800} onLoad={(stadiumImage) => onChange({ ...content, stadiumImage })} onClear={() => onChange({ ...content, stadiumImage: undefined })} />
      <label className="slide-prop-field"><span>Ajuste</span><select value={content.imageFit} onChange={(event) => onChange({ ...content, imageFit: event.target.value as "cover" | "contain" })}><option value="cover">Preencher</option><option value="contain">Mostrar completa</option></select></label>
      <label className="stacked-field"><span><span className="field-label">Posição horizontal</span><b>{Math.round((content.imagePositionX ?? .5) * 100)}%</b></span><input type="range" min={0} max={1} step={.01} value={content.imagePositionX ?? .5} onChange={(event) => onChange({ ...content, imagePositionX: Number(event.target.value) })} /></label>
      <label className="stacked-field"><span><span className="field-label">Posição vertical</span><b>{Math.round((content.imagePositionY ?? .5) * 100)}%</b></span><input type="range" min={0} max={1} step={.01} value={content.imagePositionY ?? .5} onChange={(event) => onChange({ ...content, imagePositionY: Number(event.target.value) })} /></label>
      <label className="stacked-field"><span><span className="field-label">Largura da fotografia</span><b>{Math.round((content.imageRatio ?? .58) * 100)}%</b></span><input type="range" min={.45} max={.7} step={.01} value={content.imageRatio ?? .58} onChange={(event) => onChange({ ...content, imageRatio: Number(event.target.value) })} /></label>
    </Section>
    <Section title="DESIGN">
      <label className="slide-prop-field"><span>Modelo</span><select value={content.template ?? "reference"} onChange={(event) => setTemplate(event.target.value as NonNullable<TeamOverviewSlideContent["template"]>)}><option value="reference">Escuro · referência</option><option value="light">Claro</option><option value="accent">Cor do clube</option></select></label>
      <ColorPaletteField label="Fundo dos dados" value={content.panelColor ?? "#0d1312"} onChange={(panelColor) => onChange({ ...content, panelColor })} />
      <ColorPaletteField label="Texto principal" value={content.textColor ?? "#f3f5f4"} onChange={(textColor) => onChange({ ...content, textColor })} />
      <ColorPaletteField label="Texto secundário" value={content.mutedTextColor ?? "#87918c"} onChange={(mutedTextColor) => onChange({ ...content, mutedTextColor })} />
      <ColorPaletteField label="Destaque" value={content.accentColor ?? "#a3ff12"} onChange={(accentColor) => onChange({ ...content, accentColor })} />
      <label className="stacked-field"><span><span className="field-label">Nome da equipa</span><b>{content.teamFontSize ?? 54}px</b></span><input type="range" min={30} max={76} step={1} value={content.teamFontSize ?? 54} onChange={(event) => onChange({ ...content, teamFontSize: Number(event.target.value) })} /></label>
      <label className="stacked-field"><span><span className="field-label">Valores</span><b>{content.valueFontSize ?? 20}px</b></span><input type="range" min={13} max={30} step={1} value={content.valueFontSize ?? 20} onChange={(event) => onChange({ ...content, valueFontSize: Number(event.target.value) })} /></label>
    </Section>
  </>;
}

function WrittenReportProperties({ content, onChange }: { content: WrittenReportSlideContent; onChange: (value: WrittenReportSlideContent) => void }) {
  const selectedDiagramMark = content.diagramMarks.find((mark) => mark.id === content.selectedDiagramMarkId);
  const selectedDiagramStrokeWidth = selectedDiagramMark?.strokeWidth ?? (selectedDiagramMark?.type === "arrow" ? .85 : selectedDiagramMark?.type === "zone" ? .65 : .7);
  const selectedPlayer = content.players.find((player) => player.id === content.selectedPlayerId) ?? content.players[0];
  const updateSelectedDiagramMark = (patch: Partial<NonNullable<typeof selectedDiagramMark>>) => {
    if (!selectedDiagramMark) return;
    onChange({ ...content, diagramMarks: content.diagramMarks.map((mark) => mark.id === selectedDiagramMark.id ? { ...mark, ...patch } : mark) });
  };
  const removeSelectedDiagramMark = () => {
    if (!selectedDiagramMark) return;
    onChange({ ...content, selectedDiagramMarkId: undefined, diagramMarks: content.diagramMarks.filter((mark) => mark.id !== selectedDiagramMark.id) });
  };
  const updatePlayer = (patch: Partial<(typeof content.players)[number]>) => {
    if (!selectedPlayer) return;
    onChange({ ...content, selectedPlayerId: selectedPlayer.id, players: content.players.map((player) => player.id === selectedPlayer.id ? { ...player, ...patch } : player) });
  };
  const setDesign = (layoutDesign: NonNullable<WrittenReportSlideContent["layoutDesign"]>) => {
    const preset = layoutDesign === "dark-right"
      ? { panelColor: "#10161a", textColor: "#ffffff", accentColor: "#a3ff12" }
      : layoutDesign === "accent-right"
        ? { panelColor: "#f04b2f", textColor: "#ffffff", accentColor: "#ffffff" }
        : { panelColor: "#ffffff", textColor: "#101010", accentColor: "#f04b2f" };
    onChange({ ...content, layoutDesign, ...preset });
  };

  return <>
    <Section title="TÍTULO, SUBTÍTULO E TEXTO">
      <label className="slide-prop-field vertical"><span>Título</span><input value={content.title ?? content.moment ?? ""} onChange={(event) => onChange({ ...content, title: event.target.value })} /></label>
      <label className="slide-prop-field vertical"><span>Subtítulo</span><input value={content.subtitle ?? content.submoment ?? ""} onChange={(event) => onChange({ ...content, subtitle: event.target.value })} /></label>
      <label className="slide-prop-field vertical"><span>Texto / descrição</span><textarea rows={7} value={content.description} onChange={(event) => onChange({ ...content, description: event.target.value })} /></label>
      <label className="stacked-field"><span><span className="field-label">Tamanho do título</span><b>{content.titleFontSize ?? 44}px</b></span><input type="range" min={24} max={72} step={1} value={content.titleFontSize ?? 44} onChange={(event) => onChange({ ...content, titleFontSize: Number(event.target.value) })} /></label>
      <label className="stacked-field"><span><span className="field-label">Tamanho do subtítulo</span><b>{content.subtitleFontSize ?? 14}px</b></span><input type="range" min={8} max={28} step={1} value={content.subtitleFontSize ?? 14} onChange={(event) => onChange({ ...content, subtitleFontSize: Number(event.target.value) })} /></label>
      <label className="stacked-field"><span><span className="field-label">Tamanho do texto</span><b>{content.bodyFontSize ?? 21}px</b></span><input type="range" min={10} max={38} step={1} value={content.bodyFontSize ?? 21} onChange={(event) => onChange({ ...content, bodyFontSize: Number(event.target.value) })} /></label>
    </Section>
    <Section title="DESIGN">
      <label className="slide-prop-field"><span>Modelo</span><select value={content.layoutDesign === "light-left" ? "light-right" : content.layoutDesign ?? "light-right"} onChange={(event) => setDesign(event.target.value as NonNullable<WrittenReportSlideContent["layoutDesign"]>)}><option value="light-right">Claro · texto à direita</option><option value="dark-right">Escuro · texto à direita</option><option value="accent-right">Cor de destaque · direita</option></select></label>
      <ColorPaletteField label="Fundo da descrição" value={content.panelColor ?? "#ffffff"} onChange={(panelColor) => onChange({ ...content, panelColor })} opacity={content.panelOpacity ?? 1} onOpacityChange={(panelOpacity) => onChange({ ...content, panelOpacity })} />
      <ColorPaletteField label="Cor do texto" value={content.textColor ?? "#101010"} onChange={(textColor) => onChange({ ...content, textColor })} />
      <ColorPaletteField label="Cor de destaque" value={content.accentColor ?? "#f04b2f"} onChange={(accentColor) => onChange({ ...content, accentColor })} />
      <label className="stacked-field"><span><span className="field-label">Largura do campo</span><b>{Math.round((content.fieldRatio ?? .55) * 100)}%</b></span><input type="range" min={.45} max={.72} step={.01} value={content.fieldRatio ?? .55} onChange={(event) => onChange({ ...content, fieldRatio: Number(event.target.value) })} /></label>
    </Section>
    <Section title="CAMPO E EQUIPAS">
      <ColorPaletteField label="Fundo do campo" value={content.pitchColor ?? "#4f78a5"} onChange={(pitchColor) => onChange({ ...content, pitchColor })} />
      <ColorPaletteField label="Linhas do campo" value={content.pitchLineColor ?? "#ffffff"} onChange={(pitchLineColor) => onChange({ ...content, pitchLineColor })} />
      <label className="slide-prop-field"><span>Espessura das linhas</span><div><input type="range" min={1} max={8} step={.5} value={content.pitchLineWidth ?? 4} onChange={(event) => onChange({ ...content, pitchLineWidth: Number(event.target.value) })} /><i>{content.pitchLineWidth ?? 4}px</i></div></label>
      <ColorPaletteField label="Equipa A" value={content.teamColor} onChange={(teamColor) => onChange({ ...content, teamColor })} />
      <ColorPaletteField label="Letras da equipa A" value={content.homeTextColor ?? "#101010"} onChange={(homeTextColor) => onChange({ ...content, homeTextColor })} />
      <ColorPaletteField label="Guarda-redes A" value={content.goalkeeperColor} onChange={(goalkeeperColor) => onChange({ ...content, goalkeeperColor })} />
      <ColorPaletteField label="Equipa B" value={content.awayColor ?? "#112d91"} onChange={(awayColor) => onChange({ ...content, awayColor })} />
      <ColorPaletteField label="Letras da equipa B" value={content.awayTextColor ?? "#ffffff"} onChange={(awayTextColor) => onChange({ ...content, awayTextColor })} />
      <label className="stacked-field"><span><span className="field-label">Tamanho dos jogadores</span><b>{Math.round((content.playerSize ?? .82) * 100)}%</b></span><input type="range" min={.55} max={1.5} step={.05} value={content.playerSize ?? .82} onChange={(event) => onChange({ ...content, playerSize: Number(event.target.value) })} /></label>
      <label className="slide-check-field"><input type="checkbox" checked={content.showBall ?? true} onChange={(event) => onChange({ ...content, showBall: event.target.checked })} /> Mostrar bola</label>
      <p className="property-help">Arraste os 11 jogadores de cada equipa e a bola diretamente no campo. A barra permite adicionar setas, zonas, texto e desenhos livres.</p>
    </Section>
    <Section title="OBJETOS DO CAMPO">
      {selectedDiagramMark ? <>
        <div className="board-selected-mark"><span>Objeto selecionado · {selectedDiagramMark.type}</span><div><button type="button" onClick={() => onChange({ ...content, selectedDiagramMarkId: undefined })} title="Terminar edição"><X size={11} /></button><button type="button" onClick={removeSelectedDiagramMark} title="Eliminar objeto"><Trash2 size={11} /></button></div></div>
        {selectedDiagramMark.type === "text" && <label className="slide-prop-field vertical"><span>Texto</span><input value={selectedDiagramMark.text ?? ""} onChange={(event) => updateSelectedDiagramMark({ text: event.target.value })} /></label>}
        <ColorPaletteField label="Cor" value={selectedDiagramMark.color} onChange={(color) => updateSelectedDiagramMark({ color })} opacity={selectedDiagramMark.opacity ?? 1} onOpacityChange={(opacity) => updateSelectedDiagramMark({ opacity })} />
        {selectedDiagramMark.type === "zone" && <ColorPaletteField label="Preenchimento" value={selectedDiagramMark.fillColor ?? selectedDiagramMark.color} onChange={(fillColor) => updateSelectedDiagramMark({ fillColor })} />}
        {selectedDiagramMark.type === "text"
          ? <label className="slide-prop-field"><span>Tamanho do texto</span><div><input type="range" min={1.5} max={10} step={.25} value={selectedDiagramMark.fontSize ?? 3.5} onChange={(event) => updateSelectedDiagramMark({ fontSize: Number(event.target.value) })} /><i>{selectedDiagramMark.fontSize ?? 3.5}</i></div></label>
          : <><label className="slide-prop-field"><span>Espessura</span><div><input type="range" min={.25} max={3} step={.1} value={selectedDiagramStrokeWidth} onChange={(event) => updateSelectedDiagramMark({ strokeWidth: Number(event.target.value) })} /><i>{selectedDiagramStrokeWidth.toFixed(1)}</i></div></label><label className="slide-check-field"><input type="checkbox" checked={selectedDiagramMark.dashed ?? selectedDiagramMark.type === "zone"} onChange={(event) => updateSelectedDiagramMark({ dashed: event.target.checked })} /> Linha tracejada</label></>}
      </> : <p className="property-help">Escolha o cursor na barra do campo e clique num objeto para o mover, redimensionar ou editar. A ferramenta T permite adicionar texto.</p>}
    </Section>
    <Section title="JOGADOR SELECIONADO">
      <label className="slide-prop-field"><span>Jogador</span><select value={selectedPlayer?.id ?? ""} onChange={(event) => onChange({ ...content, selectedPlayerId: event.target.value })}>{content.players.map((player) => <option key={player.id} value={player.id}>{player.name || `Jogador ${player.number}`} · {player.team === "home" ? "Equipa A" : "Equipa B"}</option>)}</select></label>
      {selectedPlayer && <div className="board-selected-player"><div><input aria-label="Número" type="number" min={0} max={99} value={selectedPlayer.number} onChange={(event) => updatePlayer({ number: Number(event.target.value) })} /><input aria-label="Nome" value={selectedPlayer.name} onChange={(event) => updatePlayer({ name: event.target.value })} /><select aria-label="Equipa" value={selectedPlayer.team} onChange={(event) => updatePlayer({ team: event.target.value as "home" | "away" })}><option value="home">Equipa A</option><option value="away">Equipa B</option></select></div><ColorPaletteField label="Cor individual" value={selectedPlayer.buttonColor ?? (selectedPlayer.team === "home" ? content.teamColor : content.awayColor ?? "#112d91")} onChange={(buttonColor) => updatePlayer({ buttonColor })} /><ColorPaletteField label="Cor das letras" value={selectedPlayer.textColor ?? (selectedPlayer.team === "home" ? content.homeTextColor ?? "#101010" : content.awayTextColor ?? "#ffffff")} onChange={(textColor) => updatePlayer({ textColor })} /><label className="stacked-field"><span><span className="field-label">Tamanho individual</span><b>{Math.round((selectedPlayer.size ?? 1) * 100)}%</b></span><input type="range" min={.6} max={1.7} step={.05} value={selectedPlayer.size ?? 1} onChange={(event) => updatePlayer({ size: Number(event.target.value) })} /></label><button type="button" className="board-reset-player" onClick={() => updatePlayer({ buttonColor: undefined, textColor: undefined, size: undefined })}>Repor design individual</button></div>}
    </Section>
  </>;
}

function MatchPresentationProperties({ content, onChange }: { content: MatchPresentationSlideContent; onChange: (value: MatchPresentationSlideContent) => void }) {
  const setTemplate = (template: NonNullable<MatchPresentationSlideContent["template"]>) => {
    const preset = template === "duel"
      ? { panelOpacity: .68, overlayOpacity: .38, frameColor: "#ffffff", accentColor: "#ffffff" }
      : template === "minimal"
        ? { panelOpacity: .1, overlayOpacity: .4, frameColor: "#ffffff", accentColor: "#a3ff12" }
        : { panelOpacity: .22, overlayOpacity: .12, frameColor: "#ffffff", accentColor: "#ffffff", homePanelColor: "#245b9b", homeSecondaryColor: "#ffffff", awayPanelColor: "#41499e", awaySecondaryColor: "#ef6c32" };
    onChange({ ...content, template, ...preset });
  };

  return <>
    <Section title="CLUBES">
      <label className="slide-prop-field vertical"><span>Clube da casa</span><input value={content.homeClubName} onChange={(event) => onChange({ ...content, homeClubName: event.target.value })} /></label>
      <ImageAssetUpload label="Emblema do clube da casa" value={content.homeCrest} onLoad={(homeCrest) => onChange({ ...content, homeCrest })} onClear={() => onChange({ ...content, homeCrest: undefined })} />
      <label className="slide-prop-field vertical"><span>Clube visitante</span><input value={content.awayClubName} onChange={(event) => onChange({ ...content, awayClubName: event.target.value })} /></label>
      <ImageAssetUpload label="Emblema do clube visitante" value={content.awayCrest} onLoad={(awayCrest) => onChange({ ...content, awayCrest })} onClear={() => onChange({ ...content, awayCrest: undefined })} />
    </Section>
    <Section title="JOGO">
      <label className="slide-prop-field vertical"><span>Competição</span><input value={content.competitionName} onChange={(event) => onChange({ ...content, competitionName: event.target.value })} /></label>
      <ImageAssetUpload label="Logótipo da competição" value={content.competitionLogo} onLoad={(competitionLogo) => onChange({ ...content, competitionLogo })} onClear={() => onChange({ ...content, competitionLogo: undefined })} />
      <label className="slide-prop-field vertical"><span>Jornada</span><input value={content.matchday} onChange={(event) => onChange({ ...content, matchday: event.target.value })} /></label>
      <div className="report-property-pair"><label><span>Data</span><input value={content.matchDate} placeholder="09 AGOSTO" onChange={(event) => onChange({ ...content, matchDate: event.target.value })} /></label><label><span>Hora</span><input value={content.matchTime} placeholder="15:30" onChange={(event) => onChange({ ...content, matchTime: event.target.value })} /></label></div>
    </Section>
    <Section title="FOTO OU VÍDEO DE FUNDO">
      <MediaUpload name={content.backgroundMediaName} onLoad={(media) => onChange({ ...content, backgroundMediaUrl: media.url, backgroundMediaType: media.type, backgroundMediaName: media.name })} onClear={() => onChange({ ...content, backgroundMediaUrl: undefined, backgroundMediaType: undefined, backgroundMediaName: undefined })} />
      <label className="slide-prop-field"><span>Ajuste</span><select value={content.backgroundFit ?? "cover"} onChange={(event) => onChange({ ...content, backgroundFit: event.target.value as "cover" | "contain" })}><option value="cover">Preencher</option><option value="contain">Mostrar completo</option></select></label>
      <label className="stacked-field"><span><span className="field-label">Posição horizontal</span><b>{Math.round((content.backgroundPositionX ?? .5) * 100)}%</b></span><input type="range" min={0} max={1} step={.01} value={content.backgroundPositionX ?? .5} onChange={(event) => onChange({ ...content, backgroundPositionX: Number(event.target.value) })} /></label>
      <label className="stacked-field"><span><span className="field-label">Posição vertical</span><b>{Math.round((content.backgroundPositionY ?? .5) * 100)}%</b></span><input type="range" min={0} max={1} step={.01} value={content.backgroundPositionY ?? .5} onChange={(event) => onChange({ ...content, backgroundPositionY: Number(event.target.value) })} /></label>
    </Section>
    <Section title="DESIGN">
      <label className="slide-prop-field"><span>Template</span><select value={content.template ?? "broadcast"} onChange={(event) => setTemplate(event.target.value as NonNullable<MatchPresentationSlideContent["template"]>)}><option value="broadcast">Broadcast · referência</option><option value="duel">Duelo · painéis fortes</option><option value="minimal">Minimal · emblemas livres</option></select></label>
      <ColorPaletteField label="Faixa superior esquerda" value={content.homePanelColor ?? "#245b9b"} onChange={(homePanelColor) => onChange({ ...content, homePanelColor })} />
      <ColorPaletteField label="Faixa inferior esquerda" value={content.homeSecondaryColor ?? "#ffffff"} onChange={(homeSecondaryColor) => onChange({ ...content, homeSecondaryColor })} />
      <ColorPaletteField label="Nome do clube da casa" value={content.homeTextColor ?? "#ffffff"} onChange={(homeTextColor) => onChange({ ...content, homeTextColor })} />
      <ColorPaletteField label="Faixa superior direita" value={content.awayPanelColor ?? "#41499e"} onChange={(awayPanelColor) => onChange({ ...content, awayPanelColor })} />
      <ColorPaletteField label="Faixa inferior direita" value={content.awaySecondaryColor ?? "#ef6c32"} onChange={(awaySecondaryColor) => onChange({ ...content, awaySecondaryColor })} />
      <ColorPaletteField label="Nome do clube visitante" value={content.awayTextColor ?? "#ffffff"} onChange={(awayTextColor) => onChange({ ...content, awayTextColor })} />
      <ColorPaletteField label="Informação do jogo" value={content.informationTextColor ?? "#ffffff"} onChange={(informationTextColor) => onChange({ ...content, informationTextColor })} />
      <ColorPaletteField label="Fundo da competição" value={content.competitionPanelColor ?? "#ffffff"} onChange={(competitionPanelColor) => onChange({ ...content, competitionPanelColor })} />
      <ColorPaletteField label="Texto da competição" value={content.competitionTextColor ?? "#203b2d"} onChange={(competitionTextColor) => onChange({ ...content, competitionTextColor })} />
      <ColorPaletteField label="Destaques" value={content.accentColor ?? "#ffffff"} onChange={(accentColor) => onChange({ ...content, accentColor })} />
      <ColorPaletteField label="Moldura" value={content.frameColor ?? "#ffffff"} onChange={(frameColor) => onChange({ ...content, frameColor })} />
      <ColorPaletteField label="Escurecimento do fundo" value={content.overlayColor ?? "#071018"} onChange={(overlayColor) => onChange({ ...content, overlayColor })} opacity={content.overlayOpacity ?? .12} onOpacityChange={(overlayOpacity) => onChange({ ...content, overlayOpacity })} />
      <label className="stacked-field"><span><span className="field-label">Opacidade dos painéis</span><b>{Math.round((content.panelOpacity ?? .22) * 100)}%</b></span><input type="range" min={0} max={1} step={.02} value={content.panelOpacity ?? .22} onChange={(event) => onChange({ ...content, panelOpacity: Number(event.target.value) })} /></label>
      <label className="stacked-field"><span><span className="field-label">Tamanho dos emblemas</span><b>{Math.round((content.crestScale ?? 1) * 100)}%</b></span><input type="range" min={.55} max={1.45} step={.05} value={content.crestScale ?? 1} onChange={(event) => onChange({ ...content, crestScale: Number(event.target.value) })} /></label>
    </Section>
  </>;
}

function BoardProperties({ content, onChange }: { content: BoardSlideContent; onChange: (value: BoardSlideContent) => void }) {

  const movements = content.movements ?? [];
  const activeMovement = movements.find((movement) => movement.id === content.activeMovementId);
  const stageMarks = activeMovement?.marks ?? content.tacticalMarks ?? [];
  const selectedMark = stageMarks.find((mark) => mark.id === content.selectedMarkId);
  const selectedPlayer = content.players.find((player) => player.id === content.selectedPlayerId) ?? content.players[0];
  const updateStageMarks = (marks: typeof stageMarks, selectedMarkId = content.selectedMarkId) => {
    if (activeMovement) {
      onChange({ ...content, selectedMarkId, movements: movements.map((movement) => movement.id === activeMovement.id ? { ...movement, marks } : movement) });
      return;
    }
    onChange({ ...content, selectedMarkId, tacticalMarks: marks });
  };
  const updateSelectedMark = (patch: Partial<NonNullable<typeof selectedMark>>) => {
    if (!selectedMark) return;
    updateStageMarks(stageMarks.map((mark) => mark.id === selectedMark.id ? { ...mark, ...patch } : mark), selectedMark.id);
  };
  const removeSelectedMark = () => {
    if (!selectedMark) return;
    updateStageMarks(stageMarks.filter((mark) => mark.id !== selectedMark.id), undefined);
  };
  const updatePlayer = (patch: Partial<(typeof content.players)[number]>) => {
    if (!selectedPlayer) return;
    onChange({ ...content, selectedPlayerId: selectedPlayer.id, players: content.players.map((player) => player.id === selectedPlayer.id ? { ...player, ...patch } : player) });
  };
  const lastMovement = movements.at(-1);
  const addMovement = () => {
    const id = createId();
    const sourcePositions = lastMovement?.playerPositions ?? Object.fromEntries(content.players.map((player) => [player.id, player.position]));
    const sourceMarks = lastMovement?.marks ?? content.tacticalMarks ?? [];
    onChange({
      ...content,
      activeMovementId: id,
      movements: [...movements, {
        id,
        name: `Movimento ${movements.length + 1}`,
        playerPositions: Object.fromEntries(content.players.map((player) => [player.id, sourcePositions[player.id] ?? player.position])),
        ballPosition: lastMovement?.ballPosition ?? content.ballPosition ?? { x: .5, y: .5 },
        marks: sourceMarks.map((mark) => ({ ...mark, points: mark.points.map((point) => ({ ...point })) })),
      }],
    });
  };
  const updateMovement = (id: string, patch: Partial<(typeof movements)[number]>) => onChange({ ...content, movements: movements.map((movement) => movement.id === id ? { ...movement, ...patch } : movement) });
  const removeMovement = (id: string) => {
    const index = movements.findIndex((movement) => movement.id === id);
    const next = movements.filter((movement) => movement.id !== id);
    const nextActive = content.activeMovementId === id ? next[Math.max(0, index - 1)]?.id : content.activeMovementId;
    onChange({ ...content, movements: next, activeMovementId: nextActive });
  };
  const moveMovement = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= movements.length) return;
    const next = [...movements];
    [next[index], next[target]] = [next[target], next[index]];
    onChange({ ...content, movements: next });
  };
  const addPlayer = () => {
    const player = { id: createId(), number: content.players.length + 1, name: "NOVO", team: "home" as const, position: { x: .5, y: .5 } };
    onChange({ ...content, players: [...content.players, player], selectedPlayerId: player.id });
  };
  const removeSelectedPlayer = () => {
    if (!selectedPlayer || content.players.filter((player) => player.team === selectedPlayer.team).length <= 11) return;
    const players = content.players.filter((player) => player.id !== selectedPlayer.id);
    const nextMovements = movements.map((movement) => ({ ...movement, playerPositions: Object.fromEntries(Object.entries(movement.playerPositions).filter(([playerId]) => playerId !== selectedPlayer.id)) }));
    onChange({ ...content, players, movements: nextMovements, selectedPlayerId: players[0]?.id });
  };

  return <>
    <Section title="CAMPO E EQUIPAS">
      <ColorPaletteField label="Fundo do campo" value={content.pitchColor ?? "#4f78a5"} onChange={(pitchColor) => onChange({ ...content, pitchColor })} />
      <ColorPaletteField label="Linhas do campo" value={content.pitchLineColor ?? "#ffffff"} onChange={(pitchLineColor) => onChange({ ...content, pitchLineColor })} />
      <label className="slide-prop-field"><span>Espessura das linhas</span><div><input type="range" min={1} max={8} step={.5} value={content.pitchLineWidth ?? 4} onChange={(event) => onChange({ ...content, pitchLineWidth: Number(event.target.value) })} /><i>{content.pitchLineWidth ?? 4}px</i></div></label>
      <ColorPaletteField label="Botões equipa A" value={content.homeColor} onChange={(homeColor) => onChange({ ...content, homeColor })} />
      <ColorPaletteField label="Letras equipa A" value={content.homeTextColor ?? "#101010"} onChange={(homeTextColor) => onChange({ ...content, homeTextColor })} />
      <ColorPaletteField label="Botões equipa B" value={content.awayColor} onChange={(awayColor) => onChange({ ...content, awayColor })} />
      <ColorPaletteField label="Letras equipa B" value={content.awayTextColor ?? "#ffffff"} onChange={(awayTextColor) => onChange({ ...content, awayTextColor })} />
      <label className="slide-prop-field"><span>Tamanho dos botões</span><div><input type="range" min={.65} max={1.6} step={.05} value={content.playerSize ?? 1} onChange={(event) => onChange({ ...content, playerSize: Number(event.target.value) })} /><i>{Math.round((content.playerSize ?? 1) * 100)}%</i></div></label>
      <label className="slide-check-field"><input type="checkbox" checked={content.showBall ?? true} onChange={(event) => onChange({ ...content, showBall: event.target.checked })} /> Mostrar bola</label>
    </Section>

    <Section title="JOGADORES / BOTÕES">
      <div className="board-player-actions"><select value={selectedPlayer?.id ?? ""} onChange={(event) => onChange({ ...content, selectedPlayerId: event.target.value })}>{content.players.map((player) => <option key={player.id} value={player.id}>{player.name || `Jogador ${player.number}`} · {player.team === "home" ? "A" : "B"}</option>)}</select><button type="button" onClick={addPlayer} title="Adicionar jogador"><Plus size={12} /></button><button type="button" onClick={removeSelectedPlayer} disabled={!selectedPlayer || content.players.filter((player) => player.team === selectedPlayer.team).length <= 11} title="Remover jogador"><Trash2 size={12} /></button></div>
      {selectedPlayer && <div className="board-selected-player">
        <div><input type="number" min={0} max={99} value={selectedPlayer.number} onChange={(event) => updatePlayer({ number: Number(event.target.value) })} /><input value={selectedPlayer.name} onChange={(event) => updatePlayer({ name: event.target.value })} /><select value={selectedPlayer.team} onChange={(event) => updatePlayer({ team: event.target.value as "home" | "away" })}><option value="home">Equipa A</option><option value="away">Equipa B</option></select></div>
        <ColorPaletteField label="Cor deste botão" value={selectedPlayer.buttonColor ?? (selectedPlayer.team === "home" ? content.homeColor : content.awayColor)} onChange={(buttonColor) => updatePlayer({ buttonColor })} />
        <ColorPaletteField label="Cor destas letras" value={selectedPlayer.textColor ?? (selectedPlayer.team === "home" ? content.homeTextColor ?? "#101010" : content.awayTextColor ?? "#ffffff")} onChange={(textColor) => updatePlayer({ textColor })} />
        <label className="slide-prop-field"><span>Tamanho individual</span><div><input type="range" min={.6} max={1.7} step={.05} value={selectedPlayer.size ?? 1} onChange={(event) => updatePlayer({ size: Number(event.target.value) })} /><i>{Math.round((selectedPlayer.size ?? 1) * 100)}%</i></div></label>
        {(selectedPlayer.buttonColor || selectedPlayer.textColor || selectedPlayer.size) && <button type="button" className="board-reset-player" onClick={() => updatePlayer({ buttonColor: undefined, textColor: undefined, size: undefined })}>Usar estilo da equipa</button>}
      </div>}
    </Section>

    <Section title="MOVIMENTOS">
      <p className="property-help">Escolha uma etapa e mova os jogadores ou a bola no campo. A apresentação anima automaticamente entre as posições.</p>
      <div className="board-movement-list"><button type="button" className={!activeMovement ? "active" : ""} onClick={() => onChange({ ...content, activeMovementId: undefined })}><span>0</span><strong>Formação inicial</strong></button>{movements.map((movement, index) => <div key={movement.id} className={movement.id === content.activeMovementId ? "active" : ""}><button type="button" onClick={() => onChange({ ...content, activeMovementId: movement.id })}><span>{index + 1}</span><strong>{movement.name}</strong></button><button type="button" onClick={() => moveMovement(index, -1)} disabled={index === 0} title="Mover etapa para cima">↑</button><button type="button" onClick={() => moveMovement(index, 1)} disabled={index === movements.length - 1} title="Mover etapa para baixo">↓</button><button type="button" onClick={() => removeMovement(movement.id)} title="Remover movimento"><Trash2 size={10} /></button></div>)}</div>
      {activeMovement && <label className="slide-prop-field vertical"><span>Nome da etapa</span><input value={activeMovement.name} onChange={(event) => updateMovement(activeMovement.id, { name: event.target.value })} /></label>}
      <button type="button" className="report-add-property" onClick={addMovement}><Plus size={12} /> Adicionar movimento</button>
      <label className="slide-prop-field"><span>Tempo do movimento</span><div><input type="number" min={.15} max={10} step={.1} value={content.movementDuration ?? 1.2} onChange={(event) => onChange({ ...content, movementDuration: Math.max(.15, Number(event.target.value)) })} /><i>s</i></div></label>
      <label className="slide-prop-field"><span>Pausa entre etapas</span><div><input type="number" min={0} max={10} step={.1} value={content.movementHoldDuration ?? .65} onChange={(event) => onChange({ ...content, movementHoldDuration: Math.max(0, Number(event.target.value)) })} /><i>s</i></div></label>
    </Section>

    <Section title="OBJETOS TÁTICOS 2D">
      {selectedMark && <div className="board-selected-mark">
        <span>Objeto selecionado · {selectedMark.type}</span>
        <div><button type="button" onClick={() => onChange({ ...content, selectedMarkId: undefined })} title="Terminar edição"><X size={11} /></button><button type="button" onClick={removeSelectedMark} title="Eliminar objeto"><Trash2 size={11} /></button></div>
      </div>}
      {selectedMark?.type === "text" && <label className="slide-prop-field vertical"><span>Texto</span><input value={selectedMark.text ?? ""} onChange={(event) => updateSelectedMark({ text: event.target.value })} /></label>}
      <ColorPaletteField label="Traço" value={selectedMark?.color ?? content.markColor ?? "#fff23d"} onChange={(color) => selectedMark ? updateSelectedMark({ color }) : onChange({ ...content, markColor: color })} />
      <ColorPaletteField label="Preenchimento" value={selectedMark?.fillColor ?? content.markFillColor ?? "#fff23d"} onChange={(fillColor) => selectedMark ? updateSelectedMark({ fillColor }) : onChange({ ...content, markFillColor: fillColor })} opacity={selectedMark?.opacity ?? content.markOpacity ?? 1} onOpacityChange={(opacity) => selectedMark ? updateSelectedMark({ opacity }) : onChange({ ...content, markOpacity: opacity })} />
      <label className="slide-prop-field"><span>Espessura</span><div><input type="range" min={1} max={16} step={1} value={selectedMark?.strokeWidth ?? content.markStrokeWidth ?? 5} onChange={(event) => selectedMark ? updateSelectedMark({ strokeWidth: Number(event.target.value) }) : onChange({ ...content, markStrokeWidth: Number(event.target.value) })} /><i>{selectedMark?.strokeWidth ?? content.markStrokeWidth ?? 5}px</i></div></label>
      <label className="slide-check-field"><input type="checkbox" checked={selectedMark?.dashed ?? content.markDashed ?? false} onChange={(event) => selectedMark ? updateSelectedMark({ dashed: event.target.checked }) : onChange({ ...content, markDashed: event.target.checked })} /> Linha tracejada</label>
      <p className="property-help">Use a barra sobre o campo para criar objetos. Com a seta selecionada, clique num objeto para o mover, alterar o tamanho pelos pontos verdes ou editar as propriedades aqui.</p>
    </Section>
  </>;
}

function ImageProperties({ content, onChange }: { content: ImageSlideContent; onChange: (value: ImageSlideContent) => void }) {
  return <Section title="IMAGEM"><label className="upload-property primary"><ImagePlus size={14} /> Escolher imagem<input type="file" accept="image/*" onChange={(event) => readImage(event.target.files?.[0], (imageDataUrl) => onChange({ ...content, imageDataUrl }))} /></label><label className="slide-prop-field"><span>Ajuste</span><select value={content.fit} onChange={(event) => onChange({ ...content, fit: event.target.value as "contain" | "cover" })}><option value="contain">Conter</option><option value="cover">Preencher</option></select></label></Section>;
}

function readImage(file: File | undefined, onLoad: (value: string) => void, maxDimension = 1600) {
  if (!file) return;
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    if (typeof reader.result !== "string") return;
    const original = reader.result;
    const image = new Image();
    image.addEventListener("load", () => {
      const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) { onLoad(original); return; }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      try { onLoad(canvas.toDataURL("image/webp", .88)); }
      catch { onLoad(original); }
    }, { once: true });
    image.addEventListener("error", () => onLoad(original), { once: true });
    image.src = original;
  });
  reader.readAsDataURL(file);
}

function readMedia(file: File | undefined, onLoad: (value: { url: string; type: "image" | "video"; name: string }) => void) {
  if (!file) return;
  if (file.type.startsWith("video/")) {
    onLoad({ url: URL.createObjectURL(file), type: "video", name: file.name });
    return;
  }
  readImage(file, (url) => onLoad({ url, type: "image", name: file.name }));
}
