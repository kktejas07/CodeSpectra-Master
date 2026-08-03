import React, { useState } from "react";
import { WorkspaceProps } from "./registry";

export const HotspotWorkspace: React.FC<WorkspaceProps> = ({ descriptor, draft, onDraft, readOnly }) => {
  const prompt = (descriptor.prompt as string) || "Click on the target region(s) in the image:";
  const clicks = (draft.clicks as [number, number][]) || [];

  const handleImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (readOnly) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 1000) / 1000;
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 1000) / 1000;

    const nextClicks: [number, number][] = [...clicks, [x, y]];
    onDraft({ ...draft, clicks: nextClicks });
  };

  const handleReset = () => {
    if (readOnly) return;
    onDraft({ ...draft, clicks: [] });
  };

  return (
    <div className="p-6 border rounded-lg bg-slate-900 text-slate-100 space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">{prompt}</h3>
        <button
          onClick={handleReset}
          disabled={readOnly || clicks.length === 0}
          className="text-xs px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700"
        >
          Reset Clicks ({clicks.length})
        </button>
      </div>

      <div
        onClick={handleImageClick}
        className="relative w-full h-80 bg-slate-950 border border-dashed border-slate-700 rounded-lg flex items-center justify-center cursor-crosshair overflow-hidden"
      >
        <span className="text-slate-500 font-mono text-sm">
          [Image Workspace Canvas — Click to place hotspot marker]
        </span>
        {clicks.map(([cx, cy], idx) => (
          <div
            key={idx}
            style={{ left: `${cx * 100}%`, top: `${cy * 100}%` }}
            className="absolute w-6 h-6 -ml-3 -mt-3 rounded-full border-2 border-red-500 bg-red-500/30 flex items-center justify-center text-red-200 font-bold text-xs"
          >
            {idx + 1}
          </div>
        ))}
      </div>
    </div>
  );
};
