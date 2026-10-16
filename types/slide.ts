import type { DrawingObject, PlayerTrack, Point } from "./drawing";

export type SlideType = "title" | "text" | "lineup" | "written-report" | "video" | "kickoff" | "tactical-board" | "image";
export type SlideAlignment = "left" | "center" | "right";
export type SlideBackgroundMediaType = "image" | "video";
export type CrestCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export type LineupTemplate = "broadcast" | "glass" | "tactical";

export interface SlidePlayer {
  id: string;
  number: number;
  name: string;
  team: "home" | "away";
  position: Point;
  photoUrl?: string;
}

export interface TitleSlideContent {
  kind: "title";
  text: string;
  subtitle: string;
  body: string;
  background: string;
  backgroundImage?: string;
  backgroundMediaUrl?: string;
  backgroundMediaType?: SlideBackgroundMediaType;
  backgroundMediaName?: string;
  backgroundOpacity?: number;
  overlayOpacity?: number;
  accentColor?: string;
  crestImage?: string;
  crestCorner?: CrestCorner;
  alignment: SlideAlignment;
  fontSize: number;
}

export interface TextSlideContent {
  kind: "text";
  text: string;
  title: string;
  background: string;
  backgroundImage?: string;
  alignment: SlideAlignment;
  fontSize: number;
  position: Point;
}

export interface LineupSlideContent {
  kind: "lineup";
  formation: string;
  players: SlidePlayer[];
  teamColor: string;
  goalkeeperColor: string;
  title: string;
  subtitle: string;
  clubName?: string;
  clubCrest?: string;
  coachName?: string;
  coachPhoto?: string;
  template?: LineupTemplate;
  background?: string;
  backgroundMediaUrl?: string;
  backgroundMediaType?: SlideBackgroundMediaType;
  backgroundMediaName?: string;
  backgroundOpacity?: number;
  overlayOpacity?: number;
}

export interface ReportCustomField {
  id: string;
  label: string;
  value: string;
}

export interface ReportDiagramMark {
  id: string;
  type: "arrow" | "zone" | "free";
  points: Point[];
  color: string;
}

export interface WrittenReportSlideContent {
  kind: "written-report";
  team: string;
  matchday: string;
  matchDate: string;
  stadium: string;
  pitchDimensions: string;
  weather: string;
  coach: string;
  generalFields: ReportCustomField[];
  tacticalSystems: string[];
  formation: string;
  players: SlidePlayer[];
  teamColor: string;
  goalkeeperColor: string;
  moment: string;
  submoment: string;
  description: string;
  diagramMarks: ReportDiagramMark[];
}

export interface VideoSlideContent {
  kind: "video";
  fileName: string;
  mediaAssetId?: string;
  sourceUrl?: string;
  startTime: number;
  endTime?: number;
  thumbnail?: string;
  drawings: DrawingObject[];
  playerTracks?: PlayerTrack[];
  freezeFrames?: FreezeFrame[];
}

export interface FreezeFrame {
  id: string;
  sourceTime: number;
  duration: number;
}

export interface BoardSlideContent {
  kind: "kickoff" | "tactical-board";
  players: SlidePlayer[];
  homeColor: string;
  awayColor: string;
  title: string;
  boardObjects: DrawingObject[];
}

export interface ImageSlideContent {
  kind: "image";
  imageDataUrl?: string;
  fit: "contain" | "cover";
  drawings: DrawingObject[];
}

export type SlideContent = TitleSlideContent | TextSlideContent | LineupSlideContent | WrittenReportSlideContent | VideoSlideContent | BoardSlideContent | ImageSlideContent;

export interface AnalysisSlide {
  id: string;
  type: SlideType;
  name: string;
  title?: string;
  subtitle?: string;
  caption: string;
  captionOpacity?: number;
  /** Kept only while old saved projects are migrated on load. */
  question?: string;
  duration: number;
  content: SlideContent;
}
