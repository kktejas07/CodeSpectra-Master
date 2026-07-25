'use client';

import { useCallback, useRef } from 'react';
import type Konva from 'konva';
import { useCADStore } from '@/lib/cad/store';

export function useCanvas(stageRef: React.RefObject<Konva.Stage | null>) {
  const isPanning = useCADStore((s) => s.isPanning);
  const setIsPanning = useCADStore((s) => s.setIsPanning);
  const setTransform = useCADStore((s) => s.setTransform);
  const lastPanPoint = useRef<{ x: number; y: number } | null>(null);

  const screenToCanvas = useCallback(
    (screenX: number, screenY: number) => {
      const stage = stageRef.current;
      if (!stage) return { x: screenX, y: screenY };
      const transform = useCADStore.getState().transform;
      return {
        x: (screenX - transform.x) / transform.scale,
        y: (screenY - transform.y) / transform.scale,
      };
    },
    [stageRef]
  );

  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();
      const stage = stageRef.current;
      if (!stage) return;

      const scaleBy = 1.1;
      const oldScale = useCADStore.getState().transform.scale;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const mousePointTo = {
        x: (pointer.x - useCADStore.getState().transform.x) / oldScale,
        y: (pointer.y - useCADStore.getState().transform.y) / oldScale,
      };

      const direction = e.evt.deltaY > 0 ? -1 : 1;
      const newScale = direction > 0 ? oldScale * scaleBy : oldScale / scaleBy;
      const clampedScale = Math.min(Math.max(newScale, 0.1), 10);

      setTransform({
        scale: clampedScale,
        x: pointer.x - mousePointTo.x * clampedScale,
        y: pointer.y - mousePointTo.y * clampedScale,
      });
    },
    [stageRef, setTransform]
  );

  const handleMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (e.evt.button === 1 || (e.evt.button === 0 && useCADStore.getState().tool === 'pan')) {
        e.evt.preventDefault();
        setIsPanning(true);
        const stage = stageRef.current;
        if (stage) {
          lastPanPoint.current = stage.getPointerPosition();
        }
      }
    },
    [stageRef, setIsPanning]
  );

  const handleMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (!isPanning) return;
      const stage = stageRef.current;
      if (!stage || !lastPanPoint.current) return;

      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const dx = pointer.x - lastPanPoint.current.x;
      const dy = pointer.y - lastPanPoint.current.y;
      lastPanPoint.current = pointer;

      const { x, y } = useCADStore.getState().transform;
      setTransform({ x: x + dx, y: y + dy });
    },
    [stageRef, isPanning, setTransform]
  );

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    lastPanPoint.current = null;
  }, [setIsPanning]);

  const fitToScreen = useCallback(
    (containerWidth: number, containerHeight: number) => {
      const { shapes } = useCADStore.getState();
      if (shapes.length === 0) {
        setTransform({ x: 0, y: 0, scale: 1 });
        return;
      }

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const shape of shapes) {
        switch (shape.type) {
          case 'rectangle':
            minX = Math.min(minX, shape.position.x);
            minY = Math.min(minY, shape.position.y);
            maxX = Math.max(maxX, shape.position.x + shape.width);
            maxY = Math.max(maxY, shape.position.y + shape.height);
            break;
          case 'circle':
            minX = Math.min(minX, shape.position.x - shape.radius);
            minY = Math.min(minY, shape.position.y - shape.radius);
            maxX = Math.max(maxX, shape.position.x + shape.radius);
            maxY = Math.max(maxY, shape.position.y + shape.radius);
            break;
          case 'line':
            for (let i = 0; i < shape.points.length; i += 2) {
              minX = Math.min(minX, shape.points[i]);
              minY = Math.min(minY, shape.points[i + 1]);
              maxX = Math.max(maxX, shape.points[i]);
              maxY = Math.max(maxY, shape.points[i + 1]);
            }
            break;
          case 'polygon':
            minX = Math.min(minX, shape.position.x - shape.radius);
            minY = Math.min(minY, shape.position.y - shape.radius);
            maxX = Math.max(maxX, shape.position.x + shape.radius);
            maxY = Math.max(maxY, shape.position.y + shape.radius);
            break;
        }
      }

      const padding = 50;
      const contentW = maxX - minX + padding * 2;
      const contentH = maxY - minY + padding * 2;
      const scale = Math.min(containerWidth / contentW, containerHeight / contentH, 2);

      setTransform({
        scale,
        x: (containerWidth - (minX + maxX) * scale) / 2,
        y: (containerHeight - (minY + maxY) * scale) / 2,
      });
    },
    [setTransform]
  );

  return {
    screenToCanvas,
    handleWheel,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    fitToScreen,
  };
}
