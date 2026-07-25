'use client';

import React from 'react';
import { useCADStore } from '@/lib/cad/store';
import { useZoom } from '@/hooks/useZoom';
import { Magnet } from 'lucide-react';

export function StatusBar() {
  const cursorPosition = useCADStore((s) => s.cursorPosition);
  const tool = useCADStore((s) => s.tool);
  const shapes = useCADStore((s) => s.shapes);
  const selectedIds = useCADStore((s) => s.selectedIds);
  const snap = useCADStore((s) => s.snap);
  const { scale } = useZoom();

  const toolLabels: Record<string, string> = {
    select: 'Select',
    line: 'Line',
    rectangle: 'Rectangle',
    circle: 'Circle',
    polygon: 'Polygon',
    pan: 'Pan',
  };

  return (
    <div className="flex h-7 items-center justify-between border-t border-border/40 bg-card/80 px-3 text-xs text-muted-foreground backdrop-blur-sm">
      <div className="flex items-center gap-4">
        <span className="font-medium">{toolLabels[tool] || tool}</span>
        <span>
          Objects: {shapes.length}
          {selectedIds.length > 0 && (
            <span className="text-primary"> | Selected: {selectedIds.length}</span>
          )}
        </span>
      </div>
      <div className="flex items-center gap-4">
        <span
          className={`flex items-center gap-1 ${snap.enabled ? 'text-primary' : 'text-muted-foreground/50'}`}
          title={snap.enabled ? 'Snap enabled' : 'Snap disabled'}
        >
          <Magnet className="h-3 w-3" />
          {snap.enabled ? 'Snap' : 'No Snap'}
        </span>
        <span>X: {cursorPosition.x.toFixed(1)}</span>
        <span>Y: {cursorPosition.y.toFixed(1)}</span>
        <span className="font-mono">{Math.round(scale * 100)}%</span>
      </div>
    </div>
  );
}
