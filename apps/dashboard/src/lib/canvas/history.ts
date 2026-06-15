import { derived, get, writable } from "svelte/store";
import type { Socket } from "socket.io-client";
import type { Widget, WidgetUpdate } from "@anomalist/types";
import { SocketEvents } from "@anomalist/types";

export interface Transform {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
}

export type CanvasAction =
  | { kind: "add"; widget: Widget }
  | { kind: "remove"; widget: Widget; index: number }
  | { kind: "update"; widgetId: string; before: WidgetUpdate; after: WidgetUpdate }
  | { kind: "transform"; widgetId: string; before: Transform; after: Transform }
  | { kind: "transformGroup"; entries: Array<{ widgetId: string; before: Transform; after: Transform }> }
  | { kind: "removeGroup"; entries: Array<{ widget: Widget; index: number }> }
  | { kind: "addGroup"; widgets: Widget[] }
  | { kind: "reorder"; before: string[]; after: string[] }
  | { kind: "clear"; sceneId: string; widgets: Widget[] };

interface HistoryEntry {
  action: CanvasAction;
  at: number;
}

const MAX_ENTRIES = 50;
const COALESCE_WINDOW_MS = 1000;

let socket: Socket | null = null;
let currentWidgets: Widget[] = [];
let isApplyingHistory = false;

const undoStack = writable<HistoryEntry[]>([]);
const redoStack = writable<HistoryEntry[]>([]);

export const canUndo = derived(undoStack, (stack) => stack.length > 0);
export const canRedo = derived(redoStack, (stack) => stack.length > 0);

export function configureHistory(nextSocket: Socket | null, widgets: Widget[]) {
  socket = nextSocket;
  currentWidgets = widgets;
}

export function clearHistory() {
  undoStack.set([]);
  redoStack.set([]);
}

function findWidget(widgetId: string): Widget | undefined {
  return currentWidgets.find((widget) => widget.id === widgetId);
}

// Signature of which fields an update touches, so rapid edits to the same
// field can be coalesced into one history entry.
function updateFieldSignature(part: WidgetUpdate): string {
  const topKeys = Object.keys(part)
    .filter((key) => key !== "id" && key !== "props")
    .sort();
  const propKeys = part.props ? Object.keys(part.props).sort() : [];
  return JSON.stringify([topKeys, propKeys]);
}

export function push(action: CanvasAction) {
  if (isApplyingHistory) {
    return;
  }

  undoStack.update((stack) => {
    const now = Date.now();
    const last = stack[stack.length - 1];

    if (
      action.kind === "update" &&
      last &&
      last.action.kind === "update" &&
      last.action.widgetId === action.widgetId &&
      now - last.at <= COALESCE_WINDOW_MS &&
      updateFieldSignature(last.action.after) === updateFieldSignature(action.after)
    ) {
      const merged: HistoryEntry = {
        at: now,
        action: {
          ...last.action,
          after: action.after
        }
      };
      return [...stack.slice(0, -1), merged];
    }

    const next = [...stack, { action, at: now }];
    return next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next;
  });

  redoStack.set([]);
}

// Record a WIDGET_UPDATE payload as an `update` action, capturing the changed
// fields' current values as `before`. Props that did not exist before are
// recorded as null so undo can blank them out.
export function recordUpdateFromPayload(payload: WidgetUpdate) {
  if (isApplyingHistory) {
    return;
  }

  const widget = findWidget(payload.id);
  if (!widget) {
    return;
  }

  const before: WidgetUpdate = { id: payload.id };
  const after: WidgetUpdate = { id: payload.id };
  let changed = false;

  for (const [key, value] of Object.entries(payload)) {
    if (key === "id" || key === "props") {
      continue;
    }

    const previous = (widget as unknown as Record<string, unknown>)[key];
    if (previous !== value) {
      (before as Record<string, unknown>)[key] = previous;
      (after as Record<string, unknown>)[key] = value;
      changed = true;
    }
  }

  if (payload.props && typeof payload.props === "object") {
    const beforeProps: Record<string, unknown> = {};
    const afterProps: Record<string, unknown> = {};
    let propsChanged = false;

    for (const [key, value] of Object.entries(payload.props)) {
      const previous = widget.props[key];
      if (JSON.stringify(previous) !== JSON.stringify(value)) {
        beforeProps[key] = previous === undefined ? null : previous;
        afterProps[key] = value;
        propsChanged = true;
      }
    }

    if (propsChanged) {
      before.props = beforeProps;
      after.props = afterProps;
      changed = true;
    }
  }

  if (changed) {
    push({ kind: "update", widgetId: payload.id, before, after });
  }
}

// Re-add a removed widget (server accepts the client-supplied id) and restore
// its z-position. The reorder is processed after the add because socket
// messages are ordered.
function emitRestoreWidget(widget: Widget, index: number) {
  if (!socket) {
    return;
  }

  socket.emit(SocketEvents.WIDGET_ADD, widget);

  const ids = currentWidgets.map((item) => item.id).filter((id) => id !== widget.id);
  ids.splice(Math.min(Math.max(0, index), ids.length), 0, widget.id);
  socket.emit(SocketEvents.WIDGET_REORDER, { widgetIds: ids });
}

