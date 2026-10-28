'use client';

import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { Stage, Layer, Rect, Circle, Line, Text, Arrow, Group, Transformer } from 'react-konva';
import type Konva from 'konva';
import { useCADStore } from '@/lib/cad/store';
import { useCanvas } from '@/hooks/useCanvas';
import { Grid } from './Grid';
import { ShortcutsOverlay } from './ShortcutsOverlay';
import { createRectangle, createCircle, createLine, createPolygon, createText, createDimension } from '@/lib/cad/geometry';
import { snapPointToGrid } from '@/lib/cad/math';
import { collectSnapPoints, snapToNearest, getSnapIndicatorColor } from '@/lib/cad/snap-engine';
import { DEFAULT_STYLES, LINE_DASH_MAP } from '@/types/cad';
import type { CADShape, TextShape, DimensionShape } from '@/types/cad';
import { isSubmitEnter } from '@/lib/keyboard'

const SELECTION_COLOR = '#2F5BE7'; // brand royal blue

interface ShapeComponentProps {
  shape: CADShape;
  isDrawing?: boolean;
  currentTool: string;
  onDragEnd: (shapeId: string, e: Konva.KonvaEventObject<DragEvent>) => void;
  onTransformEnd: (shapeId: string) => void;
  onTextEdit?: (shapeId: string, text: string) => void;
}

