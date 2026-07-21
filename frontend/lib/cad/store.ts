import { create } from 'zustand';
import type {
  CADTool,
  CADShape,
  CADLayer,
  CanvasTransform,
  GridSettings,
  SnapSettings,
  Point,
} from '@/types/cad';
import { DEFAULT_GRID, DEFAULT_SNAP, DEFAULT_LAYER } from '@/types/cad';
import { generateId } from '@/lib/cad/math';

interface SelectionBox {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export interface HistoryEntry {
  id: string;
  description: string;
  shapes: CADShape[];
  shapeCount: number;
  timestamp: number;
}

interface CADState {
  tool: CADTool;
  shapes: CADShape[];
  layers: CADLayer[];
  activeLayerId: string;
  transform: CanvasTransform;
  grid: GridSettings;
  snap: SnapSettings;
  selectedIds: string[];
  clipboard: CADShape[];
  drawingShape: CADShape | null;
  selectionBox: SelectionBox | null;
  isPanning: boolean;
  isDrawing: boolean;
  cursorPosition: Point;
  canUndo: boolean;
  canRedo: boolean;
  history: HistoryEntry[];
  historyIndex: number;

  setTool: (tool: CADTool) => void;
  addShape: (shape: CADShape) => void;
  updateShape: (id: string, updates: Partial<CADShape>) => void;
  removeShape: (id: string) => void;
  removeShapes: (ids: string[]) => void;
  setShapes: (shapes: CADShape[]) => void;
  selectShape: (id: string, additive?: boolean) => void;
  deselectAll: () => void;
  selectAll: () => void;
  setTransform: (transform: Partial<CanvasTransform>) => void;
  setGrid: (grid: Partial<GridSettings>) => void;
  setSnap: (snap: Partial<SnapSettings>) => void;
  setDrawingShape: (shape: CADShape | null) => void;
  setSelectionBox: (box: SelectionBox | null) => void;
  setIsPanning: (panning: boolean) => void;
  setIsDrawing: (drawing: boolean) => void;
  setCursorPosition: (pos: Point) => void;
  addLayer: (name: string) => string;
  removeLayer: (id: string) => void;
  updateLayer: (id: string, updates: Partial<CADLayer>) => void;
  reorderLayers: (fromIndex: number, toIndex: number) => void;
  setActiveLayer: (id: string) => void;
  setClipboard: (shapes: CADShape[]) => void;
  pushHistory: (description: string) => void;
  undo: () => void;
  redo: () => void;
  jumpToHistory: (index: number) => void;
  setHistoryState: (canUndo: boolean, canRedo: boolean) => void;
  getVisibleShapes: () => CADShape[];
}

export const useCADStore = create<CADState>((set, get) => ({
  tool: 'select',
  shapes: [],
  layers: [{ ...DEFAULT_LAYER }],
  activeLayerId: 'layer-default',
  transform: { x: 0, y: 0, scale: 1 },
  grid: { ...DEFAULT_GRID },
  snap: { ...DEFAULT_SNAP },
  selectedIds: [],
  clipboard: [],
  drawingShape: null,
  selectionBox: null,
  isPanning: false,
  isDrawing: false,
  cursorPosition: { x: 0, y: 0 },
  canUndo: false,
  canRedo: false,
  history: [],
  historyIndex: -1,

  setTool: (tool) => set({ tool, drawingShape: null, isDrawing: false }),

  addShape: (shape) =>
    set((state) => ({ shapes: [...state.shapes, shape] })),

  updateShape: (id, updates) =>
    set((state) => ({
      shapes: state.shapes.map((s) =>
        s.id === id ? { ...s, ...updates } as CADShape : s
      ),
    })),

  removeShape: (id) =>
    set((state) => ({
      shapes: state.shapes.filter((s) => s.id !== id),
      selectedIds: state.selectedIds.filter((sid) => sid !== id),
    })),

  removeShapes: (ids) =>
    set((state) => ({
      shapes: state.shapes.filter((s) => !ids.includes(s.id)),
      selectedIds: state.selectedIds.filter((sid) => !ids.includes(sid)),
    })),

  setShapes: (shapes) => set({ shapes }),

  selectShape: (id, additive = false) =>
    set((state) => {
      if (additive) {
        const exists = state.selectedIds.includes(id);
        return {
          selectedIds: exists
            ? state.selectedIds.filter((sid) => sid !== id)
            : [...state.selectedIds, id],
        };
      }
      return { selectedIds: [id] };
    }),

  deselectAll: () => set({ selectedIds: [] }),

  selectAll: () =>
    set((state) => {
      const selectable = state.shapes
        .filter((s) => {
          const layer = state.layers.find((l) => l.id === s.layerId);
          return layer && layer.visible && !layer.locked && !s.locked;
        })
        .map((s) => s.id);
      return { selectedIds: selectable };
    }),

  setTransform: (partial) =>
    set((state) => ({
      transform: { ...state.transform, ...partial },
    })),

  setGrid: (partial) =>
    set((state) => ({
      grid: { ...state.grid, ...partial },
    })),

  setSnap: (partial) =>
    set((state) => ({
      snap: { ...state.snap, ...partial },
    })),

  setDrawingShape: (shape) => set({ drawingShape: shape }),

  setSelectionBox: (box) => set({ selectionBox: box }),

  setIsPanning: (panning) => set({ isPanning: panning }),

  setIsDrawing: (drawing) => set({ isDrawing: drawing }),

  setCursorPosition: (pos) => set({ cursorPosition: pos }),

  addLayer: (name) => {
    const id = `layer-${generateId()}`;
    set((state) => ({
      layers: [
        ...state.layers,
        { id, name, visible: true, locked: false, opacity: 1, order: state.layers.length },
      ],
      activeLayerId: id,
    }));
    return id;
  },

  removeLayer: (id) =>
    set((state) => {
      if (state.layers.length <= 1) return state;
      const filtered = state.layers.filter((l) => l.id !== id);
      return {
        layers: filtered,
        shapes: state.shapes.filter((s) => s.layerId !== id),
        activeLayerId:
          state.activeLayerId === id ? filtered[0].id : state.activeLayerId,
      };
    }),

  updateLayer: (id, updates) =>
    set((state) => ({
      layers: state.layers.map((l) =>
        l.id === id ? { ...l, ...updates } : l
      ),
    })),

  reorderLayers: (fromIndex, toIndex) =>
    set((state) => {
      const newLayers = [...state.layers];
      const [moved] = newLayers.splice(fromIndex, 1);
      newLayers.splice(toIndex, 0, moved);
      return { layers: newLayers.map((l, i) => ({ ...l, order: i })) };
    }),

  setActiveLayer: (id) => set({ activeLayerId: id }),

  setClipboard: (shapes) => set({ clipboard: shapes }),

  pushHistory: (description: string) => {
    const { shapes, history, historyIndex } = get();
    const snapshot = JSON.parse(JSON.stringify(shapes));

    const trimmedHistory = historyIndex < history.length - 1
      ? history.slice(0, historyIndex + 1)
      : history;

    const entry: HistoryEntry = {
      id: `h-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      description,
      shapes: snapshot,
      shapeCount: snapshot.length,
      timestamp: Date.now(),
    };

    const newHistory = [...trimmedHistory, entry];
    if (newHistory.length > 100) newHistory.shift();

    set({
      history: newHistory,
      historyIndex: newHistory.length - 1,
      canUndo: true,
      canRedo: false,
    });
  },

  undo: () => {
    const { history, historyIndex, shapes } = get();
    if (historyIndex < 0) return;

    const newHistoryIndex = historyIndex - 1;
    const prevShapes = newHistoryIndex >= 0
      ? history[newHistoryIndex].shapes
      : [];

    set({
      shapes: JSON.parse(JSON.stringify(prevShapes)),
      historyIndex: newHistoryIndex,
      canUndo: newHistoryIndex >= 0,
      canRedo: true,
      selectedIds: [],
    });
  },

  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex >= history.length - 1) return;

    const newHistoryIndex = historyIndex + 1;
    const nextShapes = history[newHistoryIndex].shapes;

    set({
      shapes: JSON.parse(JSON.stringify(nextShapes)),
      historyIndex: newHistoryIndex,
      canUndo: true,
      canRedo: newHistoryIndex < history.length - 1,
      selectedIds: [],
    });
  },

  jumpToHistory: (index: number) => {
    const { history } = get();
    if (index < 0 || index >= history.length) return;

    const targetShapes = history[index].shapes;
    set({
      shapes: JSON.parse(JSON.stringify(targetShapes)),
      historyIndex: index,
      canUndo: index >= 0,
      canRedo: index < history.length - 1,
      selectedIds: [],
    });
  },

  setHistoryState: (canUndo, canRedo) => set({ canUndo, canRedo }),

  getVisibleShapes: () => {
    const { shapes, layers } = get();
    const visibleLayerIds = new Set(layers.filter((l) => l.visible).map((l) => l.id));
    return shapes.filter((s) => visibleLayerIds.has(s.layerId) && s.visible);
  },
}));
