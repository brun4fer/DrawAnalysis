import type { DrawingObject, PlayerTrack, Point } from "./drawing";

export type SlideType = "title" | "text" | "lineup" | "team-overview" | "written-report" | "video" | "kickoff" | "tactical-board" | "image";
export type SlideAlignment = "left" | "center" | "right";
export type SlideBackgroundMediaType = "image" | "video";
export type CrestCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export type LineupTemplate = "broadcast" | "glass" | "tactical";
export type LeftFootMarker = "letter" | "foot" | "both";
export type WrittenReportLayout = "light-right" | "dark-right" | "accent-right" | "light-left";
export type TeamOverviewTemplate = "reference" | "light" | "accent";
export type MatchPresentationTemplate = "broadcast" | "duel" | "minimal";

export interface SlidePlayer {
  id: string;
  number: number;
  name: string;
  team: "home" | "away";
  position: Point;
  photoUrl?: string;
  preferredFoot?: "right" | "left";
  buttonColor?: string;
  textColor?: string;
  size?: number;
}

export type TacticalBoardMarkType = "arrow" | "line" | "circle" | "rectangle" | "zone" | "free" | "text";

export interface TacticalBoardMark {
  id: string;
  type: TacticalBoardMarkType;
  points: Point[];
  color: string;
  fillColor: string;
  strokeWidth: number;
  opacity: number;
  dashed?: boolean;
  text?: string;
}

export interface TacticalMovement {
  id: string;
  name: string;
  playerPositions: Record<string, Point>;
  ballPosition: Point;
  marks: TacticalBoardMark[];
}

export interface CaptionSegment {
  id: string;
  text: string;
  color: string;
  bold?: boolean;
}

export type BoardLegendSegment = CaptionSegment;

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
  subtitleFontSize?: number;
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
  tacticalSystems?: string[];
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
  panelOpacity?: number;
  frameColor?: string;
  pitchColor?: string;
  playerNumberSize?: number;
  playerNameSize?: number;
  playerPhotoScale?: number;
  playerCardScale?: number;
  panelScale?: number;
  miniPlayerColor?: string;
  miniPlayerScale?: number;
  lineupLabelFontSize?: number;
  headerBackgroundColor?: string;
  headerTextColor?: string;
  leftFootMarker?: LeftFootMarker;
  leftFootMarkerColor?: string;
}

export interface ReportCustomField {
  id: string;
  label: string;
  value: string;
}

export interface ReportDiagramMark {
  id: string;
  type: "arrow" | "zone" | "free" | "text";
  points: Point[];
  color: string;
  fillColor?: string;
  strokeWidth?: number;
  opacity?: number;
  dashed?: boolean;
  text?: string;
  fontSize?: number;
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
  title?: string;
  subtitle?: string;
  layoutDesign?: WrittenReportLayout;
  awayColor?: string;
  homeTextColor?: string;
  awayTextColor?: string;
  pitchColor?: string;
  pitchLineColor?: string;
  pitchLineWidth?: number;
  panelColor?: string;
  textColor?: string;
  accentColor?: string;
  panelOpacity?: number;
  fieldRatio?: number;
  titleFontSize?: number;
  subtitleFontSize?: number;
  bodyFontSize?: number;
  playerSize?: number;
  ballPosition?: Point;
  showBall?: boolean;
  selectedDiagramMarkId?: string;
  selectedPlayerId?: string;
}

export interface TeamOverviewSlideContent {
  kind: "team-overview";
  eyebrow: string;
  team: string;
  stadium: string;
  pitchDimensions: string;
  weather: string;
  coach: string;
  tacticalSystems: string[];
  stadiumImage?: string;
  imageFit: "cover" | "contain";
  imagePositionX?: number;
  imagePositionY?: number;
  template?: TeamOverviewTemplate;
  panelColor?: string;
  textColor?: string;
  mutedTextColor?: string;
  accentColor?: string;
  imageRatio?: number;
  teamFontSize?: number;
  valueFontSize?: number;
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

export interface MatchPresentationSlideContent {
  kind: "kickoff";
  homeClubName: string;
  awayClubName: string;
  homeCrest?: string;
  awayCrest?: string;
  competitionName: string;
  competitionLogo?: string;
  matchday: string;
  matchDate: string;
  matchTime: string;
  backgroundMediaUrl?: string;
  backgroundMediaType?: SlideBackgroundMediaType;
  backgroundMediaName?: string;
  backgroundFit?: "cover" | "contain";
  backgroundPositionX?: number;
  backgroundPositionY?: number;
  template?: MatchPresentationTemplate;
  homePanelColor?: string;
  homeSecondaryColor?: string;
  awayPanelColor?: string;
  awaySecondaryColor?: string;
  homeTextColor?: string;
  awayTextColor?: string;
  informationTextColor?: string;
  competitionPanelColor?: string;
  competitionTextColor?: string;
  accentColor?: string;
  frameColor?: string;
  overlayColor?: string;
  overlayOpacity?: number;
  panelOpacity?: number;
  crestScale?: number;
  designVersion?: number;
}

export interface BoardSlideContent {
  kind: "tactical-board";
  players: SlidePlayer[];
  homeColor: string;
  awayColor: string;
  title: string;
  boardObjects: DrawingObject[];
  homeTextColor?: string;
  awayTextColor?: string;
  pitchColor?: string;
  pitchLineColor?: string;
  pitchLineWidth?: number;
  playerSize?: number;
  ballPosition?: Point;
  showBall?: boolean;
  legendSegments?: BoardLegendSegment[];
  legendBackgroundColor?: string;
  legendOpacity?: number;
  legendFontSize?: number;
  legendHeight?: number;
  tacticalMarks?: TacticalBoardMark[];
  movements?: TacticalMovement[];
  activeMovementId?: string;
  selectedMarkId?: string;
  selectedPlayerId?: string;
  movementDuration?: number;
  movementHoldDuration?: number;
  markColor?: string;
  markFillColor?: string;
  markStrokeWidth?: number;
  markOpacity?: number;
  markDashed?: boolean;
}

export interface ImageSlideContent {
  kind: "image";
  imageDataUrl?: string;
  fit: "contain" | "cover";
  drawings: DrawingObject[];
}

export type SlideContent = TitleSlideContent | TextSlideContent | LineupSlideContent | TeamOverviewSlideContent | WrittenReportSlideContent | VideoSlideContent | MatchPresentationSlideContent | BoardSlideContent | ImageSlideContent;

export interface AnalysisSlide {
  id: string;
  type: SlideType;
  name: string;
  title?: string;
  subtitle?: string;
  caption: string;
  captionOpacity?: number;
  captionBackgroundColor?: string;
  captionTextColor?: string;
  captionSegments?: CaptionSegment[];
  captionFontSize?: number;
  captionHeight?: number;
  captionPositionY?: number;
  /** Kept only while old saved projects are migrated on load. */
  question?: string;
  duration: number;
  content: SlideContent;
}
