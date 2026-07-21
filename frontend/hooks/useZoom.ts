'use client';

import { useCallback } from 'react';
import { useCADStore } from '@/lib/cad/store';

export function useZoom() {
  const transform = useCADStore((s) => s.transform);
  const setTransform = useCADStore((s) => s.setTransform);

  const zoomIn = useCallback(() => {
    setTransform({ scale: Math.min(transform.scale * 1.2, 10) });
  }, [transform.scale, setTransform]);

  const zoomOut = useCallback(() => {
    setTransform({ scale: Math.max(transform.scale / 1.2, 0.1) });
  }, [transform.scale, setTransform]);

  const resetZoom = useCallback(() => {
    setTransform({ scale: 1 });
  }, [setTransform]);

  const zoomToFit = useCallback(
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

  return { zoomIn, zoomOut, resetZoom, zoomToFit, scale: transform.scale };
}
