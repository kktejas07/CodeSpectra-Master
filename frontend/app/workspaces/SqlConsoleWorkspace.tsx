import React from "react";
import { WorkspaceProps } from "./registry";

export const SqlConsoleWorkspace: React.FC<WorkspaceProps> = ({ descriptor, draft, onDraft, onRun, readOnly }) => {
  const prompt = (descriptor.prompt as string) || "Write your SQL query below:";
  const query = (draft.query as string) || "";
  const forbid = (descriptor.forbid as string[]) || [];

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (readOnly) return;
    onDraft({ ...draft, query: e.target.value });
  };

  return (
    <div className="p-6 border rounded-lg bg-slate-900 text-slate-100 space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">{prompt}</h3>
        {forbid.length > 0 && (
          <span className="text-xs text-amber-400 font-mono">
            Forbidden: {forbid.join(", ")}
          </span>
        )}
      </div>
      <textarea
        value={query}
        onChange={handleChange}
        disabled={readOnly}
        rows={8}
        placeholder="SELECT * FROM table_name WHERE ..."
        className="w-full p-4 rounded bg-slate-950 font-mono text-sm border border-slate-800 text-emerald-400 focus:outline-none focus:border-indigo-500"
      />
      {onRun && (
        <button
          onClick={() => onRun()}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded text-sm transition-colors"
        >
          Execute Query (Dry Run)
        </button>
      )}
    </div>
  );
};
