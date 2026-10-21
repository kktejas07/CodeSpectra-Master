'use client';

import React, { useCallback, useRef } from 'react';
import { useCADStore } from '@/lib/cad/store';
import {
  MousePointer2,
  Minus,
  Square,
  Circle,
  Hexagon,
  Hand,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize,
  Grid3X3,
  Magnet,
  Trash2,
  HelpCircle,
  Type,
  Ruler,
  Download,
  Image,
  FileCode,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CADTool } from '@/types/cad';
import { useZoom } from '@/hooks/useZoom';
import { TextToCADModal } from './TextToCADModal';
import { useT } from '@/lib/i18n/client'
import type { Translator } from '@/lib/i18n/catalog'

const tools = (t: Translator): { id: CADTool; label: string; icon: React.ElementType; shortcut: string }[] => ([
  { id: 'select', label: t('common.select'), icon: MousePointer2, shortcut: 'V' },
  { id: 'line', label: t('exam.line'), icon: Minus, shortcut: 'L' },
  { id: 'rectangle', label: t('exam.rectangle'), icon: Square, shortcut: 'R' },
  { id: 'circle', label: t('exam.circle'), icon: Circle, shortcut: 'C' },
  { id: 'polygon', label: t('exam.polygon'), icon: Hexagon, shortcut: 'P' },
  { id: 'text', label: t('exam.text'), icon: Type, shortcut: 'T' },
  { id: 'dimension', label: t('exam.dimension'), icon: Ruler, shortcut: 'D' },
  { id: 'pan', label: t('exam.pan'), icon: Hand, shortcut: 'Space' },
]);

