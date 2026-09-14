import type { DrawingObject, Point } from "./drawing";

export type SlideType = "title" | "text" | "lineup" | "video" | "kickoff" | "tactical-board" | "image";
export type SlideAlignment = "left" | "center" | "right";

export interface SlidePlayer {
  id: string;
  number: number;
  name: string;
  team: "home" | "away";
  position: Point;
}

export interface TitleSlideContent {
  kind: "title";
  text: string;
  subtitle: string;
  body: string;
  background: string;
  backgroundImage?: string;
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
}

export interface VideoSlideContent {
  kind: "video";
  fileName: string;
  sourceUrl?: string;
  startTime: number;
  endTime?: number;
  thumbnail?: string;
  drawings: DrawingObject[];
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

export type SlideContent = TitleSlideContent | TextSlideContent | LineupSlideContent | VideoSlideContent | BoardSlideContent | ImageSlideContent;

export interface AnalysisSlide {
  id: string;
  type: SlideType;
  name: string;
  title?: string;
  subtitle?: string;
  question: string;
  duration: number;
  content: SlideContent;
}
