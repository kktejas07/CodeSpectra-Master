'use client';

import React, { useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

const shortcuts = [
  { category: 'Tools', items: [
    { keys: 'V', action: 'Select tool' },
    { keys: 'L', action: 'Line tool' },
    { keys: 'R', action: 'Rectangle tool' },
    { keys: 'C', action: 'Circle tool' },
    { keys: 'P', action: 'Polygon tool' },
    { keys: 'T', action: 'Text tool' },
    { keys: 'D', action: 'Dimension tool' },
    { keys: 'Space', action: 'Pan (hold)' },
    { keys: 'S', action: 'Toggle snap' },
  ]},
  { category: 'Edit', items: [
    { keys: 'Ctrl+Z', action: 'Undo' },
    { keys: 'Ctrl+Shift+Z', action: 'Redo' },
    { keys: 'Ctrl+Y', action: 'Redo' },
    { keys: 'Ctrl+C', action: 'Copy' },
    { keys: 'Ctrl+V', action: 'Paste' },
    { keys: 'Ctrl+D', action: 'Duplicate' },
    { keys: 'Ctrl+A', action: 'Select all' },
    { keys: 'Delete', action: 'Delete selected' },
  ]},
  { category: 'Canvas', items: [
    { keys: 'Scroll', action: 'Zoom in/out' },
    { keys: 'Middle Mouse', action: 'Pan' },
    { keys: 'Shift+Click', action: 'Multi-select' },
  ]},
];

interface ShortcutsOverlayProps {
  open: boolean;
  onClose: () => void;
}

export function ShortcutsOverlay({ open, onClose }: ShortcutsOverlayProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (open) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-border/40 bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Keyboard Shortcuts</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {shortcuts.map((group) => (
            <div key={group.category}>
              <h3 className="mb-2 text-[10px] font-medium uppercase text-muted-foreground">
                {group.category}
              </h3>
              <div className="flex flex-col gap-1">
                {group.items.map((item) => (
                  <div key={item.keys} className="flex items-center justify-between gap-3">
                    <span className="text-xs text-muted-foreground">{item.action}</span>
                    <kbd className="shrink-0 rounded border border-border/60 bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground">
                      {item.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 border-t border-border/40 pt-3 text-center text-[10px] text-muted-foreground/50">
          Press <kbd className="rounded border border-border/60 bg-muted px-1 py-0.5 font-mono">?</kbd> to toggle this overlay
        </div>
      </div>
    </div>
  );
}
