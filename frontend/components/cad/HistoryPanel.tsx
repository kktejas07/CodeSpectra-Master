'use client';

import React from 'react';
import { useCADStore } from '@/lib/cad/store';
import { cn } from '@/lib/utils';
import { History, Undo2, Redo2 } from 'lucide-react';

export function HistoryPanel() {
  const history = useCADStore((s) => s.history);
  const historyIndex = useCADStore((s) => s.historyIndex);
  const undo = useCADStore((s) => s.undo);
  const redo = useCADStore((s) => s.redo);
  const jumpToHistory = useCADStore((s) => s.jumpToHistory);

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase text-muted-foreground">History</span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={undo}
            disabled={historyIndex < 0}
            className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
            title="Undo"
          >
            <Undo2 className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={historyIndex >= history.length - 1}
            className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
            title="Redo"
          >
            <Redo2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {history.length === 0 ? (
        <div className="py-4 text-center text-[10px] text-muted-foreground">
          No history yet
        </div>
      ) : (
        <div className="flex max-h-40 flex-col gap-0.5 overflow-y-auto">
          {history.map((entry, i) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => jumpToHistory(i)}
              className={cn(
                'flex items-center gap-2 rounded-md px-2 py-1 text-left text-[11px] transition-colors',
                i === historyIndex
                  ? 'bg-primary/10 text-primary font-medium'
                  : i < historyIndex
                    ? 'text-foreground hover:bg-muted/50'
                    : 'text-muted-foreground/50 hover:bg-muted/50'
              )}
            >
              <History className="h-2.5 w-2.5 shrink-0 opacity-50" />
              <span className="truncate">{entry.description}</span>
              <span className="ml-auto shrink-0 text-[9px] opacity-40">
                {entry.shapeCount} obj{entry.shapeCount !== 1 ? 's' : ''}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
