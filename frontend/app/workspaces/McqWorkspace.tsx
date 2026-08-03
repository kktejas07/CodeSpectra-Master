import React, { useState } from "react";
import { WorkspaceProps } from "./registry";

export const McqWorkspace: React.FC<WorkspaceProps> = ({ descriptor, draft, onDraft, readOnly }) => {
  const prompt = (descriptor.prompt as string) || "Select the correct option:";
  const options = (descriptor.options as string[]) || [];
  const selectedIndex = (draft.selected_option_index as number) ?? null;

  const handleSelect = (idx: number) => {
    if (readOnly) return;
    onDraft({ ...draft, selected_option_index: idx });
  };

  return (
    <div className="p-6 border rounded-lg bg-slate-900 text-slate-100 space-y-4">
      <h3 className="text-lg font-medium text-slate-100">{prompt}</h3>
      <div className="space-y-2">
        {options.map((opt, idx) => (
          <button
            key={idx}
            onClick={() => handleSelect(idx)}
            disabled={readOnly}
            className={`w-full text-left px-4 py-3 rounded-md border transition-colors ${
              selectedIndex === idx
                ? "bg-indigo-600 border-indigo-500 text-white"
                : "bg-slate-800 border-slate-700 hover:bg-slate-750 text-slate-200"
            }`}
          >
            <span className="font-semibold mr-2">{String.fromCharCode(65 + idx)}.</span>
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
};
