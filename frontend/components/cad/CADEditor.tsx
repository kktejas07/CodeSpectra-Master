'use client';

import React from 'react';
import { Toolbar } from './Toolbar';
import { StatusBar } from './StatusBar';
import { LayersPanel } from './LayersPanel';
import { PropertiesPanel } from './PropertiesPanel';
import { HistoryPanel } from './HistoryPanel';
import { CADCanvas } from './CADCanvas';

export function CADEditor() {
  return (
    <div className="flex h-[calc(100vh-4rem)] w-full flex-col overflow-hidden rounded-lg border border-border/40 bg-card shadow-sm">
      <Toolbar />

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Layers */}
        <div className="w-56 shrink-0 overflow-y-auto border-r border-border/40 bg-card/50">
          <LayersPanel />
        </div>

        {/* Center: Canvas */}
        <div className="flex-1 overflow-hidden">
          <CADCanvas />
        </div>

        {/* Right: Properties + History */}
        <div className="w-60 shrink-0 overflow-y-auto border-l border-border/40 bg-card/50">
          <PropertiesPanel />
          <div className="border-t border-border/40">
            <HistoryPanel />
          </div>
        </div>
      </div>

      <StatusBar />
    </div>
  );
}