export function Toolbar() {
  const { t } = useT()
  const currentTool = useCADStore((s) => s.tool);
  const setTool = useCADStore((s) => s.setTool);
  const undo = useCADStore((s) => s.undo);
  const redo = useCADStore((s) => s.redo);
  const canUndo = useCADStore((s) => s.canUndo);
  const canRedo = useCADStore((s) => s.canRedo);
  const grid = useCADStore((s) => s.grid);
  const setGrid = useCADStore((s) => s.setGrid);
  const snap = useCADStore((s) => s.snap);
  const setSnap = useCADStore((s) => s.setSnap);
  const selectedIds = useCADStore((s) => s.selectedIds);
  const removeShapes = useCADStore((s) => s.removeShapes);
  const pushHistory = useCADStore((s) => s.pushHistory);
  const { zoomIn, zoomOut, resetZoom } = useZoom();
  const [showExport, setShowExport] = React.useState(false);
  const [isAiModalOpen, setIsAiModalOpen] = React.useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  const handleDelete = () => {
    if (selectedIds.length > 0) {
      pushHistory('Delete');
      removeShapes(selectedIds);
    }
  };

  const handleExportPNG = useCallback(() => {
    const stage = document.querySelector('canvas');
    if (!stage) return;
    const link = document.createElement('a');
    link.download = 'cad-export.png';
    link.href = stage.toDataURL('image/png');
    link.click();
    setShowExport(false);
  }, []);

  const handleExportSVG = useCallback(() => {
    const stageEl = document.querySelector('.konvajs-content');
    if (!stageEl) return;
    const canvas = stageEl.querySelector('canvas');
    if (!canvas) return;

    const { width, height } = canvas;
    const dataUrl = canvas.toDataURL('image/png');

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <image href="${dataUrl}" width="${width}" height="${height}" />
    </svg>`;

    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = 'cad-export.svg';
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
    setShowExport(false);
  }, []);

  return (
    <div className="flex h-12 items-center gap-1 border-b border-border/40 bg-card/80 px-3 backdrop-blur-sm">
      {/* Tool buttons */}
      <div className="flex items-center gap-0.5">
        {tools(t).map((tool) => {
          const Icon = tool.icon;
          const isActive = currentTool === tool.id;
          return (
            <button
              key={tool.id}
              type="button"
              title={`${tool.label} (${tool.shortcut})`}
              onClick={() => setTool(tool.id)}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-md transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
            </button>
          );
        })}
      </div>

      <div className="mx-2 h-6 w-px bg-border/40" />

      {/* Undo / Redo */}
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          title={t('exam.undoCtrlZ')}
          onClick={undo}
          disabled={!canUndo}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Undo2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          title={t('exam.redoCtrlShiftZ')}
          onClick={redo}
          disabled={!canRedo}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Redo2 className="h-4 w-4" />
        </button>
      </div>

      <div className="mx-2 h-6 w-px bg-border/40" />

      {/* Zoom */}
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          title={t('exam.zoomIn')}
          onClick={zoomIn}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button
          type="button"
          title={t('exam.zoomOut')}
          onClick={zoomOut}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <button
          type="button"
          title={t('exam.fitToScreen')}
          onClick={resetZoom}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Maximize className="h-4 w-4" />
        </button>
      </div>

      <div className="mx-2 h-6 w-px bg-border/40" />

      {/* Grid + Snap toggles */}
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          title={t('exam.toggleGrid')}
          onClick={() => setGrid({ visible: !grid.visible })}
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-md transition-colors',
            grid.visible
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          <Grid3X3 className="h-4 w-4" />
        </button>
        <button
          type="button"
          title={t('exam.toggleSnapS')}
          onClick={() => setSnap({ enabled: !snap.enabled })}
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-md transition-colors',
            snap.enabled
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          <Magnet className="h-4 w-4" />
        </button>
      </div>

      <div className="mx-2 h-6 w-px bg-border/40" />

      {/* Delete */}
      <button
        type="button"
        title={t('exam.deleteSelectedDel')}
        onClick={handleDelete}
        disabled={selectedIds.length === 0}
        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <Trash2 className="h-4 w-4" />
      </button>

      <div className="flex-1" />

      {/* AI Text-to-CAD Generator Button */}
      <button
        type="button"
        title={t('exam.aiTextToCadGenerator')}
        onClick={() => setIsAiModalOpen(true)}
        className="flex h-8 items-center gap-1.5 rounded-md px-2.5 bg-primary/10 text-primary hover:bg-primary/20 border border-primary/30 transition-colors shadow-xs"
      >
        <Sparkles className="h-3.5 w-3.5 animate-pulse" />
        <span className="text-xs font-semibold">{t('exam.aiTextToCad')}</span>
      </button>

      <div className="mx-1 h-6 w-px bg-border/40" />

      {/* Export */}
      <div className="relative" ref={exportRef}>
        <button
          type="button"
          title={t('exam.export')}
          onClick={() => setShowExport(!showExport)}
          className="flex h-8 items-center gap-1.5 rounded-md px-2 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Download className="h-3.5 w-3.5" />
          <span className="text-[10px]">{t('exam.export')}</span>
        </button>
        {showExport && (
          <div className="absolute right-0 top-full z-50 mt-1 w-40 rounded-lg border border-border/40 bg-card p-1 shadow-xl">
            <button
              type="button"
              onClick={handleExportPNG}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Image className="h-3.5 w-3.5" />{t('exam.exportPng')}</button>
            <button
              type="button"
              onClick={handleExportSVG}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <FileCode className="h-3.5 w-3.5" />{t('exam.exportSvg')}</button>
          </div>
        )}
      </div>

      <div className="mx-1 h-6 w-px bg-border/40" />

      {/* Keyboard shortcuts help */}
      <button
        type="button"
        title={t('exam.keyboardShortcuts2')}
        onClick={() => window.dispatchEvent(new CustomEvent('cad:toggle-shortcuts'))}
        className="flex h-8 items-center gap-1.5 rounded-md px-2 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <HelpCircle className="h-3.5 w-3.5" />
        <span className="text-[10px]">{t('exam.shortcuts')}</span>
      </button>

      {/* Text to CAD Modal */}
      <TextToCADModal
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
      />
    </div>
  );
}

