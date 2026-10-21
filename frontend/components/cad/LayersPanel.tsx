'use client';

import React, { useCallback } from 'react';
import { useCADStore } from '@/lib/cad/store';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { useT } from '@/lib/i18n/client'

export function LayersPanel() {
  const { t } = useT()
  const layers = useCADStore((s) => s.layers);
  const shapes = useCADStore((s) => s.shapes);
  const activeLayerId = useCADStore((s) => s.activeLayerId);
  const addLayer = useCADStore((s) => s.addLayer);
  const removeLayer = useCADStore((s) => s.removeLayer);
  const updateLayer = useCADStore((s) => s.updateLayer);
  const setActiveLayer = useCADStore((s) => s.setActiveLayer);

  const getShapeCount = useCallback(
    (layerId: string) => shapes.filter((s) => s.layerId === layerId).length,
    [shapes]
  );

  const handleMoveUp = useCallback(
    (e: React.MouseEvent, layerId: string) => {
      e.stopPropagation();
      const idx = layers.findIndex((l) => l.id === layerId);
      if (idx < layers.length - 1) {
        const reordered = [...layers];
        [reordered[idx], reordered[idx + 1]] = [reordered[idx + 1], reordered[idx]];
        reordered.forEach((l, i) => useCADStore.getState().updateLayer(l.id, { order: i }));
        useCADStore.setState({ layers: reordered });
      }
    },
    [layers]
  );

  const handleMoveDown = useCallback(
    (e: React.MouseEvent, layerId: string) => {
      e.stopPropagation();
      const idx = layers.findIndex((l) => l.id === layerId);
      if (idx > 0) {
        const reordered = [...layers];
        [reordered[idx], reordered[idx - 1]] = [reordered[idx - 1], reordered[idx]];
        reordered.forEach((l, i) => useCADStore.getState().updateLayer(l.id, { order: i }));
        useCADStore.setState({ layers: reordered });
      }
    },
    [layers]
  );

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground">{t('exam.layers')}</span>
        <button
          type="button"
          onClick={() => addLayer(`Layer ${layers.length + 1}`)}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          title={t('exam.addLayer')}
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>

      <div className="flex flex-col gap-1">
        {[...layers].reverse().map((layer) => {
          const count = getShapeCount(layer.id);
          return (
            <div
              key={layer.id}
              onClick={() => setActiveLayer(layer.id)}
              className={cn(
                'group rounded-md px-2 py-1.5 text-xs cursor-pointer transition-colors',
                activeLayerId === layer.id
                  ? 'bg-primary/10 text-primary ring-1 ring-primary/20'
                  : 'text-muted-foreground hover:bg-muted/50'
              )}
            >
              {/* Row 1: Name + actions */}
              <div className="flex items-center gap-2">
                <Input
                  value={layer.name}
                  onChange={(e) => updateLayer(layer.id, { name: e.target.value })}
                  onClick={(e) => e.stopPropagation()}
                  className="h-5 border-none bg-transparent p-0 text-xs font-medium focus-visible:ring-0"
                />
                <span className="shrink-0 text-[9px] text-muted-foreground/60 tabular-nums">
                  {count}
                </span>
                <div className="ml-auto flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleMoveUp(e, layer.id); }}
                    className="rounded p-0.5 hover:bg-muted"
                    title={t('exam.moveUp2')}
                  >
                    <ChevronUp className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleMoveDown(e, layer.id); }}
                    className="rounded p-0.5 hover:bg-muted"
                    title={t('exam.moveDown2')}
                  >
                    <ChevronDown className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); updateLayer(layer.id, { visible: !layer.visible }); }}
                    className="rounded p-0.5 hover:bg-muted"
                    title={layer.visible ? t('exam.hide') : t('exam.show')}
                  >
                    {layer.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3 opacity-40" />}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); updateLayer(layer.id, { locked: !layer.locked }); }}
                    className="rounded p-0.5 hover:bg-muted"
                    title={layer.locked ? t('exam.unlock') : t('exam.lock')}
                  >
                    {layer.locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3 opacity-40" />}
                  </button>
                  {layers.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeLayer(layer.id); }}
                      className="rounded p-0.5 hover:bg-destructive/10 hover:text-destructive"
                      title={t('exam.deleteLayer')}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Row 2: Opacity slider */}
              <div className="mt-1 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <span className="w-8 text-[9px] text-muted-foreground/60">{t('exam.op')}</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={layer.opacity}
                  onChange={(e) => updateLayer(layer.id, { opacity: parseFloat(e.target.value) })}
                  className="h-1 w-full cursor-pointer accent-primary"
                />
                <span className="w-8 text-right text-[9px] tabular-nums text-muted-foreground/60">
                  {Math.round(layer.opacity * 100)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
