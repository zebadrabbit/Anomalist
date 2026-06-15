import type { Widget } from "@anomalist/types";

export const GRID_SIZE = 10;
export const SNAP_THRESHOLD = 5;
export const CANVAS_WIDTH = 1920;
export const CANVAS_HEIGHT = 1080;

export interface GuideTargets {
  vertical: number[];
  horizontal: number[];
}

export interface DragSnapResult {
  x: number;
  y: number;
  verticalGuides: number[];
  horizontalGuides: number[];
}

interface AxisSnap {
  position: number;
  guide: number;
  distance: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function snapToGrid(value: number, gridSize: number = GRID_SIZE): number {
  return Math.round(value / gridSize) * gridSize;
}

export function collectGuideTargets(
  widgets: Widget[],
  draggedWidgetId: string,
  canvasWidth: number = CANVAS_WIDTH,
  canvasHeight: number = CANVAS_HEIGHT
): GuideTargets {
  const vertical = new Set<number>([0, canvasWidth / 2, canvasWidth]);
  const horizontal = new Set<number>([0, canvasHeight / 2, canvasHeight]);

  for (const widget of widgets) {
    if (widget.id === draggedWidgetId || !widget.visible) {
      continue;
    }

    vertical.add(widget.x);
    vertical.add(widget.x + widget.width / 2);
    vertical.add(widget.x + widget.width);
    horizontal.add(widget.y);
    horizontal.add(widget.y + widget.height / 2);
    horizontal.add(widget.y + widget.height);
  }

  return {
    vertical: [...vertical].sort((a, b) => a - b),
    horizontal: [...horizontal].sort((a, b) => a - b)
  };
}

function snapAxis(position: number, size: number, targets: number[], threshold: number): AxisSnap | null {
  const anchors = [0, size / 2, size];
  let best: AxisSnap | null = null;

  for (const target of targets) {
    for (const anchor of anchors) {
      const distance = Math.abs(position + anchor - target);
      if (distance <= threshold && (!best || distance < best.distance)) {
        best = { position: target - anchor, guide: target, distance };
      }
    }
  }

  return best;
}

export interface DragSnapOptions {
  width: number;
  height: number;
  targets: GuideTargets | null;
  gridEnabled: boolean;
  disableSnap?: boolean;
  gridSize?: number;
  threshold?: number;
  canvasWidth?: number;
  canvasHeight?: number;
}

export function resolveDragPosition(x: number, y: number, options: DragSnapOptions): DragSnapResult {
  const {
    width,
    height,
    targets,
    gridEnabled,
    disableSnap = false,
    gridSize = GRID_SIZE,
    threshold = SNAP_THRESHOLD,
    canvasWidth = CANVAS_WIDTH,
    canvasHeight = CANVAS_HEIGHT
  } = options;

  const maxX = Math.max(0, canvasWidth - width);
  const maxY = Math.max(0, canvasHeight - height);
  let nextX = clamp(x, 0, maxX);
  let nextY = clamp(y, 0, maxY);
  const verticalGuides: number[] = [];
  const horizontalGuides: number[] = [];

  if (!disableSnap) {
    if (targets) {
      const verticalSnap = snapAxis(nextX, width, targets.vertical, threshold);
      if (verticalSnap) {
        nextX = verticalSnap.position;
        verticalGuides.push(verticalSnap.guide);
      }

      const horizontalSnap = snapAxis(nextY, height, targets.horizontal, threshold);
      if (horizontalSnap) {
        nextY = horizontalSnap.position;
        horizontalGuides.push(horizontalSnap.guide);
      }
    }

    // Guides take priority; grid snapping only applies to axes without an active guide.
    if (gridEnabled) {
      if (verticalGuides.length === 0) {
        nextX = snapToGrid(nextX, gridSize);
      }
      if (horizontalGuides.length === 0) {
        nextY = snapToGrid(nextY, gridSize);
      }
    }

    nextX = clamp(nextX, 0, maxX);
    nextY = clamp(nextY, 0, maxY);
  }

  return {
    x: Math.round(nextX),
    y: Math.round(nextY),
    verticalGuides,
    horizontalGuides
  };
}
