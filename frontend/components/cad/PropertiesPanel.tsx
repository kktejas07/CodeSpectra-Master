'use client';

import React from 'react';
import { useCADStore } from '@/lib/cad/store';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LINE_DASH_MAP, FONT_FAMILIES } from '@/types/cad';
import type { CADShape, LineDash, ArrowType } from '@/types/cad';
import {
  Palette,
  Move,
  Maximize2,
  RotateCw,
  Layers,
  Type,
  PenTool,
} from 'lucide-react';

function FieldGroup({ label, icon: Icon, children }: { label: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3 w-3 text-muted-foreground/60" />
        <Label className="text-[10px] font-medium uppercase text-muted-foreground">{label}</Label>
      </div>
      {children}
    </div>
  );
}

export function PropertiesPanel() {
  const shapes = useCADStore((s) => s.shapes);
  const selectedIds = useCADStore((s) => s.selectedIds);
  const updateShape = useCADStore((s) => s.updateShape);
  const layers = useCADStore((s) => s.layers);

  const selected = selectedIds.length === 1
    ? shapes.find((s) => s.id === selectedIds[0])
    : null;

  if (!selected) {
    return (
      <div className="flex flex-col items-center justify-center p-6 text-center text-xs text-muted-foreground">
        {selectedIds.length > 1 ? (
          <div className="flex flex-col items-center gap-1">
            <span className="font-medium">{selectedIds.length} objects selected</span>
            <span className="text-[10px] opacity-60">Select one to edit properties</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1">
            <span>No selection</span>
            <span className="text-[10px] opacity-60">Click an object to view properties</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase text-muted-foreground">Properties</span>
        <span className="text-[9px] font-mono text-muted-foreground/40">{selected.id.slice(0, 12)}</span>
      </div>

      {/* Position */}
      <FieldGroup label="Position" icon={Move}>
        <div className="grid grid-cols-2 gap-1.5">
          <div>
            <Label className="text-[9px] text-muted-foreground/60">X</Label>
            <Input
              type="number"
              value={Math.round(selected.position.x * 100) / 100}
              onChange={(e) => updateShape(selected.id, { position: { ...selected.position, x: Number(e.target.value) } })}
              className="h-6 text-xs font-mono"
            />
          </div>
          <div>
            <Label className="text-[9px] text-muted-foreground/60">Y</Label>
            <Input
              type="number"
              value={Math.round(selected.position.y * 100) / 100}
              onChange={(e) => updateShape(selected.id, { position: { ...selected.position, y: Number(e.target.value) } })}
              className="h-6 text-xs font-mono"
            />
          </div>
        </div>
      </FieldGroup>

      {/* Size */}
      <FieldGroup label="Size" icon={Maximize2}>
        <div className="grid grid-cols-2 gap-1.5">
          {selected.type === 'rectangle' && (
            <>
              <div>
                <Label className="text-[9px] text-muted-foreground/60">W</Label>
                <Input
                  type="number"
                  min={0}
                  value={Math.round(selected.width * 100) / 100}
                  onChange={(e) => updateShape(selected.id, { width: Math.max(0, Number(e.target.value)) } as any)}
                  className="h-6 text-xs font-mono"
                />
              </div>
              <div>
                <Label className="text-[9px] text-muted-foreground/60">H</Label>
                <Input
                  type="number"
                  min={0}
                  value={Math.round(selected.height * 100) / 100}
                  onChange={(e) => updateShape(selected.id, { height: Math.max(0, Number(e.target.value)) } as any)}
                  className="h-6 text-xs font-mono"
                />
              </div>
            </>
          )}
          {(selected.type === 'circle' || selected.type === 'polygon') && (
            <div className="col-span-2">
              <Label className="text-[9px] text-muted-foreground/60">R</Label>
              <Input
                type="number"
                min={0}
                value={Math.round(selected.radius * 100) / 100}
                onChange={(e) => updateShape(selected.id, { radius: Math.max(0, Number(e.target.value)) } as any)}
                className="h-6 text-xs font-mono"
              />
            </div>
          )}
          {selected.type === 'line' && (
            <>
              <div>
                <Label className="text-[9px] text-muted-foreground/60">X2</Label>
                <Input
                  type="number"
                  value={Math.round((selected.points[2] || 0) * 100) / 100}
                  onChange={(e) => {
                    const pts = [...selected.points];
                    pts[2] = Number(e.target.value);
                    updateShape(selected.id, { points: pts } as any);
                  }}
                  className="h-6 text-xs font-mono"
                />
              </div>
              <div>
                <Label className="text-[9px] text-muted-foreground/60">Y2</Label>
                <Input
                  type="number"
                  value={Math.round((selected.points[3] || 0) * 100) / 100}
                  onChange={(e) => {
                    const pts = [...selected.points];
                    pts[3] = Number(e.target.value);
                    updateShape(selected.id, { points: pts } as any);
                  }}
                  className="h-6 text-xs font-mono"
                />
              </div>
            </>
          )}
          {selected.type === 'dimension' && (
            <>
              <div>
                <Label className="text-[9px] text-muted-foreground/60">Label</Label>
                <Input
                  value={selected.label}
                  onChange={(e) => updateShape(selected.id, { label: e.target.value } as any)}
                  className="h-6 text-xs font-mono"
                />
              </div>
              <div>
                <Label className="text-[9px] text-muted-foreground/60">Offset</Label>
                <Input
                  type="number"
                  value={selected.offset}
                  onChange={(e) => updateShape(selected.id, { offset: Number(e.target.value) } as any)}
                  className="h-6 text-xs font-mono"
                />
              </div>
            </>
          )}
        </div>
        {selected.type === 'polygon' && (
          <div className="mt-1">
            <Label className="text-[9px] text-muted-foreground/60">Sides</Label>
            <Input
              type="number"
              min={3}
              max={36}
              value={selected.sides}
              onChange={(e) => updateShape(selected.id, { sides: Math.max(3, Math.min(36, Number(e.target.value))) } as any)}
              className="h-6 text-xs font-mono"
            />
          </div>
        )}
      </FieldGroup>

      {/* Text properties */}
      {selected.type === 'text' && (
        <FieldGroup label="Text" icon={Type}>
          <div className="flex flex-col gap-1.5">
            <div>
              <Label className="text-[9px] text-muted-foreground/60">Content</Label>
              <Input
                value={selected.text}
                onChange={(e) => updateShape(selected.id, { text: e.target.value } as any)}
                className="h-6 text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <Label className="text-[9px] text-muted-foreground/60">Size</Label>
                <Input
                  type="number"
                  min={6}
                  value={selected.fontSize}
                  onChange={(e) => updateShape(selected.id, { fontSize: Math.max(6, Number(e.target.value)) } as any)}
                  className="h-6 text-xs font-mono"
                />
              </div>
              <div>
                <Label className="text-[9px] text-muted-foreground/60">Font</Label>
                <select
                  value={selected.fontFamily}
                  onChange={(e) => updateShape(selected.id, { fontFamily: e.target.value } as any)}
                  className="h-6 rounded-md border border-border/40 bg-background px-2 text-xs"
                >
                  {FONT_FAMILIES.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </FieldGroup>
      )}

      {/* Line style (for lines and non-line shapes) */}
      {(selected.type === 'line' || selected.type === 'rectangle' || selected.type === 'circle' || selected.type === 'polygon') && (
        <FieldGroup label="Stroke Style" icon={PenTool}>
          <div className="flex flex-col gap-1.5">
            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <Label className="text-[9px] text-muted-foreground/60">Dash</Label>
                <select
                  value={selected.lineDash || 'solid'}
                  onChange={(e) => updateShape(selected.id, { lineDash: e.target.value as LineDash })}
                  className="h-6 rounded-md border border-border/40 bg-background px-2 text-xs"
                >
                  <option value="solid">Solid</option>
                  <option value="dashed">Dashed</option>
                  <option value="dotted">Dotted</option>
                  <option value="dash-dot">Dash-Dot</option>
                </select>
              </div>
              {selected.type === 'line' && (
                <div>
                  <Label className="text-[9px] text-muted-foreground/60">Arrows</Label>
                  <select
                    value={(selected as any).arrowType || 'none'}
                    onChange={(e) => updateShape(selected.id, { arrowType: e.target.value as ArrowType } as any)}
                    className="h-6 rounded-md border border-border/40 bg-background px-2 text-xs"
                  >
                    <option value="none">None</option>
                    <option value="end">End</option>
                    <option value="start">Start</option>
                    <option value="both">Both</option>
                  </select>
                </div>
              )}
            </div>
          </div>
        </FieldGroup>
      )}

      {/* Rotation + Stroke Width */}
      <FieldGroup label="Style" icon={RotateCw}>
        <div className="grid grid-cols-2 gap-1.5">
          <div>
            <Label className="text-[9px] text-muted-foreground/60">Angle</Label>
            <Input
              type="number"
              value={Math.round(selected.rotation * 10) / 10}
              onChange={(e) => updateShape(selected.id, { rotation: Number(e.target.value) })}
              className="h-6 text-xs font-mono"
            />
          </div>
          <div>
            <Label className="text-[9px] text-muted-foreground/60">Stroke W</Label>
            <Input
              type="number"
              min={0}
              step={0.5}
              value={selected.strokeWidth}
              onChange={(e) => updateShape(selected.id, { strokeWidth: Math.max(0, Number(e.target.value)) })}
              className="h-6 text-xs font-mono"
            />
          </div>
        </div>
        <div className="mt-1">
          <Label className="text-[9px] text-muted-foreground/60">Opacity</Label>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={selected.opacity}
              onChange={(e) => updateShape(selected.id, { opacity: parseFloat(e.target.value) })}
              className="h-1 flex-1 cursor-pointer accent-primary"
            />
            <span className="w-8 text-right text-[9px] tabular-nums text-muted-foreground/60">
              {Math.round(selected.opacity * 100)}%
            </span>
          </div>
        </div>
      </FieldGroup>

      {/* Colors */}
      <FieldGroup label="Colors" icon={Palette}>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <Input
              type="color"
              value={selected.stroke}
              onChange={(e) => updateShape(selected.id, { stroke: e.target.value })}
              className="h-6 w-8 cursor-pointer shrink-0 p-0.5"
            />
            <Input
              value={selected.stroke}
              onChange={(e) => updateShape(selected.id, { stroke: e.target.value })}
              className="h-6 flex-1 text-[10px] font-mono"
            />
          </div>
          {selected.type !== 'text' && selected.type !== 'dimension' && (
            <div className="flex items-center gap-1.5">
              <Input
                type="color"
                value={selected.fill === 'transparent' ? '#ffffff' : selected.fill}
                onChange={(e) => updateShape(selected.id, { fill: e.target.value })}
                className="h-6 w-8 cursor-pointer shrink-0 p-0.5"
              />
              <Input
                value={selected.fill}
                onChange={(e) => updateShape(selected.id, { fill: e.target.value })}
                className="h-6 flex-1 text-[10px] font-mono"
              />
              <button
                type="button"
                onClick={() => updateShape(selected.id, { fill: 'transparent' })}
                className="shrink-0 rounded px-1.5 py-0.5 text-[9px] text-muted-foreground hover:bg-muted"
                title="Set to transparent"
              >
                None
              </button>
            </div>
          )}
        </div>
      </FieldGroup>

      {/* Layer */}
      <div className="flex flex-col gap-1 border-t border-border/40 pt-2">
        <div className="flex items-center gap-1.5">
          <Layers className="h-3 w-3 text-muted-foreground/60" />
          <Label className="text-[9px] font-medium uppercase text-muted-foreground">Layer</Label>
        </div>
        <select
          value={selected.layerId}
          onChange={(e) => updateShape(selected.id, { layerId: e.target.value } as any)}
          className="h-6 rounded-md border border-border/40 bg-background px-2 text-xs"
        >
          {layers.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
      </div>

      {/* Metadata */}
      <div className="flex flex-col gap-0.5 border-t border-border/40 pt-2 text-[9px] text-muted-foreground/50">
        <span>Type: <span className="capitalize">{selected.type}</span></span>
        <span>ID: <span className="font-mono">{selected.id}</span></span>
      </div>
    </div>
  );
}