const ShapeComponent = React.memo(function ShapeComponent({ shape, isDrawing, currentTool, onDragEnd, onTransformEnd, onTextEdit }: ShapeComponentProps) {
  const selectedIds = useCADStore((s) => s.selectedIds);
  const layers = useCADStore((s) => s.layers);
  const textRef = useRef<Konva.Text>(null);

  const isSelected = !isDrawing && selectedIds.includes(shape.id);
  const layer = layers.find((l) => l.id === shape.layerId);
  const isLocked = shape.locked || layer?.locked;
  const canDrag = currentTool === 'select' && !isLocked && !isDrawing;

  const layerOpacity = layer?.opacity ?? 1;
  const finalOpacity = shape.opacity * layerOpacity;

  const dashArray = LINE_DASH_MAP[shape.lineDash || 'solid'];

  const baseProps = {
    id: shape.id,
    key: shape.id,
    opacity: finalOpacity,
    rotation: shape.rotation,
    draggable: canDrag,
    hitStrokeWidth: 20,
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => onDragEnd(shape.id, e),
    onTransformEnd: () => onTransformEnd(shape.id),
  };

  const selectionStrokeProps = isSelected
    ? { stroke: SELECTION_COLOR, strokeWidth: shape.strokeWidth + 2, dash: [6, 3], shadowColor: SELECTION_COLOR, shadowBlur: 4, shadowOpacity: 0.3 }
    : {};

  const commonShapeProps = {
    ...baseProps,
    stroke: shape.stroke,
    fill: shape.fill,
    strokeWidth: shape.strokeWidth,
    ...selectionStrokeProps,
  };

  switch (shape.type) {
    case 'rectangle':
      return (
        <Rect
          {...commonShapeProps}
          x={shape.position.x}
          y={shape.position.y}
          width={shape.width}
          height={shape.height}
          dash={dashArray}
        />
      );
    case 'circle':
      return (
        <Circle
          {...commonShapeProps}
          x={shape.position.x}
          y={shape.position.y}
          radius={shape.radius}
          dash={dashArray}
        />
      );
    case 'line': {
      const lineProps = {
        ...commonShapeProps,
        points: shape.points,
        lineCap: 'round' as const,
        lineJoin: 'round' as const,
        hitStrokeWidth: 12,
        dash: dashArray,
      };
      if (shape.arrowType && shape.arrowType !== 'none') {
        const p = shape.points;
        if (shape.arrowType === 'start') {
          return <Arrow {...lineProps} points={[p[2], p[3], p[0], p[1]]} pointerLength={10} pointerWidth={8} />;
        } else if (shape.arrowType === 'both') {
          return <Arrow {...lineProps} points={shape.points} pointerLength={10} pointerWidth={8} pointerAtBeginning />;
        }
        return <Arrow {...lineProps} points={shape.points} pointerLength={10} pointerWidth={8} />;
      }
      return <Line {...lineProps} />;
    }
    case 'polygon': {
      const pts: number[] = [];
      for (let i = 0; i < shape.sides; i++) {
        const a = (2 * Math.PI * i) / shape.sides - Math.PI / 2;
        pts.push(shape.position.x + shape.radius * Math.cos(a));
        pts.push(shape.position.y + shape.radius * Math.sin(a));
      }
      return (
        <Line
          {...commonShapeProps}
          points={pts}
          closed
          dash={dashArray}
        />
      );
    }
    case 'text':
      return (
        <Text
          {...baseProps}
          x={shape.position.x}
          y={shape.position.y}
          text={shape.text}
          fontSize={shape.fontSize}
          fontFamily={shape.fontFamily}
          fill={shape.stroke}
          padding={4}
          onDblClick={() => {
            if (!textRef.current || isLocked) return;
            textRef.current.hide();
            const stage = textRef.current.getStage();
            if (!stage) return;
            const textNode = textRef.current;
            const areaPosition = textNode.getAbsolutePosition();
            const stageBox = stage.container().getBoundingClientRect();
            const textarea = document.createElement('textarea');
            document.body.appendChild(textarea);
            textarea.value = shape.text;
            textarea.style.position = 'absolute';
            textarea.style.top = `${stageBox.top + areaPosition.y}px`;
            textarea.style.left = `${stageBox.left + areaPosition.x}px`;
            textarea.style.width = `${textNode.width() * stage.scaleX() + 10}px`;
            textarea.style.fontSize = `${shape.fontSize * stage.scaleX()}px`;
            textarea.style.fontFamily = shape.fontFamily;
            textarea.style.border = `1px solid ${SELECTION_COLOR}`;
            textarea.style.padding = '0';
            textarea.style.margin = '0';
            textarea.style.overflow = 'hidden';
            textarea.style.background = 'white';
            textarea.style.outline = 'none';
            textarea.style.resize = 'none';
            textarea.style.lineHeight = '1';
            textarea.style.zIndex = '1000';
            textarea.focus();
            textarea.addEventListener('blur', () => {
              const newText = textarea.value;
              onTextEdit?.(shape.id, newText);
              textNode.show();
              textarea.remove();
            });
            textarea.addEventListener('keydown', (ke) => {
              if (isSubmitEnter(ke, { shift: false })) {
                ke.preventDefault();
                textarea.blur();
              }
              if (ke.key === 'Escape') {
                textarea.blur();
              }
            });
          }}
        />
      );
    case 'dimension': {
      const dx = shape.end.x - shape.start.x;
      const dy = shape.end.y - shape.start.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      const perpX = -Math.sin(angle) * shape.offset;
      const perpY = Math.cos(angle) * shape.offset;
      const midX = (shape.start.x + shape.end.x) / 2;
      const midY = (shape.start.y + shape.end.y) / 2;
      const labelX = midX + perpX;
      const labelY = midY + perpY;
      return (
        <Group {...baseProps}>
          {/* Extension lines */}
          <Line
            points={[shape.start.x, shape.start.y, shape.start.x + perpX * 1.2, shape.start.y + perpY * 1.2]}
            stroke={shape.stroke}
            strokeWidth={1}
            listening={false}
          />
          <Line
            points={[shape.end.x, shape.end.y, shape.end.x + perpX * 1.2, shape.end.y + perpY * 1.2]}
            stroke={shape.stroke}
            strokeWidth={1}
            listening={false}
          />
          {/* Dimension line */}
          <Arrow
            points={[shape.start.x + perpX, shape.start.y + perpY, shape.end.x + perpX, shape.end.y + perpY]}
            stroke={shape.stroke}
            strokeWidth={1}
            fill={shape.stroke}
            pointerLength={6}
            pointerWidth={5}
            pointerAtBeginning
            listening={false}
          />
          {/* Label */}
          <Text
            x={labelX - 20}
            y={labelY - 8}
            text={shape.label || Math.round(len).toString()}
            fontSize={12}
            fontFamily="Arial"
            fill={shape.stroke}
            align="center"
            width={40}
            listening={false}
          />
          {/* Selection indicator */}
          {isSelected && (
            <Rect
              x={Math.min(shape.start.x, shape.end.x) - 5}
              y={Math.min(shape.start.y, shape.end.y) - Math.abs(shape.offset) - 15}
              width={Math.abs(dx) + 10}
              height={Math.abs(dy) + Math.abs(shape.offset) * 2 + 30}
              stroke={SELECTION_COLOR}
              strokeWidth={1}
              dash={[6, 3]}
              listening={false}
            />
          )}
        </Group>
      );
    }
  }
});