// Returns false when the entry is stale (target widget gone) and should be
// silently discarded.
function applyUndo(action: CanvasAction): boolean {
  if (!socket) {
    return false;
  }

  switch (action.kind) {
    case "add": {
      if (!findWidget(action.widget.id)) {
        return false;
      }
      socket.emit(SocketEvents.WIDGET_REMOVE, { id: action.widget.id });
      return true;
    }
    case "remove": {
      if (findWidget(action.widget.id)) {
        return false;
      }
      emitRestoreWidget(action.widget, action.index);
      return true;
    }
    case "update": {
      if (!findWidget(action.widgetId)) {
        return false;
      }
      socket.emit(SocketEvents.WIDGET_UPDATE, { ...action.before, id: action.widgetId });
      return true;
    }
    case "transform": {
      if (!findWidget(action.widgetId)) {
        return false;
      }
      socket.emit(SocketEvents.WIDGET_UPDATE, { id: action.widgetId, ...action.before });
      return true;
    }
    case "transformGroup": {
      let applied = false;
      for (const entry of action.entries) {
        if (findWidget(entry.widgetId)) {
          socket.emit(SocketEvents.WIDGET_UPDATE, { id: entry.widgetId, ...entry.before });
          applied = true;
        }
      }
      return applied;
    }
    case "removeGroup": {
      const missing = [...action.entries]
        .sort((a, b) => a.index - b.index)
        .filter((entry) => !findWidget(entry.widget.id));
      if (missing.length === 0) {
        return false;
      }

      const ids = currentWidgets.map((item) => item.id).filter((id) => !missing.some((entry) => entry.widget.id === id));
      for (const entry of missing) {
        socket.emit(SocketEvents.WIDGET_ADD, entry.widget);
        ids.splice(Math.min(Math.max(0, entry.index), ids.length), 0, entry.widget.id);
      }
      socket.emit(SocketEvents.WIDGET_REORDER, { widgetIds: ids });
      return true;
    }
    case "addGroup": {
      let applied = false;
      for (const widget of action.widgets) {
        if (findWidget(widget.id)) {
          socket.emit(SocketEvents.WIDGET_REMOVE, { id: widget.id });
          applied = true;
        }
      }
      return applied;
    }
    case "reorder": {
      socket.emit(SocketEvents.WIDGET_REORDER, { widgetIds: action.before });
      return true;
    }
    case "clear": {
      for (const widget of action.widgets) {
        if (!findWidget(widget.id)) {
          socket.emit(SocketEvents.WIDGET_ADD, widget);
        }
      }
      socket.emit(SocketEvents.WIDGET_REORDER, { widgetIds: action.widgets.map((widget) => widget.id) });
      return true;
    }
  }
}

function applyRedo(action: CanvasAction): boolean {
  if (!socket) {
    return false;
  }

  switch (action.kind) {
    case "add": {
      if (findWidget(action.widget.id)) {
        return false;
      }
      socket.emit(SocketEvents.WIDGET_ADD, action.widget);
      return true;
    }
    case "remove": {
      if (!findWidget(action.widget.id)) {
        return false;
      }
      socket.emit(SocketEvents.WIDGET_REMOVE, { id: action.widget.id });
      return true;
    }
    case "update": {
      if (!findWidget(action.widgetId)) {
        return false;
      }
      socket.emit(SocketEvents.WIDGET_UPDATE, { ...action.after, id: action.widgetId });
      return true;
    }
    case "transform": {
      if (!findWidget(action.widgetId)) {
        return false;
      }
      socket.emit(SocketEvents.WIDGET_UPDATE, { id: action.widgetId, ...action.after });
      return true;
    }
    case "transformGroup": {
      let applied = false;
      for (const entry of action.entries) {
        if (findWidget(entry.widgetId)) {
          socket.emit(SocketEvents.WIDGET_UPDATE, { id: entry.widgetId, ...entry.after });
          applied = true;
        }
      }
      return applied;
    }
    case "removeGroup": {
      let applied = false;
      for (const entry of action.entries) {
        if (findWidget(entry.widget.id)) {
          socket.emit(SocketEvents.WIDGET_REMOVE, { id: entry.widget.id });
          applied = true;
        }
      }
      return applied;
    }
    case "addGroup": {
      let applied = false;
      for (const widget of action.widgets) {
        if (!findWidget(widget.id)) {
          socket.emit(SocketEvents.WIDGET_ADD, widget);
          applied = true;
        }
      }
      return applied;
    }
    case "reorder": {
      socket.emit(SocketEvents.WIDGET_REORDER, { widgetIds: action.after });
      return true;
    }
    case "clear": {
      socket.emit(SocketEvents.SCENE_CLEAR, { sceneId: action.sceneId });
      return true;
    }
  }
}

export function undo() {
  const stack = get(undoStack);
  const entry = stack[stack.length - 1];
  if (!entry) {
    return;
  }

  undoStack.update((items) => items.slice(0, -1));

  isApplyingHistory = true;
  let applied = false;
  try {
    applied = applyUndo(entry.action);
  } finally {
    isApplyingHistory = false;
  }

  if (applied) {
    redoStack.update((items) => {
      const next = [...items, entry];
      return next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next;
    });
  }
}

export function redo() {
  const stack = get(redoStack);
  const entry = stack[stack.length - 1];
  if (!entry) {
    return;
  }

  redoStack.update((items) => items.slice(0, -1));

  isApplyingHistory = true;
  let applied = false;
  try {
    applied = applyRedo(entry.action);
  } finally {
    isApplyingHistory = false;
  }

  if (applied) {
    undoStack.update((items) => {
      const next = [...items, entry];
      return next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next;
    });
  }
}
