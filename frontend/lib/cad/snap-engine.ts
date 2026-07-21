import type { Point, CADShape, SnapSettings } from '@/types/cad';
import { getShapeEndpoints, getShapeCenter } from './geometry';

export interface SnapPoint {
  x: number;
  y: number;
  type: 'endpoint' | 'midpoint' | 'center' | 'grid' | 'intersection';
  sourceShapeId?: string;
}

export interface SnapResult {
  point: Point;
  snapLines: { x1: number; y1: number; x2: number; y2: number }[];
  snapType: string;
}

export function collectSnapPoints(shapes: CADShape[], settings: SnapSettings): SnapPoint[] {
  const points: SnapPoint[] = [];

  for (const shape of shapes) {
    if (settings.endpoints) {
      const endpoints = getShapeEndpoints(shape);
      for (const pt of endpoints) {
        points.push({ x: pt.x, y: pt.y, type: 'endpoint', sourceShapeId: shape.id });
      }
    }

    if (settings.midpoints && shape.type === 'line') {
      const pts = shape.points;
      if (pts.length >= 4) {
        points.push({
          x: (pts[0] + pts[2]) / 2,
          y: (pts[1] + pts[3]) / 2,
          type: 'midpoint',
          sourceShapeId: shape.id,
        });
      }
    }

    if (settings.center) {
      const center = getShapeCenter(shape);
      points.push({ x: center.x, y: center.y, type: 'center', sourceShapeId: shape.id });
    }
  }

  return points;
}

export function snapToNearest(
  point: Point,
  snapPoints: SnapPoint[],
  threshold: number = 10,
): SnapResult {
  let bestDist = threshold;
  let bestPoint = point;
  let bestType = '';
  const snapLines: { x1: number; y1: number; x2: number; y2: number }[] = [];

  for (const sp of snapPoints) {
    const dx = point.x - sp.x;
    const dy = point.y - sp.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < bestDist) {
      bestDist = dist;
      bestPoint = { x: sp.x, y: sp.y };
      bestType = sp.type;

      snapLines.length = 0;
      const len = 30;
      if (Math.abs(dx) > Math.abs(dy)) {
        snapLines.push({ x1: sp.x, y1: sp.y - len, x2: sp.x, y2: sp.y + len });
      } else {
        snapLines.push({ x1: sp.x - len, y1: sp.y, x2: sp.x + len, y2: sp.y });
      }
    }
  }

  return { point: bestPoint, snapLines, snapType: bestType };
}

export function getSnapIndicatorColor(type: string): string {
  switch (type) {
    case 'endpoint': return '#ef4444';
    case 'midpoint': return '#f59e0b';
    case 'center': return '#8b5cf6';
    case 'grid': return '#3b82f6';
    default: return '#3b82f6';
  }
}
