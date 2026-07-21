import type { Point, CADShape, RectangleShape, CircleShape, LineShape, PolygonShape, TextShape, DimensionShape } from '@/types/cad';

export function getShapeBounds(shape: CADShape): { x: number; y: number; width: number; height: number } {
  switch (shape.type) {
    case 'line': {
      const xs = shape.points.filter((_, i) => i % 2 === 0);
      const ys = shape.points.filter((_, i) => i % 2 === 1);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      return { x: minX, y: minY, width: maxX - minX || 1, height: maxY - minY || 1 };
    }
    case 'rectangle':
      return { x: shape.position.x, y: shape.position.y, width: shape.width || 1, height: shape.height || 1 };
    case 'circle':
      return {
        x: shape.position.x - shape.radius,
        y: shape.position.y - shape.radius,
        width: shape.radius * 2 || 1,
        height: shape.radius * 2 || 1,
      };
    case 'polygon':
      return {
        x: shape.position.x - shape.radius,
        y: shape.position.y - shape.radius,
        width: shape.radius * 2 || 1,
        height: shape.radius * 2 || 1,
      };
    case 'text':
      return {
        x: shape.position.x,
        y: shape.position.y,
        width: (shape.text.length * shape.fontSize * 0.6) || 1,
        height: shape.fontSize * 1.2 || 1,
      };
    case 'dimension': {
      const dx = shape.end.x - shape.start.x;
      const dy = shape.end.y - shape.start.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      return {
        x: Math.min(shape.start.x, shape.end.x),
        y: Math.min(shape.start.y, shape.end.y) - shape.offset,
        width: len || 1,
        height: shape.offset * 2 || 1,
      };
    }
  }
}

export function getShapeCenter(shape: CADShape): Point {
  switch (shape.type) {
    case 'line': {
      const xs = shape.points.filter((_, i) => i % 2 === 0);
      const ys = shape.points.filter((_, i) => i % 2 === 1);
      return {
        x: (Math.min(...xs) + Math.max(...xs)) / 2,
        y: (Math.min(...ys) + Math.max(...ys)) / 2,
      };
    }
    case 'rectangle':
      return { x: shape.position.x + shape.width / 2, y: shape.position.y + shape.height / 2 };
    case 'circle':
    case 'polygon':
      return { x: shape.position.x, y: shape.position.y };
    case 'text':
      return { x: shape.position.x, y: shape.position.y };
    case 'dimension':
      return { x: (shape.start.x + shape.end.x) / 2, y: (shape.start.y + shape.end.y) / 2 };
  }
}

export function getShapeEndpoints(shape: CADShape): Point[] {
  switch (shape.type) {
    case 'line': {
      const points: Point[] = [];
      for (let i = 0; i < shape.points.length; i += 2) {
        points.push({ x: shape.points[i], y: shape.points[i + 1] });
      }
      return points;
    }
    case 'rectangle':
      return [
        { x: shape.position.x, y: shape.position.y },
        { x: shape.position.x + shape.width, y: shape.position.y },
        { x: shape.position.x + shape.width, y: shape.position.y + shape.height },
        { x: shape.position.x, y: shape.position.y + shape.height },
      ];
    case 'circle':
      return [
        { x: shape.position.x + shape.radius, y: shape.position.y },
        { x: shape.position.x - shape.radius, y: shape.position.y },
        { x: shape.position.x, y: shape.position.y + shape.radius },
        { x: shape.position.x, y: shape.position.y - shape.radius },
      ];
    case 'polygon': {
      const pts: Point[] = [];
      for (let i = 0; i < shape.sides; i++) {
        const a = (2 * Math.PI * i) / shape.sides - Math.PI / 2;
        pts.push({
          x: shape.position.x + shape.radius * Math.cos(a),
          y: shape.position.y + shape.radius * Math.sin(a),
        });
      }
      return pts;
    }
    case 'text':
      return [shape.position];
    case 'dimension':
      return [shape.start, shape.end];
  }
}

