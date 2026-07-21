export type CADTool =
  | 'select'
  | 'line'
  | 'rectangle'
  | 'circle'
  | 'polygon'
  | 'text'
  | 'dimension'
  | 'pan';

export type ShapeType = 'line' | 'rectangle' | 'circle' | 'polygon' | 'text' | 'dimension';

export type LineDash = 'solid' | 'dashed' | 'dotted' | 'dash-dot';

export type ArrowType = 'none' | 'start' | 'end' | 'both';

export interface Point {
  x: number;
  y: number;
}

export interface CADLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  order: number;
}

export interface BaseShape {
  id: string;
  type: ShapeType;
  position: Point;
  rotation: number;
  layerId: string;
  stroke: string;
  fill: string;
  strokeWidth: number;
  opacity: number;
  locked: boolean;
  visible: boolean;
  selected: boolean;
  lineDash: LineDash;
}

export interface LineShape extends BaseShape {
  type: 'line';
  points: number[];
  arrowType: ArrowType;
}

export interface RectangleShape extends BaseShape {
  type: 'rectangle';
  width: number;
  height: number;
}

export interface CircleShape extends BaseShape {
  type: 'circle';
  radius: number;
}

export interface PolygonShape extends BaseShape {
  type: 'polygon';
  radius: number;
  sides: number;
}

export interface TextShape extends BaseShape {
  type: 'text';
  text: string;
  fontSize: number;
  fontFamily: string;
}

export interface DimensionShape extends BaseShape {
  type: 'dimension';
  start: Point;
  end: Point;
  offset: number;
  label: string;
}

export type CADShape = LineShape | RectangleShape | CircleShape | PolygonShape | TextShape | DimensionShape;

export interface CanvasTransform {
  x: number;
  y: number;
  scale: number;
}

export interface GridSettings {
  visible: boolean;
  size: number;
  majorSize: number;
  snapToGrid: boolean;
}

export interface SnapSettings {
  enabled: boolean;
  grid: boolean;
  endpoints: boolean;
  midpoints: boolean;
  center: boolean;
  intersection: boolean;
}

export interface HistoryEntry {
  id: string;
  timestamp: number;
  shapes: CADShape[];
  description: string;
}

export interface CADClipboard {
  shapes: CADShape[];
  timestamp: number;
}

export const DEFAULT_GRID: GridSettings = {
  visible: true,
  size: 10,
  majorSize: 100,
  snapToGrid: true,
};

export const DEFAULT_SNAP: SnapSettings = {
  enabled: true,
  grid: true,
  endpoints: true,
  midpoints: true,
  center: true,
  intersection: true,
};

export const DEFAULT_LAYER: CADLayer = {
  id: 'layer-default',
  name: 'Layer 1',
  visible: true,
  locked: false,
  opacity: 1,
  order: 0,
};

export const DEFAULT_STYLES = {
  stroke: '#1e293b',
  fill: 'transparent',
  strokeWidth: 2,
  lineDash: 'solid' as LineDash,
  arrowType: 'none' as ArrowType,
};

export const TOOL_SHORTCUTS: Record<string, CADTool> = {
  v: 'select',
  l: 'line',
  r: 'rectangle',
  c: 'circle',
  p: 'polygon',
  t: 'text',
  d: 'dimension',
  ' ': 'pan',
};

export const LINE_DASH_MAP: Record<LineDash, number[]> = {
  solid: [],
  dashed: [12, 6],
  dotted: [2, 4],
  'dash-dot': [12, 4, 2, 4],
};

export const FONT_FAMILIES = [
  'Arial',
  'Helvetica',
  'Times New Roman',
  'Courier New',
  'Georgia',
  'Verdana',
  'monospace',
];