export function CADCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [snapLines, setSnapLines] = useState<{ x1: number; y1: number; x2: number; y2: number; color: string }[]>([]);
  const [snapIndicator, setSnapIndicator] = useState<{ x: number; y: number; type: string } | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [alignGuides, setAlignGuides] = useState<{ x1: number; y1: number; x2: number; y2: number }[]>([]);

  const tool = useCADStore((s) => s.tool);
  const shapes = useCADStore((s) => s.shapes);
  const selectedIds = useCADStore((s) => s.selectedIds);
  const drawingShape = useCADStore((s) => s.drawingShape);
  const selectionBox = useCADStore((s) => s.selectionBox);
  const transform = useCADStore((s) => s.transform);
  const grid = useCADStore((s) => s.grid);
  const snap = useCADStore((s) => s.snap);
  const layers = useCADStore((s) => s.layers);
  const activeLayerId = useCADStore((s) => s.activeLayerId);
  const addShape = useCADStore((s) => s.addShape);
  const pushHistory = useCADStore((s) => s.pushHistory);
  const selectShape = useCADStore((s) => s.selectShape);
  const deselectAll = useCADStore((s) => s.deselectAll);
  const setDrawingShape = useCADStore((s) => s.setDrawingShape);
  const setSelectionBox = useCADStore((s) => s.setSelectionBox);
  const setCursorPosition = useCADStore((s) => s.setCursorPosition);
  const updateShape = useCADStore((s) => s.updateShape);
  const removeShapes = useCADStore((s) => s.removeShapes);
  const setClipboard = useCADStore((s) => s.setClipboard);
  const setTool = useCADStore((s) => s.setTool);

  const {
    screenToCanvas,
    handleWheel,
    handleMouseDown: baseMouseDown,
    handleMouseMove: baseMouseMove,
    handleMouseUp: baseMouseUp,
  } = useCanvas(stageRef);

  const drawingStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDimensions({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const applySnap = useCallback(
    (point: { x: number; y: number }, isDrawing = false): { x: number; y: number } => {
      if (!snap.enabled) {
        setSnapLines([]);
        setSnapIndicator(null);
        return point;
      }

      const otherShapes = isDrawing
        ? shapes
        : shapes.filter((s) => !selectedIds.includes(s.id));

      const snapPoints = collectSnapPoints(otherShapes, snap);

      if (snap.grid && grid.snapToGrid) {
        const gridSnapped = snapPointToGrid(point, grid.size);
        const result = snapToNearest(gridSnapped, snapPoints, 10 / transform.scale);

        if (result.snapType !== '') {
          setSnapIndicator({ x: result.point.x, y: result.point.y, type: result.snapType });
          setSnapLines(result.snapLines.map((l) => ({ ...l, color: getSnapIndicatorColor(result.snapType) })));
        } else {
          setSnapIndicator(null);
          setSnapLines([]);
        }
        return result.point;
      }

      const result = snapToNearest(point, snapPoints, 10 / transform.scale);
      if (result.snapType !== '') {
        setSnapIndicator({ x: result.point.x, y: result.point.y, type: result.snapType });
        setSnapLines(result.snapLines.map((l) => ({ ...l, color: getSnapIndicatorColor(result.snapType) })));
      } else {
        setSnapIndicator(null);
        setSnapLines([]);
      }
      return result.point;
    },
    [snap, grid, shapes, selectedIds, transform.scale]
  );

  const clearSnapIndicators = useCallback(() => {
    setSnapLines([]);
    setSnapIndicator(null);
    setAlignGuides([]);
  }, []);

  const isDrawingTool = tool === 'rectangle' || tool === 'circle' || tool === 'line' || tool === 'polygon' || tool === 'dimension';

  const computeAlignGuides = useCallback(
    (draggedShapeId: string, x: number, y: number) => {
      const otherShapes = shapes.filter((s) => s.id !== draggedShapeId && s.visible);
      const guides: { x1: number; y1: number; x2: number; y2: number }[] = [];
      const threshold = 5 / transform.scale;

      for (const other of otherShapes) {
        let ob: { cx: number; cy: number; l: number; r: number; t: number; b: number } | null = null;
        switch (other.type) {
          case 'rectangle': ob = { cx: other.position.x + other.width / 2, cy: other.position.y + other.height / 2, l: other.position.x, r: other.position.x + other.width, t: other.position.y, b: other.position.y + other.height }; break;
          case 'circle': ob = { cx: other.position.x, cy: other.position.y, l: other.position.x - other.radius, r: other.position.x + other.radius, t: other.position.y - other.radius, b: other.position.y + other.radius }; break;
          case 'polygon': ob = { cx: other.position.x, cy: other.position.y, l: other.position.x - other.radius, r: other.position.x + other.radius, t: other.position.y - other.radius, b: other.position.y + other.radius }; break;
          default: break;
        }
        if (!ob) continue;

        if (Math.abs(x - ob.cx) < threshold) {
          guides.push({ x1: ob.cx, y1: Math.min(ob.t, y - 50), x2: ob.cx, y2: Math.max(ob.b, y + 50) });
        }
        if (Math.abs(y - ob.cy) < threshold) {
          guides.push({ x1: Math.min(ob.l, x - 50), y1: ob.cy, x2: Math.max(ob.r, x + 50), y2: ob.cy });
        }
      }
      setAlignGuides(guides);
      return guides.length > 0;
    },
    [shapes, transform.scale]
  );

  const handleMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      const stage = stageRef.current;
      if (!stage) return;

      if (e.evt.button === 1) {
        baseMouseDown(e);
        return;
      }

      if (tool === 'pan') {
        baseMouseDown(e);
        return;
      }

      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      const canvasPos = screenToCanvas(pointer.x, pointer.y);
      const snapped = applySnap(canvasPos);

      if (tool === 'select') {
        const clickedOnEmpty = e.target === stage || e.target.getParent() === stage;

        if (clickedOnEmpty) {
          deselectAll();
          setSelectionBox({
            startX: canvasPos.x,
            startY: canvasPos.y,
            endX: canvasPos.x,
            endY: canvasPos.y,
          });
        } else {
          const shapeId = e.target.id();
          if (shapeId && shapeId.startsWith('cad-')) {
            const isAdditive = e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey;
            selectShape(shapeId, isAdditive);
          }
        }
        return;
      }

      if (tool === 'text') {
        const activeLayer = layers.find((l) => l.id === activeLayerId);
        if (activeLayer?.locked) return;
        pushHistory('Draw text');
        addShape(createText(snapped.x, snapped.y, 'Text', activeLayerId, {
          stroke: DEFAULT_STYLES.stroke,
          fill: DEFAULT_STYLES.fill,
          strokeWidth: DEFAULT_STYLES.strokeWidth,
        }));
        return;
      }

      if (isDrawingTool) {
        drawingStartRef.current = snapped;
        const activeLayer = layers.find((l) => l.id === activeLayerId);
        if (activeLayer?.locked) return;

        const styles = {
          stroke: DEFAULT_STYLES.stroke,
          fill: DEFAULT_STYLES.fill,
          strokeWidth: DEFAULT_STYLES.strokeWidth,
          lineDash: DEFAULT_STYLES.lineDash,
          arrowType: DEFAULT_STYLES.arrowType,
        };

        if (tool === 'rectangle') {
          setDrawingShape(createRectangle(snapped.x, snapped.y, 0, 0, activeLayerId, styles));
        } else if (tool === 'circle') {
          setDrawingShape(createCircle(snapped.x, snapped.y, 0, activeLayerId, styles));
        } else if (tool === 'line') {
          setDrawingShape(createLine(snapped.x, snapped.y, snapped.x, snapped.y, activeLayerId, styles));
        } else if (tool === 'polygon') {
          setDrawingShape(createPolygon(snapped.x, snapped.y, 0, 6, activeLayerId, styles));
        } else if (tool === 'dimension') {
          setDrawingShape(createDimension(snapped.x, snapped.y, snapped.x, snapped.y, activeLayerId, styles));
        }
      }
    },
    [tool, screenToCanvas, applySnap, deselectAll, selectShape, setSelectionBox, setDrawingShape, layers, activeLayerId, isDrawingTool, baseMouseDown, addShape, pushHistory]
  );

  const handleMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      const stage = stageRef.current;
      if (!stage) return;

      if (useCADStore.getState().isPanning) {
        baseMouseMove(e);
        clearSnapIndicators();
        return;
      }

      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      const canvasPos = screenToCanvas(pointer.x, pointer.y);
      setCursorPosition(canvasPos);
      const snapped = applySnap(canvasPos, isDrawingTool);

      if (tool === 'select' && selectionBox) {
        setSelectionBox({ ...selectionBox, endX: canvasPos.x, endY: canvasPos.y });
        clearSnapIndicators();
        return;
      }

      if (drawingStartRef.current && drawingShape) {
        const start = drawingStartRef.current;

        if (tool === 'rectangle' && drawingShape.type === 'rectangle') {
          const w = snapped.x - start.x;
          const h = snapped.y - start.y;
          const x = w < 0 ? snapped.x : start.x;
          const y = h < 0 ? snapped.y : start.y;
          setDrawingShape({ ...drawingShape, position: { x, y }, width: Math.abs(w), height: Math.abs(h) });
        } else if (tool === 'circle' && drawingShape.type === 'circle') {
          const dx = snapped.x - start.x;
          const dy = snapped.y - start.y;
          setDrawingShape({ ...drawingShape, radius: Math.sqrt(dx * dx + dy * dy) });
        } else if (tool === 'line' && drawingShape.type === 'line') {
          setDrawingShape({ ...drawingShape, points: [start.x, start.y, snapped.x, snapped.y] });
        } else if (tool === 'polygon' && drawingShape.type === 'polygon') {
          const dx = snapped.x - start.x;
          const dy = snapped.y - start.y;
          setDrawingShape({ ...drawingShape, radius: Math.sqrt(dx * dx + dy * dy) });
        } else if (tool === 'dimension' && drawingShape.type === 'dimension') {
          setDrawingShape({ ...drawingShape, end: { x: snapped.x, y: snapped.y } });
        }
      }
    },
    [tool, screenToCanvas, applySnap, selectionBox, drawingShape, setDrawingShape, setSelectionBox, setCursorPosition, baseMouseMove, clearSnapIndicators, isDrawingTool]
  );

  const handleMouseUp = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      const stage = stageRef.current;
      if (!stage) return;

      if (useCADStore.getState().isPanning) {
        baseMouseUp();
        return;
      }

      clearSnapIndicators();

      if (tool === 'select' && selectionBox) {
        const { startX, startY, endX, endY } = selectionBox;
        const minX = Math.min(startX, endX);
        const maxX = Math.max(startX, endX);
        const minY = Math.min(startY, endY);
        const maxY = Math.max(startY, endY);

        if (Math.abs(endX - startX) > 2 || Math.abs(endY - startY) > 2) {
          const currentShapes = useCADStore.getState().shapes;
          const selected = currentShapes
            .filter((s) => {
              const b = (() => {
                switch (s.type) {
                  case 'rectangle': return { x: s.position.x, y: s.position.y, w: s.width, h: s.height };
                  case 'circle': return { x: s.position.x - s.radius, y: s.position.y - s.radius, w: s.radius * 2, h: s.radius * 2 };
                  case 'polygon': return { x: s.position.x - s.radius, y: s.position.y - s.radius, w: s.radius * 2, h: s.radius * 2 };
                  case 'line': {
                    const xs = s.points.filter((_, i) => i % 2 === 0);
                    const ys = s.points.filter((_, i) => i % 2 === 1);
                    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
                  }
                  case 'text': return { x: s.position.x, y: s.position.y, w: 100, h: s.fontSize };
                  case 'dimension': {
                    const xs = [s.start.x, s.end.x];
                    const ys = [s.start.y, s.end.y];
                    return { x: Math.min(...xs), y: Math.min(...ys) - s.offset, w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) + s.offset * 2 };
                  }
                }
              })();
              if (!b) return false;
              return !(b.x + b.w < minX || b.x > maxX || b.y + b.h < minY || b.y > maxY);
            })
            .map((s) => s.id);

          deselectAll();
          selected.forEach((id) => selectShape(id, true));
        }
        setSelectionBox(null);
        return;
      }

      if (drawingStartRef.current && drawingShape) {
        const pointer = stage.getPointerPosition();
        if (!pointer) return;
        const canvasPos = screenToCanvas(pointer.x, pointer.y);
        const snapped = applySnap(canvasPos);
        const start = drawingStartRef.current;
        const dx = Math.abs(snapped.x - start.x);
        const dy = Math.abs(snapped.y - start.y);

        if (dx > 2 || dy > 2) {
          pushHistory('Draw ' + drawingShape.type);
          addShape(drawingShape);
        }
        setDrawingShape(null);
        drawingStartRef.current = null;
      }
    },
    [tool, selectionBox, drawingShape, screenToCanvas, applySnap, pushHistory, addShape, setDrawingShape, setSelectionBox, deselectAll, selectShape, baseMouseUp, clearSnapIndicators]
  );

  const handleDragEnd = useCallback(
    (shapeId: string, e: Konva.KonvaEventObject<DragEvent>) => {
      const node = e.target as Konva.Node;
      const shape = useCADStore.getState().shapes.find((s) => s.id === shapeId);
      if (!shape) return;

      const newX = node.x();
      const newY = node.y();

      if (shape.type === 'line') {
        const dx = newX - shape.position.x;
        const dy = newY - shape.position.y;
        pushHistory('Move');
        updateShape(shapeId, {
          points: shape.points.map((p, i) => i % 2 === 0 ? p + dx : p + dy),
          position: { x: newX, y: newY },
        } as any);
      } else if (shape.type === 'dimension') {
        const dx = newX - shape.position.x;
        const dy = newY - shape.position.y;
        pushHistory('Move');
        updateShape(shapeId, {
          position: { x: newX, y: newY },
          start: { x: shape.start.x + dx, y: shape.start.y + dy },
          end: { x: shape.end.x + dx, y: shape.end.y + dy },
        } as any);
      } else {
        pushHistory('Move');
        updateShape(shapeId, { position: { x: newX, y: newY } } as any);
      }

      node.position({ x: 0, y: 0 });
      setAlignGuides([]);
    },
    [pushHistory, updateShape, setAlignGuides]
  );

  const handleTransformEnd = useCallback(
    (shapeId: string) => {
      const stage = stageRef.current;
      if (!stage) return;

      const node = stage.findOne('#' + shapeId);
      if (!node) return;

      const shape = useCADStore.getState().shapes.find((s) => s.id === shapeId);
      if (!shape) return;

      const scaleX = node.scaleX();
      const scaleY = node.scaleY();
      const rotation = node.rotation();

      node.scaleX(1);
      node.scaleY(1);
      node.rotation(0);

      pushHistory('Transform');

      if (shape.type === 'rectangle') {
        updateShape(shapeId, {
          width: Math.max(1, shape.width * Math.abs(scaleX)),
          height: Math.max(1, shape.height * Math.abs(scaleY)),
          rotation: shape.rotation + rotation,
        } as any);
      } else if (shape.type === 'circle' || shape.type === 'polygon') {
        const avgScale = (Math.abs(scaleX) + Math.abs(scaleY)) / 2;
        updateShape(shapeId, {
          radius: Math.max(1, shape.radius * avgScale),
          rotation: shape.rotation + rotation,
        } as any);
      } else if (shape.type === 'text') {
        updateShape(shapeId, {
          fontSize: Math.max(6, Math.round(shape.fontSize * Math.abs(scaleY))),
          rotation: shape.rotation + rotation,
        } as any);
      } else if (shape.type === 'line' || shape.type === 'dimension') {
        updateShape(shapeId, { rotation: shape.rotation + rotation } as any);
      }
    },
    [pushHistory, updateShape]
  );

  const handleTextEdit = useCallback(
    (shapeId: string, text: string) => {
      pushHistory('Edit text');
      updateShape(shapeId, { text } as any);
    },
    [pushHistory, updateShape]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        const { selectedIds } = useCADStore.getState();
        if (selectedIds.length > 0) {
          pushHistory('Delete');
          removeShapes(selectedIds);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pushHistory, removeShapes]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        e.preventDefault();
        const { selectedIds, shapes } = useCADStore.getState();
        setClipboard(shapes.filter((s) => selectedIds.includes(s.id)));
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        e.preventDefault();
        const { clipboard } = useCADStore.getState();
        if (clipboard.length === 0) return;
        pushHistory('Paste');
        clipboard.forEach((s) => {
          const cloned = { ...s, id: `cad-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, position: { x: s.position.x + 20, y: s.position.y + 20 } } as CADShape;
          addShape(cloned);
        });
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        const { selectedIds, shapes } = useCADStore.getState();
        const selected = shapes.filter((s) => selectedIds.includes(s.id));
        if (selected.length === 0) return;
        pushHistory('Duplicate');
        selected.forEach((s) => {
          const cloned = { ...s, id: `cad-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, position: { x: s.position.x + 20, y: s.position.y + 20 } } as CADShape;
          addShape(cloned);
        });
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        useCADStore.getState().selectAll();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) { useCADStore.getState().redo(); } else { useCADStore.getState().undo(); }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        useCADStore.getState().redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setClipboard, pushHistory, addShape]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const shortcuts: Record<string, string> = { v: 'select', l: 'line', r: 'rectangle', c: 'circle', p: 'polygon', t: 'text', d: 'dimension' };
      if (shortcuts[e.key]) setTool(shortcuts[e.key] as any);
      if (e.key === ' ') { e.preventDefault(); setTool('pan'); }
      if (e.key === 's') {
        const { snap } = useCADStore.getState();
        useCADStore.getState().setSnap({ enabled: !snap.enabled });
      }
      if (e.key === '?') {
        setShowShortcuts((prev) => !prev);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') setTool('select');
    };
    const handleToggleShortcuts = () => setShowShortcuts((prev) => !prev);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('cad:toggle-shortcuts', handleToggleShortcuts);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('cad:toggle-shortcuts', handleToggleShortcuts);
    };
  }, [setTool]);

  useEffect(() => {
    if (!transformerRef.current || !stageRef.current) return;

    const selected = useCADStore.getState().shapes.filter((s) => useCADStore.getState().selectedIds.includes(s.id));
    const tr = transformerRef.current;
    const stage = stageRef.current;

    const nodes = selected
      .map((s) => stage.findOne('#' + s.id))
      .filter((n): n is Konva.Node => Boolean(n));

    tr.nodes(nodes);

    tr.nodes().forEach((node) => {
      const shape = useCADStore.getState().shapes.find((s) => s.id === node.id());
      if (shape && (shape.locked || useCADStore.getState().layers.find((l) => l.id === shape.layerId)?.locked)) {
        node.draggable(false);
      }
    });

    tr.getLayer()?.batchDraw();
  }, [shapes, selectedIds]);

  const visibleShapes = useMemo(() => {
    const visibleLayerIds = new Set(layers.filter((l) => l.visible).map((l) => l.id));
    return shapes.filter((s) => visibleLayerIds.has(s.layerId) && s.visible);
  }, [shapes, layers]);

  const cursor = (() => {
    if (tool === 'pan') return 'grab';
    if (tool === 'select') return 'default';
    if (tool === 'text') return 'text';
    return 'crosshair';
  })();

  const indicatorSize = 6 / transform.scale;

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-slate-50">
      <Stage
        ref={stageRef}
        width={dimensions.width}
        height={dimensions.height}
        x={transform.x}
        y={transform.y}
        scaleX={transform.scale}
        scaleY={transform.scale}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onContextMenu={(e) => e.evt.preventDefault()}
        style={{ cursor }}
      >
        <Layer>
          <Grid stageRef={stageRef} width={dimensions.width} height={dimensions.height} />
        </Layer>

        <Layer>
          {visibleShapes.map((shape) => (
            <ShapeComponent
              key={shape.id}
              shape={shape}
              currentTool={tool}
              onDragEnd={handleDragEnd}
              onTransformEnd={handleTransformEnd}
              onTextEdit={handleTextEdit}
            />
          ))}
          {drawingShape && (
            <ShapeComponent
              shape={drawingShape}
              isDrawing
              currentTool={tool}
              onDragEnd={handleDragEnd}
              onTransformEnd={handleTransformEnd}
              onTextEdit={handleTextEdit}
            />
          )}

          {selectionBox && (
            <Rect
              x={Math.min(selectionBox.startX, selectionBox.endX)}
              y={Math.min(selectionBox.startY, selectionBox.endY)}
              width={Math.abs(selectionBox.endX - selectionBox.startX)}
              height={Math.abs(selectionBox.endY - selectionBox.startY)}
              stroke={SELECTION_COLOR}
              strokeWidth={1 / transform.scale}
              fill="rgba(59, 130, 246, 0.08)"
              dash={[4 / transform.scale, 4 / transform.scale]}
              listening={false}
            />
          )}

          {/* Alignment guides */}
          {alignGuides.map((g, i) => (
            <Line
              key={`align-guide-${i}`}
              points={[g.x1, g.y1, g.x2, g.y2]}
              stroke="#8b5cf6"
              strokeWidth={0.5 / transform.scale}
              dash={[4 / transform.scale, 4 / transform.scale]}
              opacity={0.7}
              listening={false}
            />
          ))}

          {/* Snap indicator lines */}
          {snapLines.map((line, i) => (
            <Line
              key={`snap-line-${i}`}
              points={[line.x1, line.y1, line.x2, line.y2]}
              stroke={line.color}
              strokeWidth={1 / transform.scale}
              dash={[3 / transform.scale, 3 / transform.scale]}
              opacity={0.6}
              listening={false}
            />
          ))}

          {/* Snap point indicator */}
          {snapIndicator && (
            <>
              <Rect
                x={snapIndicator.x - indicatorSize / 2}
                y={snapIndicator.y - indicatorSize / 2}
                width={indicatorSize}
                height={indicatorSize}
                fill={getSnapIndicatorColor(snapIndicator.type)}
                stroke="#ffffff"
                strokeWidth={1.5 / transform.scale}
                rotation={45}
                listening={false}
              />
            </>
          )}

          <Transformer
            ref={transformerRef}
            flipEnabled={false}
            rotateEnabled={true}
            enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right', 'top-center', 'bottom-center']}
            anchorStroke={SELECTION_COLOR}
            anchorFill="#ffffff"
            anchorSize={8}
            anchorCornerRadius={2}
            borderStroke={SELECTION_COLOR}
            borderStrokeWidth={1.5}
            borderDash={[6, 3]}
            rotateAnchorOffset={25}
            boundBoxFunc={(_oldBox, newBox) => {
              if (newBox.width < 5 || newBox.height < 5) return _oldBox;
              return newBox;
            }}
          />
        </Layer>
      </Stage>

      <ShortcutsOverlay open={showShortcuts} onClose={() => setShowShortcuts(false)} />
    </div>
  );
}