export function hitTest(point: Point, shape: CADShape, tolerance: number = 5): boolean {
  switch (shape.type) {
    case 'line': {
      const a = { x: shape.points[0], y: shape.points[1] };
      const b = { x: shape.points[2], y: shape.points[3] };
      const len = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
      if (len === 0) return false;
      const t = Math.max(0, Math.min(1, ((point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y)) / (len * len)));
      const proj = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
      return Math.sqrt((point.x - proj.x) ** 2 + (point.y - proj.y) ** 2) <= tolerance;
    }
    case 'circle': {
      const dx = point.x - shape.position.x;
      const dy = point.y - shape.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const strokeHit = Math.abs(dist - shape.radius) <= tolerance + shape.strokeWidth / 2;
      const fillHit = !!shape.fill && shape.fill !== 'transparent' && dist <= shape.radius;
      return strokeHit || fillHit;
    }
    case 'rectangle': {
      const rx = shape.position.x;
      const ry = shape.position.y;
      const rw = shape.width;
      const rh = shape.height;
      const inStroke =
        ((Math.abs(point.x - rx) <= tolerance || Math.abs(point.x - (rx + rw)) <= tolerance) &&
        point.y >= ry - tolerance && point.y <= ry + rh + tolerance) ||
        ((Math.abs(point.y - ry) <= tolerance || Math.abs(point.y - (ry + rh)) <= tolerance) &&
        point.x >= rx - tolerance && point.x <= rx + rw + tolerance);
      const fillHit = !!shape.fill && shape.fill !== 'transparent' &&
        point.x >= rx && point.x <= rx + rw && point.y >= ry && point.y <= ry + rh;
      return inStroke || fillHit;
    }
    case 'polygon': {
      const pts = getShapeEndpoints(shape);
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const xi = pts[i].x, yi = pts[i].y;
        const xj = pts[j].x, yj = pts[j].y;
        if (((yi > point.y) !== (yj > point.y)) && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
          inside = !inside;
        }
      }
      const strokeHit = pts.some((pt, i) => {
        const next = pts[(i + 1) % pts.length];
        const len = Math.sqrt((next.x - pt.x) ** 2 + (next.y - pt.y) ** 2);
        if (len === 0) return false;
        const t = Math.max(0, Math.min(1, ((point.x - pt.x) * (next.x - pt.x) + (point.y - pt.y) * (next.y - pt.y)) / (len * len)));
        const projX = pt.x + t * (next.x - pt.x);
        const projY = pt.y + t * (next.y - pt.y);
        return Math.sqrt((point.x - projX) ** 2 + (point.y - projY) ** 2) <= tolerance + shape.strokeWidth / 2;
      });
      const fillHit = !!shape.fill && shape.fill !== 'transparent' && inside;
      return strokeHit || fillHit;
    }
    case 'text': {
      const bounds = getShapeBounds(shape);
      return (
        point.x >= bounds.x - tolerance &&
        point.x <= bounds.x + bounds.width + tolerance &&
        point.y >= bounds.y - tolerance &&
        point.y <= bounds.y + bounds.height + tolerance
      );
    }
    case 'dimension': {
      const d1 = pointToLineDistance(point, shape.start, shape.end);
      const mid = { x: (shape.start.x + shape.end.x) / 2, y: (shape.start.y + shape.end.y) / 2 };
      const d2 = Math.sqrt((point.x - mid.x) ** 2 + (point.y - mid.y) ** 2);
      return d1 <= tolerance + 5 || d2 <= tolerance + 15;
    }
  }
}

export function getPolygonPoints(center: Point, radius: number, sides: number): number[] {
  const points: number[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = (2 * Math.PI * i) / sides - Math.PI / 2;
    points.push(center.x + radius * Math.cos(angle));
    points.push(center.y + radius * Math.sin(angle));
  }
  return points;
}

export function pointToLineDistance(point: Point, a: Point, b: Point): number {
  const len = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
  if (len === 0) return Math.sqrt((point.x - a.x) ** 2 + (point.y - a.y) ** 2);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y)) / (len * len)));
  const projX = a.x + t * (b.x - a.x);
  const projY = a.y + t * (b.y - a.y);
  return Math.sqrt((point.x - projX) ** 2 + (point.y - projY) ** 2);
}

