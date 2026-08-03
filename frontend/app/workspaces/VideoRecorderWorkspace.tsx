import React, { useState } from "react";
import { WorkspaceProps } from "./registry";

export const VideoRecorderWorkspace: React.FC<WorkspaceProps> = ({ descriptor, draft, onDraft, readOnly }) => {
  const prompt = (descriptor.prompt as string) || "Record your response:";
  const transcript = (draft.transcript as string) || "";
  const [recording, setRecording] = useState(false);

  const toggleRecording = () => {
    if (readOnly) return;
    if (!recording) {
      setRecording(true);
    } else {
      setRecording(false);
      onDraft({
        ...draft,
        transcript: transcript || "Spoken response recorded successfully. Sample transcript generated.",
      });
    }
  };

  return (
    <div className="p-6 border rounded-lg bg-slate-900 text-slate-100 space-y-4">
      <h3 className="text-lg font-medium">{prompt}</h3>
      <div className="p-6 border rounded-lg bg-slate-950 flex flex-col items-center justify-center space-y-4">
        <div className={`w-16 h-16 rounded-full flex items-center justify-center ${recording ? "bg-red-600 animate-pulse" : "bg-indigo-600"}`}>
          <span className="text-xl">🎙️</span>
        </div>
        <button
          onClick={toggleRecording}
          disabled={readOnly}
          className={`px-6 py-2 rounded-md font-semibold text-sm transition-colors ${
            recording ? "bg-red-600 text-white" : "bg-indigo-600 hover:bg-indigo-500 text-white"
          }`}
        >
          {recording ? "Stop Recording" : "Start Video / Audio Recording"}
        </button>
      </div>

      <div className="space-y-2">
        <label className="text-xs text-slate-400 font-medium">Recorded Transcript / Accessibility Text Alternative:</label>
        <textarea
          value={transcript}
          onChange={(e) => onDraft({ ...draft, transcript: e.target.value })}
          disabled={readOnly}
          rows={4}
          placeholder="Transcript text will appear here..."
          className="w-full p-3 rounded bg-slate-950 text-sm border border-slate-800 text-slate-200 focus:outline-none focus:border-indigo-500"
        />
      </div>
    </div>
  );
};
