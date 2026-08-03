import React from "react";
import { McqWorkspace } from "./McqWorkspace";
import { SqlConsoleWorkspace } from "./SqlConsoleWorkspace";
import { HotspotWorkspace } from "./HotspotWorkspace";
import { VideoRecorderWorkspace } from "./VideoRecorderWorkspace";

export type WorkspaceKind =
  | "code_editor"
  | "sql_console"
  | "file_upload"
  | "video_recorder"
  | "rich_text"
  | "spreadsheet"
  | "cad_embed"
  | "simulation"
  | "mcq";

export interface IntegrityController {
  isFullscreen: boolean;
  blurCount: number;
  pasteCount: number;
  reportSignal(kind: string, severity: number, detail?: Record<string, unknown>): void;
}

export interface WorkspaceProps {
  descriptor: Record<string, unknown>;
  draft: Record<string, unknown>;
  onDraft(next: Record<string, unknown>): void;
  onRun?(): Promise<{ success: boolean; output: string }>;
  integrity?: IntegrityController;
  readOnly?: boolean;
}

const StubWorkspace: React.FC<WorkspaceProps> = ({ descriptor }) => {
  return (
    <div className="p-4 border rounded bg-slate-900 text-slate-100 font-mono">
      <h3 className="font-semibold mb-2">Workspace Descriptor</h3>
      <pre className="text-xs">{JSON.stringify(descriptor, null, 2)}</pre>
    </div>
  );
};

export const WORKSPACES: Record<WorkspaceKind, React.FC<WorkspaceProps>> = {
  code_editor: StubWorkspace,
  sql_console: SqlConsoleWorkspace,
  file_upload: HotspotWorkspace,
  video_recorder: VideoRecorderWorkspace,
  cad_embed: StubWorkspace,
  spreadsheet: StubWorkspace,
  mcq: McqWorkspace,
  rich_text: StubWorkspace,
  simulation: StubWorkspace,
};