function genId(): string {
  return `cad-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createRectangle(x: number, y: number, w: number, h: number, layerId: string, styles: { stroke: string; fill: string; strokeWidth: number }): RectangleShape {
  return {
    id: genId(), type: 'rectangle', position: { x, y }, width: w, height: h,
    rotation: 0, layerId, stroke: styles.stroke, fill: styles.fill,
    strokeWidth: styles.strokeWidth, opacity: 1, locked: false, visible: true, selected: false, lineDash: 'solid',
  };
}

export function createCircle(cx: number, cy: number, r: number, layerId: string, styles: { stroke: string; fill: string; strokeWidth: number }): CircleShape {
  return {
    id: genId(), type: 'circle', position: { x: cx, y: cy }, radius: r,
    rotation: 0, layerId, stroke: styles.stroke, fill: styles.fill,
    strokeWidth: styles.strokeWidth, opacity: 1, locked: false, visible: true, selected: false,
    lineDash: 'solid',
  };
}

export function createLine(x1: number, y1: number, x2: number, y2: number, layerId: string, styles: { stroke: string; fill: string; strokeWidth: number; lineDash?: string; arrowType?: string }): LineShape {
  return {
    id: genId(), type: 'line', position: { x: x1, y: y1 }, points: [x1, y1, x2, y2],
    rotation: 0, layerId, stroke: styles.stroke, fill: styles.fill,
    strokeWidth: styles.strokeWidth, opacity: 1, locked: false, visible: true, selected: false,
    lineDash: (styles.lineDash as any) || 'solid',
    arrowType: (styles.arrowType as any) || 'none',
  };
}

export function createText(x: number, y: number, text: string, layerId: string, styles: { stroke: string; fill: string; strokeWidth: number }): TextShape {
  return {
    id: genId(), type: 'text', position: { x, y }, text,
    fontSize: 16, fontFamily: 'Arial',
    rotation: 0, layerId, stroke: styles.stroke, fill: 'transparent',
    strokeWidth: 0, opacity: 1, locked: false, visible: true, selected: false,
    lineDash: 'solid',
  };
}

export function createDimension(x1: number, y1: number, x2: number, y2: number, layerId: string, styles: { stroke: string; fill: string; strokeWidth: number }): DimensionShape {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  return {
    id: genId(), type: 'dimension',
    start: { x: x1, y: y1 },
    end: { x: x2, y: y2 },
    offset: 20,
    label: Math.round(len).toString(),
    position: { x: x1, y: y1 },
    rotation: 0, layerId, stroke: styles.stroke || '#e11d48', fill: 'transparent',
    strokeWidth: 1, opacity: 1, locked: false, visible: true, selected: false,
    lineDash: 'solid',
  };
}

export function createPolygon(cx: number, cy: number, r: number, sides: number, layerId: string, styles: { stroke: string; fill: string; strokeWidth: number }): PolygonShape {
  return {
    id: genId(), type: 'polygon', position: { x: cx, y: cy }, radius: r, sides,
    rotation: 0, layerId, stroke: styles.stroke, fill: styles.fill,
    strokeWidth: styles.strokeWidth, opacity: 1, locked: false, visible: true, selected: false,
    lineDash: 'solid',
  };
}

export function moveShape(shape: CADShape, dx: number, dy: number): CADShape {
  switch (shape.type) {
    case 'line':
      return { ...shape, points: shape.points.map((p, i) => i % 2 === 0 ? p + dx : p + dy) };
    case 'rectangle':
    case 'circle':
    case 'polygon':
    case 'text':
      return { ...shape, position: { x: shape.position.x + dx, y: shape.position.y + dy } };
    case 'dimension':
      return {
        ...shape,
        position: { x: shape.position.x + dx, y: shape.position.y + dy },
        start: { x: shape.start.x + dx, y: shape.start.y + dy },
        end: { x: shape.end.x + dx, y: shape.end.y + dy },
      };
  }
}

export function resizeShape(shape: CADShape, scaleX: number, scaleY: number): CADShape {
  switch (shape.type) {
    case 'rectangle':
      return {
        ...shape,
        width: Math.abs(shape.width * scaleX),
        height: Math.abs(shape.height * scaleY),
        position: { x: shape.position.x, y: shape.position.y },
      };
    case 'circle': {
      const avgScale = (Math.abs(scaleX) + Math.abs(scaleY)) / 2;
      return { ...shape, radius: Math.abs(shape.radius * avgScale) };
    }
    case 'polygon': {
      const avgScale = (Math.abs(scaleX) + Math.abs(scaleY)) / 2;
      return { ...shape, radius: Math.abs(shape.radius * avgScale) };
    }
    case 'text':
      return { ...shape, fontSize: Math.max(6, Math.round(shape.fontSize * Math.abs(scaleY))) };
    case 'line':
    case 'dimension':
      return shape;
  }
}

export function rotateShape(shape: CADShape, angleDeg: number): CADShape {
  return { ...shape, rotation: shape.rotation + angleDeg };
}
