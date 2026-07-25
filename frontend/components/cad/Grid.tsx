'use client';

import React, { useMemo } from 'react';
import { Rect, Line } from 'react-konva';
import type Konva from 'konva';
import { useCADStore } from '@/lib/cad/store';

interface GridProps {
  stageRef: React.RefObject<Konva.Stage | null>;
  width: number;
  height: number;
}

function getIsDark(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches
    || document.documentElement.classList.contains('dark');
}

export const Grid = React.memo(function Grid({ stageRef, width, height }: GridProps) {
  const grid = useCADStore((s) => s.grid);
  const transform = useCADStore((s) => s.transform);

  const gridLines = useMemo(() => {
    if (!grid.visible) return null;

    const isDark = getIsDark();

    const bgFill = isDark ? '#0f172a' : '#f8fafc';
    const minorStroke = isDark ? '#475569' : '#94a3b8';
    const majorStroke = isDark ? '#64748b' : '#64748b';
    const minorOpacity = isDark ? 0.15 : 0.15;
    const majorOpacity = isDark ? 0.2 : 0.25;

    const { x: tx, y: ty, scale } = transform;
    const gridSize = grid.size;
    const majorSize = grid.majorSize;

    const startX = Math.floor(-tx / scale / gridSize) * gridSize;
    const endX = Math.ceil((-tx + width / scale) / gridSize) * gridSize;
    const startY = Math.floor(-ty / scale / gridSize) * gridSize;
    const endY = Math.ceil((-ty + height / scale) / gridSize) * gridSize;

    const minorLines: React.ReactNode[] = [];
    const majorLines: React.ReactNode[] = [];

    for (let x = startX; x <= endX; x += gridSize) {
      const screenX = x * scale + tx;
      if (x % majorSize === 0) {
        majorLines.push(
          <Line
            key={`vm-${x}`}
            points={[screenX, 0, screenX, height]}
            stroke={majorStroke}
            strokeWidth={1}
            opacity={majorOpacity}
          />
        );
      } else if (scale > 0.4) {
        minorLines.push(
          <Line
            key={`v-${x}`}
            points={[screenX, 0, screenX, height]}
            stroke={minorStroke}
            strokeWidth={0.5}
            opacity={minorOpacity}
          />
        );
      }
    }

    for (let y = startY; y <= endY; y += gridSize) {
      const screenY = y * scale + ty;
      if (y % majorSize === 0) {
        majorLines.push(
          <Line
            key={`hm-${y}`}
            points={[0, screenY, width, screenY]}
            stroke={majorStroke}
            strokeWidth={1}
            opacity={majorOpacity}
          />
        );
      } else if (scale > 0.4) {
        minorLines.push(
          <Line
            key={`h-${y}`}
            points={[0, screenY, width, screenY]}
            stroke={minorStroke}
            strokeWidth={0.5}
            opacity={minorOpacity}
          />
        );
      }
    }

    return (
      <>
        <Rect x={0} y={0} width={width} height={height} fill={bgFill} />
        {minorLines}
        {majorLines}
      </>
    );
  }, [grid, transform, width, height]);

  return <>{gridLines}</>;
});
