import { get, writable } from "svelte/store";
import { CANVAS_HEIGHT, CANVAS_WIDTH } from "./snapping.js";

export interface ViewportState {
  zoom: number;
  panX: number;
  panY: number;
}

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 3;
export const ZOOM_STEP = 1.1;
const FIT_MARGIN = 24;

export const viewport = writable<ViewportState>({ zoom: 1, panX: 0, panY: 0 });

// The viewport DOM element is the untransformed reference frame. We read its
// bounding rect at call time so toCanvasCoords stays correct as the layout
// shifts (sidebars collapsing, window resizing).
let viewportElement: HTMLElement | null = null;

export function setViewportElement(element: HTMLElement | null): void {
  viewportElement = element;
}

export function getViewportRect(): DOMRect | null {
  return viewportElement ? viewportElement.getBoundingClientRect() : null;
}

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

// THE coordinate helper. Every client→canvas conversion (drag, resize, rotate,
// rubber-band, drop) must route through here so the inverse transform lives in
// exactly one place.
export function toCanvasCoords(clientX: number, clientY: number): { x: number; y: number } {
  const rect = getViewportRect();
  const { zoom, panX, panY } = get(viewport);
  if (!rect) {
    return { x: 0, y: 0 };
  }

  return {
    x: (clientX - rect.left - panX) / zoom,
    y: (clientY - rect.top - panY) / zoom
  };
}

export function panBy(dx: number, dy: number): void {
  viewport.update((state) => ({ ...state, panX: state.panX + dx, panY: state.panY + dy }));
}

// Zoom toward a screen point (in client coordinates) so the canvas point under
// the cursor stays fixed.
export function zoomAtClientPoint(nextZoomRaw: number, clientX: number, clientY: number): void {
  const rect = getViewportRect();
  viewport.update((state) => {
    const zoom = clampZoom(nextZoomRaw);
    if (!rect || zoom === state.zoom) {
      return { ...state, zoom };
    }

    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    // Canvas point currently under the cursor.
    const canvasX = (localX - state.panX) / state.zoom;
    const canvasY = (localY - state.panY) / state.zoom;
    // Solve for pan that keeps that canvas point under the same screen point.
    return {
      zoom,
      panX: localX - canvasX * zoom,
      panY: localY - canvasY * zoom
    };
  });
}

// Zoom toward the center of the viewport (used by the +/- toolbar buttons).
export function zoomByStep(factor: number): void {
  const rect = getViewportRect();
  const center = rect
    ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    : { x: 0, y: 0 };
  zoomAtClientPoint(get(viewport).zoom * factor, center.x, center.y);
}

function centeredPan(zoom: number, rect: DOMRect): { panX: number; panY: number } {
  return {
    panX: (rect.width - CANVAS_WIDTH * zoom) / 2,
    panY: (rect.height - CANVAS_HEIGHT * zoom) / 2
  };
}

export function fitToViewport(): void {
  const rect = getViewportRect();
  if (!rect || rect.width === 0 || rect.height === 0) {
    return;
  }

  const zoom = clampZoom(
    Math.min(
      (rect.width - FIT_MARGIN * 2) / CANVAS_WIDTH,
      (rect.height - FIT_MARGIN * 2) / CANVAS_HEIGHT
    )
  );
  viewport.set({ zoom, ...centeredPan(zoom, rect) });
}

// Reset to 100% centered (clicking the percentage readout).
export function resetZoom(): void {
  const rect = getViewportRect();
  viewport.update((state) => {
    const zoom = 1;
    if (!rect) {
      return { ...state, zoom };
    }
    return { zoom, ...centeredPan(zoom, rect) };
  });
}
