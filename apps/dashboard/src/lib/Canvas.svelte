<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { createEventDispatcher } from "svelte";
  import type { CanvasState, Widget } from "@anomalist/types";
  import { SocketEvents } from "@anomalist/types";
  import type { Socket } from "socket.io-client";
  import {
    CANVAS_HEIGHT,
    CANVAS_WIDTH,
    GRID_SIZE,
    collectGuideTargets,
    resolveDragPosition,
    snapToGrid,
    type GuideTargets
  } from "./canvas/snapping.js";
  import { canRedo, canUndo, push as pushHistory, redo, undo, type Transform } from "./canvas/history.js";
  import {
    fitToViewport,
    panBy,
    resetZoom,
    setViewportElement,
    toCanvasCoords,
    viewport,
    zoomAtClientPoint,
    zoomByStep,
    ZOOM_STEP
  } from "./canvas/viewport.js";

  const SYSTEM_FONT_NAMES = new Set(["Arial", "Helvetica", "Georgia", "Times New Roman", "Courier New", "Impact"]);
  const MIN_SIZE = 20;
  const SNAP_STORAGE_KEY = "anomalist.snapEnabled";
  const NUDGE_COMMIT_DELAY = 300;

  type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

  interface InteractionState {
    mode: "drag" | "resize" | "rotate";
    widgetId: string;
    startPoint: { x: number; y: number };
    startWidget: Widget;
    handle?: ResizeHandle;
    moved?: boolean;
    // Group drag only: snapshot of every selected, unlocked widget at drag
    // start, plus their combined bounding box (snapping applies to the box).
    groupStarts?: Widget[];
    groupBox?: { x: number; y: number; width: number; height: number };
  }

  interface EffectToggle {
    enabled?: boolean;
  }

  interface GlowEffect extends EffectToggle {
    color?: string;
    radius?: number;
  }

  interface ShadowEffect extends EffectToggle {
    color?: string;
    x?: number;
    y?: number;
    blur?: number;
  }

  interface OutlineEffect extends EffectToggle {
    color?: string;
    width?: number;
  }

  interface GradientTextEffect extends EffectToggle {
    angle?: number;
    color1?: string;
    color2?: string;
  }

  interface WidgetEffects {
    glow?: GlowEffect;
    shadow?: ShadowEffect;
    outline?: OutlineEffect;
    gradientText?: GradientTextEffect;
  }

  export let stagingState: CanvasState;
  export let socket: Socket | null;
  export let selectedWidgetIds: string[] = [];
  export let canTransform = true;

  const dispatch = createEventDispatcher<{
    select: string[];
    requestDelete: string;
    requestDuplicate: string;
    mediaDrop: { url: string; kind: string; name: string; x: number; y: number; snap: boolean };
  }>();

  const MEDIA_DRAG_MIME = "application/x-anomalist-media";

  let viewportElement: HTMLDivElement | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let viewportInitialized = false;
  let spaceHeld = false;
  let mediaDragOver = false;
  let panning: { startClientX: number; startClientY: number; startPanX: number; startPanY: number } | null = null;
  let interaction: InteractionState | null = null;
  let draftWidgets: Record<string, Partial<Widget>> = {};
  let snapEnabled = true;
  let guideTargets: GuideTargets | null = null;
  let activeGuides: { vertical: number[]; horizontal: number[] } = { vertical: [], horizontal: [] };
  let nudgeCommitTimer: ReturnType<typeof setTimeout> | null = null;
  let nudgeStarts: Record<string, { x: number; y: number }> = {};
  let marquee: { startX: number; startY: number; x: number; y: number } | null = null;
  let collapseToOnMouseUp: string | null = null;
  let now = Date.now();
  let tickInterval: ReturnType<typeof setInterval>;
  let timerElapsedByWidget: Record<string, number> = {};
  let timerFallbackStartByWidget: Record<string, number> = {};
  let widgetAnimClasses: Record<string, string> = {};
  const prevVisibleById = new Map<string, boolean>();
  const animTimers = new Map<string, ReturnType<typeof setTimeout>>();

  const handles: ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

  $: selectedIdSet = new Set(selectedWidgetIds);
  $: primarySelectedId = selectedWidgetIds.length > 0 ? selectedWidgetIds[selectedWidgetIds.length - 1] : null;
  $: activeScene = stagingState.scenes.find((scene) => scene.id === stagingState.activeSceneId);
  $: widgets = activeScene?.widgets ?? [];

  function asString(value: unknown, fallback: string): string {
    return typeof value === "string" ? value : fallback;
  }

  function normalizeFontName(value: unknown): string {
    if (typeof value !== "string") {
      return "";
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return "";
    }

    const withoutFallback = trimmed.split(",")[0]?.trim() ?? "";
    return withoutFallback.replace(/^['\"]+|['\"]+$/g, "").trim();
  }

  function ensureFont(name: string) {
    const normalized = normalizeFontName(name);
    if (!normalized || SYSTEM_FONT_NAMES.has(normalized)) {
      return;
    }

    const id = `gf-${normalized.replace(/\s+/g, "-")}`;
    if (document.getElementById(id)) {
      return;
    }

    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(normalized)}&display=swap`;
    document.head.appendChild(link);
  }

  function fontFamilyStyle(name: string): string {
    return name ? `'${name.replace(/'/g, "\\'")}', sans-serif` : "inherit";
  }

  $: {
    for (const widget of widgets) {
      ensureFont(normalizeFontName(widget.props.fontFamily));
    }
  }

  function asNumber(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  }

  function asObject(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  }

  function asBoolean(value: unknown, fallback: boolean): boolean {
    return typeof value === "boolean" ? value : fallback;
  }

  function buildEffectStyles(effects: unknown, isTextWidget: boolean): {
    containerStyle: string;
    textStyle: string;
  } {
    if (!effects || typeof effects !== "object") {
      return { containerStyle: "", textStyle: "" };
    }

    const normalized = asObject(effects) as WidgetEffects;
    const filterParts: string[] = [];
    const textParts: string[] = [];

    const glow = asObject(normalized.glow);
    if (asBoolean(glow.enabled, false)) {
      const color = asString(glow.color, "#ffffff");
      const radius = Math.max(0, asNumber(glow.radius, 8));
      filterParts.push(`drop-shadow(0 0 ${radius}px ${color})`);
    }

    const shadow = asObject(normalized.shadow);
    if (asBoolean(shadow.enabled, false)) {
      const color = asString(shadow.color, "#000000");
      const x = asNumber(shadow.x, 4);
      const y = asNumber(shadow.y, 4);
      const blur = Math.max(0, asNumber(shadow.blur, 8));
      filterParts.push(`drop-shadow(${x}px ${y}px ${blur}px ${color})`);
    }

    if (isTextWidget) {
      if (filterParts.length) {
        textParts.push(`filter:${filterParts.join(" ")}`);
      }

      const gradientText = asObject(normalized.gradientText);
      const gradientEnabled = asBoolean(gradientText.enabled, false);

      if (gradientEnabled) {
        const angle = asNumber(gradientText.angle, 90);
        const color1 = asString(gradientText.color1, "#ff6b6b");
        const color2 = asString(gradientText.color2, "#ffd93d");
        textParts.push(`background: linear-gradient(${angle}deg, ${color1}, ${color2})`);
        textParts.push("-webkit-background-clip: text");
        textParts.push("-webkit-text-fill-color: transparent");
        textParts.push("background-clip: text");
      } else {
        const outline = asObject(normalized.outline);
        if (asBoolean(outline.enabled, false)) {
          const color = asString(outline.color, "#000000");
          const width = Math.max(0, asNumber(outline.width, 2));
          textParts.push(`-webkit-text-stroke: ${width}px ${color}`);
          textParts.push("paint-order: stroke fill");
        }
      }
    }

    const containerStyle = !isTextWidget && filterParts.length ? `filter:${filterParts.join(" ")};` : "";
    const textStyle = textParts.length ? `${textParts.join(";")};` : "";

    return { containerStyle, textStyle };
  }

  function hexToRgba(hex: string, alpha: number): string {
    if (hex === "transparent") {
      return "rgba(0,0,0,0)";
    }

    const normalized = hex.trim().replace("#", "");
    if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
      return `rgba(255,255,255,${clamp(alpha, 0, 1)})`;
    }

    const r = Number.parseInt(normalized.slice(0, 2), 16);
    const g = Number.parseInt(normalized.slice(2, 4), 16);
    const b = Number.parseInt(normalized.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${clamp(alpha, 0, 1)})`;
  }

  function formatClockTime(tickNow: number, use12Hour: boolean, showSeconds: boolean): string {
    const options: Intl.DateTimeFormatOptions = {
      hour: "2-digit",
      minute: "2-digit",
      hour12: use12Hour
    };

    if (showSeconds) {
      options.second = "2-digit";
    }

    return new Date(tickNow).toLocaleTimeString("en-US", options);
  }

  function getTimerDisplaySeconds(widget: Widget, tickNow: number): number {
    const isRunning = widget.props.running === true;
    const mode = widget.props.mode === "countdown" ? "countdown" : "stopwatch";
    const duration = asNumber(widget.props.durationSeconds, 60);
    const startedAt = asNumber(widget.props.startedAt, 0);
    const resetAt = asNumber(widget.props.resetAt, 0);

    const previousElapsed = timerElapsedByWidget[widget.id] ?? 0;
    let elapsed = previousElapsed;
    let fallbackStartedAt = timerFallbackStartByWidget[widget.id] ?? 0;

    if (resetAt > 0 && !isRunning && startedAt <= 0) {
      elapsed = 0;
      fallbackStartedAt = 0;
    } else if (isRunning && startedAt > 0) {
      elapsed = Math.max(0, Math.floor((tickNow - startedAt) / 1000));
      fallbackStartedAt = 0;
    } else if (isRunning) {
      // Backward-compatible fallback for clients that still emit running=true without startedAt.
      if (fallbackStartedAt <= 0) {
        fallbackStartedAt = tickNow;
      }
      elapsed = Math.max(0, Math.floor((tickNow - fallbackStartedAt) / 1000));
    }

    timerElapsedByWidget = {
      ...timerElapsedByWidget,
      [widget.id]: elapsed
    };
    timerFallbackStartByWidget = {
      ...timerFallbackStartByWidget,
      [widget.id]: fallbackStartedAt
    };

    if (mode === "countdown") {
      return Math.max(0, duration - elapsed);
    }

    return elapsed;
  }

  function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  function isVideoUrl(url: string): boolean {
    const path = url.split("?")[0].split("#")[0].toLowerCase();
    return /\.(mp4|webm|mpeg|mpg|mov|ogv|m4v)$/.test(path);
  }

  function isTextWidgetType(widgetType: string): boolean {
    return widgetType === "text"
      || widgetType === "timer"
      || widgetType === "counter"
      || widgetType === "marquee"
      || widgetType === "clock";
  }

  function normalizeEntranceAnimation(value: unknown): { type: string; duration: number } {
    const allowedTypes = new Set([
      "none",
      "fade",
      "slide-up",
      "slide-down",
      "slide-left",
      "slide-right",
      "pop",
      "bounce"
    ]);

    if (!value || typeof value !== "object") {
      return { type: "none", duration: 400 };
    }

    const raw = value as { type?: unknown; duration?: unknown };
    const type = typeof raw.type === "string" && allowedTypes.has(raw.type) ? raw.type : "none";
    const durationRaw = typeof raw.duration === "number" && Number.isFinite(raw.duration) ? raw.duration : 400;
    const duration = Math.max(100, Math.min(2000, Math.floor(durationRaw)));

    return { type, duration };
  }

  function throttle<T extends (...args: any[]) => void>(fn: T, ms: number): T {
    let last = 0;
    return ((...args: any[]) => {
      const now = Date.now();
      if (now - last >= ms) {
        last = now;
        fn(...args);
      }
    }) as T;
  }

  // Group drags update several widgets per tick; collect the dirty ids so one
  // throttled flush streams every pending transform in the same tick.
  let pendingTransformIds = new Set<string>();
  const flushTransforms = throttle(() => {
    if (!socket) {
      return;
    }

    for (const widgetId of pendingTransformIds) {
      const draft = draftWidgets[widgetId];
      if (draft) {
        socket.emit(SocketEvents.WIDGET_TRANSFORM, { id: widgetId, ...draft });
      }
    }
    pendingTransformIds = new Set();
  }, 33);

  function emitTransform(widgetId: string) {
    pendingTransformIds.add(widgetId);
    flushTransforms();
  }

  // Fit the canvas the first time the viewport has a real size. We intentionally
  // do NOT re-fit on later resizes so a user's zoom/pan survives sidebar toggles.
  function maybeInitialFit() {
    if (viewportInitialized) {
      return;
    }

    const rect = viewportElement?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) {
      return;
    }

    fitToViewport();
    viewportInitialized = true;
  }

  // Single client→canvas conversion point. Drag, resize, rotate, rubber-band and
  // any future drop handling all funnel through getPointFromMouse/Touch → here.
  function getCanvasPoint(clientX: number, clientY: number): { x: number; y: number } {
    return toCanvasCoords(clientX, clientY);
  }

  function getPointFromMouse(event: MouseEvent): { x: number; y: number } {
    return getCanvasPoint(event.clientX, event.clientY);
  }

  function getPointFromTouch(event: TouchEvent): { x: number; y: number } {
    const touch = event.touches[0] ?? event.changedTouches[0];
    return getCanvasPoint(touch.clientX, touch.clientY);
  }

  function setSelection(ids: string[]) {
    dispatch("select", ids);
  }

  function selectOnly(widgetId: string | null) {
    setSelection(widgetId ? [widgetId] : []);
  }

  function toggleSelection(widgetId: string) {
    if (selectedIdSet.has(widgetId)) {
      setSelection(selectedWidgetIds.filter((id) => id !== widgetId));
    } else {
      setSelection([...selectedWidgetIds, widgetId]);
    }
  }

  function getRenderedWidget(widget: Widget, drafts: Record<string, Partial<Widget>>): Widget {
    const draft = drafts[widget.id] ?? {};
    return {
      ...widget,
      ...draft
    };
  }

  function updateDraft(widgetId: string, nextDraft: Partial<Widget>) {
    draftWidgets = {
      ...draftWidgets,
      [widgetId]: {
        ...(draftWidgets[widgetId] ?? {}),
        ...nextDraft
      }
    };

    emitTransform(widgetId);
  }

  function clearDraft(widgetId: string) {
    const { [widgetId]: _removed, ...rest } = draftWidgets;
    draftWidgets = rest;
  }

  function toggleSnap() {
    snapEnabled = !snapEnabled;
    try {
      window.localStorage.setItem(SNAP_STORAGE_KEY, String(snapEnabled));
    } catch {
      // Ignore storage failures.
    }
  }

  function boundingBox(items: Widget[]): { x: number; y: number; width: number; height: number } {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const item of items) {
      minX = Math.min(minX, item.x);
      minY = Math.min(minY, item.y);
      maxX = Math.max(maxX, item.x + item.width);
      maxY = Math.max(maxY, item.y + item.height);
    }

    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  function beginDrag(widget: Widget, point: { x: number; y: number }, currentSelection: Set<string>) {
    const groupStarts = widgets
      .filter((item) => currentSelection.has(item.id) && item.locked !== true)
      .map((item) => ({ ...item }));

    if (groupStarts.length > 1) {
      const movingIds = new Set(groupStarts.map((item) => item.id));
      guideTargets = collectGuideTargets(widgets.filter((item) => !movingIds.has(item.id)), "");
      interaction = {
        mode: "drag",
        widgetId: widget.id,
        startPoint: point,
        startWidget: { ...widget },
        groupStarts,
        groupBox: boundingBox(groupStarts)
      };
      return;
    }

    guideTargets = collectGuideTargets(widgets, widget.id);
    interaction = {
      mode: "drag",
      widgetId: widget.id,
      startPoint: point,
      startWidget: { ...widget }
    };
  }

  function beginResize(widget: Widget, point: { x: number; y: number }, handle: ResizeHandle) {
    interaction = {
      mode: "resize",
      widgetId: widget.id,
      startPoint: point,
      startWidget: { ...widget },
      handle
    };
  }

  function beginRotate(widget: Widget, point: { x: number; y: number }) {
    interaction = {
      mode: "rotate",
      widgetId: widget.id,
      startPoint: point,
      startWidget: { ...widget }
    };
  }

  // preventDefault on mousedown stops the browser from blurring a focused
  // settings input, which would leave keyboard shortcuts routed to the input.
  function blurActiveEditable() {
    if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
      document.activeElement.blur();
    }
  }

  function handleWidgetPointerDown(widget: Widget, point: { x: number; y: number }, shiftKey: boolean) {
    blurActiveEditable();

    if (shiftKey) {
      if (widget.locked === true) {
        return;
      }
      toggleSelection(widget.id);
      return;
    }

    let dragSelection: Set<string>;
    if (selectedIdSet.has(widget.id) && selectedWidgetIds.length > 1) {
      // Keep the multi-selection so dragging a member moves the group; if the
      // mouse never moves, collapse to this widget on mouseup.
      collapseToOnMouseUp = widget.id;
      dragSelection = selectedIdSet;
    } else {
      selectOnly(widget.id);
      dragSelection = new Set([widget.id]);
    }

    if (!canTransform || widget.locked === true) {
      return;
    }
    beginDrag(widget, point, dragSelection);
  }

  function handleWidgetMouseDown(event: MouseEvent, widget: Widget) {
    event.stopPropagation();
    event.preventDefault();
    handleWidgetPointerDown(widget, getPointFromMouse(event), event.shiftKey);
  }

  function handleWidgetTouchStart(event: TouchEvent, widget: Widget) {
    event.stopPropagation();
    event.preventDefault();
    handleWidgetPointerDown(widget, getPointFromTouch(event), false);
  }

  function handleResizeMouseDown(event: MouseEvent, widget: Widget, handle: ResizeHandle) {
    if (!canTransform || widget.locked === true) {
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    selectOnly(widget.id);
    beginResize(widget, getPointFromMouse(event), handle);
  }

  function handleResizeTouchStart(event: TouchEvent, widget: Widget, handle: ResizeHandle) {
    if (!canTransform || widget.locked === true) {
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    selectOnly(widget.id);
    beginResize(widget, getPointFromTouch(event), handle);
  }

  function handleRotateMouseDown(event: MouseEvent, widget: Widget) {
    if (!canTransform || widget.locked === true) {
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    selectOnly(widget.id);
    beginRotate(widget, getPointFromMouse(event));
  }

  function handleRotateTouchStart(event: TouchEvent, widget: Widget) {
    if (!canTransform || widget.locked === true) {
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    selectOnly(widget.id);
    beginRotate(widget, getPointFromTouch(event));
  }

  function updateDrag(point: { x: number; y: number }, disableSnap: boolean) {
    if (!interaction) {
      return;
    }

    const dx = point.x - interaction.startPoint.x;
    const dy = point.y - interaction.startPoint.y;
    if (dx !== 0 || dy !== 0) {
      interaction.moved = true;
      collapseToOnMouseUp = null;
    }

    if (interaction.groupStarts && interaction.groupBox) {
      // Snap the group's bounding box, then move every member by the same delta.
      const box = interaction.groupBox;
      const result = resolveDragPosition(box.x + dx, box.y + dy, {
        width: box.width,
        height: box.height,
        targets: guideTargets,
        gridEnabled: snapEnabled,
        disableSnap
      });

      activeGuides = {
        vertical: result.verticalGuides,
        horizontal: result.horizontalGuides
      };

      const deltaX = result.x - box.x;
      const deltaY = result.y - box.y;
      for (const start of interaction.groupStarts) {
        updateDraft(start.id, {
          x: Math.round(start.x + deltaX),
          y: Math.round(start.y + deltaY)
        });
      }
      return;
    }

    const result = resolveDragPosition(interaction.startWidget.x + dx, interaction.startWidget.y + dy, {
      width: interaction.startWidget.width,
      height: interaction.startWidget.height,
      targets: guideTargets,
      gridEnabled: snapEnabled,
      disableSnap
    });

    activeGuides = {
      vertical: result.verticalGuides,
      horizontal: result.horizontalGuides
    };

    updateDraft(interaction.widgetId, {
      x: result.x,
      y: result.y
    });
  }

  function updateResize(point: { x: number; y: number }, disableSnap: boolean) {
    if (!interaction || !interaction.handle) {
      return;
    }

    const dx = point.x - interaction.startPoint.x;
    const dy = point.y - interaction.startPoint.y;

    let nextX = interaction.startWidget.x;
    let nextY = interaction.startWidget.y;
    let nextWidth = interaction.startWidget.width;
    let nextHeight = interaction.startWidget.height;
    const gridSnap = snapEnabled && !disableSnap;

    if (interaction.handle.includes("e")) {
      nextWidth = interaction.startWidget.width + dx;
    }

    if (interaction.handle.includes("s")) {
      nextHeight = interaction.startWidget.height + dy;
    }

    if (interaction.handle.includes("w")) {
      nextX = interaction.startWidget.x + dx;
      nextWidth = interaction.startWidget.width - dx;
    }

    if (interaction.handle.includes("n")) {
      nextY = interaction.startWidget.y + dy;
      nextHeight = interaction.startWidget.height - dy;
    }

    if (gridSnap) {
      nextX = snapToGrid(nextX);
      nextY = snapToGrid(nextY);
      nextWidth = snapToGrid(nextWidth);
      nextHeight = snapToGrid(nextHeight);
    }

    if (nextWidth < MIN_SIZE) {
      if (interaction.handle.includes("w")) {
        nextX -= MIN_SIZE - nextWidth;
      }
      nextWidth = MIN_SIZE;
    }

    if (nextHeight < MIN_SIZE) {
      if (interaction.handle.includes("n")) {
        nextY -= MIN_SIZE - nextHeight;
      }
      nextHeight = MIN_SIZE;
    }

    if (nextX < 0) {
      if (interaction.handle.includes("w")) {
        nextWidth += nextX;
      }
      nextX = 0;
    }

    if (nextY < 0) {
      if (interaction.handle.includes("n")) {
        nextHeight += nextY;
      }
      nextY = 0;
    }

    if (nextX + nextWidth > CANVAS_WIDTH) {
      if (interaction.handle.includes("e")) {
        nextWidth = CANVAS_WIDTH - nextX;
      } else {
        nextX = CANVAS_WIDTH - nextWidth;
      }
    }

    if (nextY + nextHeight > CANVAS_HEIGHT) {
      if (interaction.handle.includes("s")) {
        nextHeight = CANVAS_HEIGHT - nextY;
      } else {
        nextY = CANVAS_HEIGHT - nextHeight;
      }
    }

    nextWidth = Math.max(MIN_SIZE, nextWidth);
    nextHeight = Math.max(MIN_SIZE, nextHeight);

    updateDraft(interaction.widgetId, {
      x: Math.round(nextX),
      y: Math.round(nextY),
      width: Math.round(nextWidth),
      height: Math.round(nextHeight)
    });
  }

  function updateRotation(point: { x: number; y: number }, snap: boolean) {
    if (!interaction) {
      return;
    }

    const centerX = interaction.startWidget.x + interaction.startWidget.width / 2;
    const centerY = interaction.startWidget.y + interaction.startWidget.height / 2;
    const rawAngle = ((Math.atan2(point.y - centerY, point.x - centerX) * 180) / Math.PI + 90 + 360) % 360;
    const nextRotation = snap ? Math.round(rawAngle / 15) * 15 : rawAngle;

    updateDraft(interaction.widgetId, {
      rotation: Math.round(nextRotation)
    });
  }

  function onPointerMove(point: { x: number; y: number }, modifiers: { shiftKey: boolean; altKey: boolean }) {
    if (!interaction || !canTransform) {
      return;
    }

    if (interaction.mode === "drag") {
      updateDrag(point, modifiers.altKey);
      return;
    }

    if (interaction.mode === "resize") {
      updateResize(point, modifiers.altKey);
      return;
    }

    if (interaction.mode === "rotate") {
      updateRotation(point, modifiers.shiftKey);
    }
  }

  function emitFinalUpdate() {
    if (!interaction || !socket) {
      return;
    }

    if (interaction.groupStarts) {
      const entries: Array<{ widgetId: string; before: Transform; after: Transform }> = [];
      for (const start of interaction.groupStarts) {
        const draft = draftWidgets[start.id];
        if (!draft) {
          continue;
        }

        socket.emit(SocketEvents.WIDGET_UPDATE, { id: start.id, ...draft });
        const diff = transformDiff(start, draft);
        if (diff) {
          entries.push({ widgetId: start.id, ...diff });
        }
      }

      if (entries.length === 1) {
        pushHistory({ kind: "transform", widgetId: entries[0].widgetId, before: entries[0].before, after: entries[0].after });
      } else if (entries.length > 1) {
        pushHistory({ kind: "transformGroup", entries });
      }
      return;
    }

    const draft = draftWidgets[interaction.widgetId];
    if (draft) {
      socket.emit(SocketEvents.WIDGET_UPDATE, {
        id: interaction.widgetId,
        ...draft
      });
      recordTransform(interaction.widgetId, interaction.startWidget, draft);
    }
  }

  function transformDiff(startWidget: Transform, draft: Partial<Widget>): { before: Transform; after: Transform } | null {
    const keys: Array<keyof Transform> = ["x", "y", "width", "height", "rotation"];
    const before: Transform = {};
    const after: Transform = {};
    let changed = false;

    for (const key of keys) {
      const next = draft[key];
      if (typeof next !== "number") {
        continue;
      }

      const previous = startWidget[key] ?? 0;
      if (previous !== next) {
        before[key] = previous;
        after[key] = next;
        changed = true;
      }
    }

    return changed ? { before, after } : null;
  }

  function recordTransform(widgetId: string, startWidget: Transform, draft: Partial<Widget>) {
    const diff = transformDiff(startWidget, draft);
    if (diff) {
      pushHistory({ kind: "transform", widgetId, before: diff.before, after: diff.after });
    }
  }

  function onPointerEnd() {
    if (!interaction) {
      return;
    }

    emitFinalUpdate();
    if (interaction.groupStarts) {
      for (const start of interaction.groupStarts) {
        clearDraft(start.id);
      }
    } else {
      clearDraft(interaction.widgetId);
    }
    interaction = null;
    guideTargets = null;
    activeGuides = { vertical: [], horizontal: [] };
  }

  function handleWindowMouseMove(event: MouseEvent) {
    if (panning) {
      const dx = event.clientX - panning.startClientX;
      const dy = event.clientY - panning.startClientY;
      const start = panning;
      viewport.update((state) => ({ ...state, panX: start.startPanX + dx, panY: start.startPanY + dy }));
      return;
    }

    if (marquee) {
      const point = getPointFromMouse(event);
      marquee = { ...marquee, x: point.x, y: point.y };
      return;
    }

    if (!interaction) {
      return;
    }

    onPointerMove(getPointFromMouse(event), { shiftKey: event.shiftKey, altKey: event.altKey });
  }

  function handleWindowTouchMove(event: TouchEvent) {
    if (!interaction) {
      return;
    }

    event.preventDefault();
    onPointerMove(getPointFromTouch(event), { shiftKey: false, altKey: false });
  }

  function handleWindowMouseUp() {
    if (panning) {
      panning = null;
      return;
    }

    if (marquee) {
      finishMarquee();
      return;
    }

    if (collapseToOnMouseUp) {
      if (!interaction || !interaction.moved) {
        selectOnly(collapseToOnMouseUp);
      }
      collapseToOnMouseUp = null;
    }
    onPointerEnd();
  }

  function handleShellMouseDown(event: MouseEvent) {
    if (event.button !== 0) {
      return;
    }

    blurActiveEditable();
    if (!canTransform) {
      setSelection([]);
      return;
    }

    const point = getPointFromMouse(event);
    marquee = { startX: point.x, startY: point.y, x: point.x, y: point.y };
  }

  function beginPan(event: MouseEvent) {
    panning = {
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPanX: $viewport.panX,
      startPanY: $viewport.panY
    };
  }

  // Capture-phase so space-drag / middle-drag panning wins over widget and
  // shell mousedown handlers (which stopPropagation in the bubble phase).
  function handleViewportMouseDownCapture(event: MouseEvent) {
    if (spaceHeld || event.button === 1) {
      event.preventDefault();
      event.stopPropagation();
      beginPan(event);
    }
  }

  function dragHasMedia(event: DragEvent): boolean {
    return Array.from(event.dataTransfer?.types ?? []).includes(MEDIA_DRAG_MIME);
  }

  function handleViewportDragOver(event: DragEvent) {
    if (!event.dataTransfer) {
      return;
    }

    // Always preventDefault so a stray OS-file drop is swallowed here (ignored,
    // no navigation) rather than letting the browser open the file.
    event.preventDefault();
    const hasMedia = dragHasMedia(event);
    event.dataTransfer.dropEffect = hasMedia ? "copy" : "none";
    mediaDragOver = hasMedia;
  }

  function handleViewportDragLeave(event: DragEvent) {
    const next = event.relatedTarget;
    if (next instanceof Node && viewportElement?.contains(next)) {
      return;
    }
    mediaDragOver = false;
  }

  function handleViewportDrop(event: DragEvent) {
    event.preventDefault();
    mediaDragOver = false;

    const raw = event.dataTransfer?.getData(MEDIA_DRAG_MIME);
    if (!raw) {
      return; // OS files or other payloads — ignore gracefully
    }

    let payload: { url?: unknown; kind?: unknown; name?: unknown };
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }

    if (typeof payload.url !== "string" || typeof payload.kind !== "string") {
      return;
    }

    const point = toCanvasCoords(event.clientX, event.clientY);
    dispatch("mediaDrop", {
      url: payload.url,
      kind: payload.kind,
      name: typeof payload.name === "string" ? payload.name : "",
      x: point.x,
      y: point.y,
      snap: snapEnabled
    });
  }

  function handleWheel(event: WheelEvent) {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      zoomAtClientPoint($viewport.zoom * factor, event.clientX, event.clientY);
      return;
    }

    event.preventDefault();
    if (event.shiftKey) {
      panBy(-(event.deltaY || event.deltaX), 0);
    } else {
      panBy(-event.deltaX, -event.deltaY);
    }
  }

  function finishMarquee() {
    if (!marquee) {
      return;
    }

    const left = Math.min(marquee.startX, marquee.x);
    const top = Math.min(marquee.startY, marquee.y);
    const right = Math.max(marquee.startX, marquee.x);
    const bottom = Math.max(marquee.startY, marquee.y);
    marquee = null;

    // A near-zero rectangle is a plain click on empty canvas: clear selection.
    if (right - left < 3 && bottom - top < 3) {
      setSelection([]);
      return;
    }

    const hits = widgets
      .filter((widget) =>
        widget.visible === true &&
        widget.locked !== true &&
        widget.x < right &&
        widget.x + widget.width > left &&
        widget.y < bottom &&
        widget.y + widget.height > top
      )
      .map((widget) => widget.id);

    setSelection(hits);
  }

  function commitNudge() {
    if (nudgeCommitTimer) {
      clearTimeout(nudgeCommitTimer);
    }

    nudgeCommitTimer = setTimeout(() => {
      nudgeCommitTimer = null;
      if (socket) {
        const entries: Array<{ widgetId: string; before: Transform; after: Transform }> = [];
        for (const [widgetId, start] of Object.entries(nudgeStarts)) {
          const draft = draftWidgets[widgetId];
          if (!draft) {
            continue;
          }

          socket.emit(SocketEvents.WIDGET_UPDATE, { id: widgetId, ...draft });
          const diff = transformDiff(start, { x: draft.x, y: draft.y });
          if (diff) {
            entries.push({ widgetId, ...diff });
          }
        }

        if (entries.length === 1) {
          pushHistory({ kind: "transform", widgetId: entries[0].widgetId, before: entries[0].before, after: entries[0].after });
        } else if (entries.length > 1) {
          pushHistory({ kind: "transformGroup", entries });
        }
      }

      for (const widgetId of Object.keys(nudgeStarts)) {
        clearDraft(widgetId);
      }
      nudgeStarts = {};
    }, NUDGE_COMMIT_DELAY);
  }

  function nudgeSelection(dx: number, dy: number) {
    const targets = widgets.filter((widget) => selectedIdSet.has(widget.id) && widget.locked !== true);
    if (targets.length === 0) {
      return;
    }

    // Clamp the delta against the group's rendered bounding box so relative
    // offsets survive canvas edges.
    let minX = Infinity;
    let minY = Infinity;
    let maxRight = -Infinity;
    let maxBottom = -Infinity;
    for (const widget of targets) {
      const current = getRenderedWidget(widget, draftWidgets);
      minX = Math.min(minX, current.x);
      minY = Math.min(minY, current.y);
      maxRight = Math.max(maxRight, current.x + current.width);
      maxBottom = Math.max(maxBottom, current.y + current.height);
    }

    const cdx = clamp(dx, -minX, Math.max(-minX, CANVAS_WIDTH - maxRight));
    const cdy = clamp(dy, -minY, Math.max(-minY, CANVAS_HEIGHT - maxBottom));
    if (cdx === 0 && cdy === 0) {
      return;
    }

    for (const widget of targets) {
      if (!nudgeStarts[widget.id]) {
        nudgeStarts = {
          ...nudgeStarts,
          [widget.id]: { x: widget.x, y: widget.y }
        };
      }

      const current = getRenderedWidget(widget, draftWidgets);
      updateDraft(widget.id, {
        x: Math.round(current.x + cdx),
        y: Math.round(current.y + cdy)
      });
    }
    commitNudge();
  }

  function isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
      return false;
    }

    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
  }

  function handleWindowKeyDown(event: KeyboardEvent) {
    if (isEditableTarget(event.target)) {
      return;
    }

    // Space enables pan mode; swallow it so the page doesn't scroll. The
    // editable-target guard above keeps space typing in inputs unaffected.
    if (event.key === " " || event.code === "Space") {
      event.preventDefault();
      spaceHeld = true;
      return;
    }

    if (event.key === "Escape") {
      if (selectedWidgetIds.length > 0) {
        event.preventDefault();
        setSelection([]);
      }
      return;
    }

    if ((event.ctrlKey || event.metaKey) && (event.key === "z" || event.key === "Z")) {
      event.preventDefault();
      if (event.shiftKey) {
        redo();
      } else {
        undo();
      }
      return;
    }

    if ((event.ctrlKey || event.metaKey) && (event.key === "y" || event.key === "Y")) {
      event.preventDefault();
      redo();
      return;
    }

    const primaryWidget = primarySelectedId ? widgets.find((item) => item.id === primarySelectedId) : null;
    if (!primaryWidget) {
      return;
    }

    if ((event.ctrlKey || event.metaKey) && (event.key === "d" || event.key === "D")) {
      event.preventDefault();
      dispatch("requestDuplicate", primaryWidget.id);
      return;
    }

    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      dispatch("requestDelete", primaryWidget.id);
      return;
    }

    const nudgeByKey: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1]
    };

    const direction = nudgeByKey[event.key];
    if (!direction) {
      return;
    }

    event.preventDefault();
    if (!canTransform) {
      return;
    }

    const step = event.shiftKey ? GRID_SIZE : 1;
    nudgeSelection(direction[0] * step, direction[1] * step);
  }

  function handleWindowKeyUp(event: KeyboardEvent) {
    if (event.key === " " || event.code === "Space") {
      spaceHeld = false;
    }
  }

  function handleWindowTouchEnd() {
    onPointerEnd();
  }

  onMount(() => {
    tickInterval = setInterval(() => {
      now = Date.now();
    }, 1000);

    try {
      const storedSnap = window.localStorage.getItem(SNAP_STORAGE_KEY);
      if (storedSnap !== null) {
        snapEnabled = storedSnap === "true";
      }
    } catch {
      // Ignore storage failures.
    }

    setViewportElement(viewportElement);
    maybeInitialFit();
    resizeObserver = new ResizeObserver(() => {
      maybeInitialFit();
    });

    if (viewportElement) {
      resizeObserver.observe(viewportElement);
      // Attached imperatively: wheel needs a non-passive listener to preventDefault,
      // and pan-start must run in capture phase to beat widget mousedown handlers.
      viewportElement.addEventListener("wheel", handleWheel, { passive: false });
      viewportElement.addEventListener("mousedown", handleViewportMouseDownCapture, { capture: true });
      viewportElement.addEventListener("dragover", handleViewportDragOver);
      viewportElement.addEventListener("dragleave", handleViewportDragLeave);
      viewportElement.addEventListener("drop", handleViewportDrop);
    }

    window.addEventListener("mousemove", handleWindowMouseMove);
    window.addEventListener("mouseup", handleWindowMouseUp);
    window.addEventListener("touchmove", handleWindowTouchMove, { passive: false });
    window.addEventListener("touchend", handleWindowTouchEnd);
    window.addEventListener("keydown", handleWindowKeyDown);
    window.addEventListener("keyup", handleWindowKeyUp);

    return () => {
      resizeObserver?.disconnect();
      viewportElement?.removeEventListener("wheel", handleWheel);
      viewportElement?.removeEventListener("mousedown", handleViewportMouseDownCapture, { capture: true });
      viewportElement?.removeEventListener("dragover", handleViewportDragOver);
      viewportElement?.removeEventListener("dragleave", handleViewportDragLeave);
      viewportElement?.removeEventListener("drop", handleViewportDrop);
      setViewportElement(null);
      window.removeEventListener("mousemove", handleWindowMouseMove);
      window.removeEventListener("mouseup", handleWindowMouseUp);
      window.removeEventListener("touchmove", handleWindowTouchMove);
      window.removeEventListener("touchend", handleWindowTouchEnd);
      window.removeEventListener("keydown", handleWindowKeyDown);
      window.removeEventListener("keyup", handleWindowKeyUp);
    };
  });

  onDestroy(() => {
    clearInterval(tickInterval);
    if (nudgeCommitTimer) {
      clearTimeout(nudgeCommitTimer);
      nudgeCommitTimer = null;
    }
    for (const timer of animTimers.values()) {
      clearTimeout(timer);
    }
    animTimers.clear();
    prevVisibleById.clear();
    widgetAnimClasses = {};
    interaction = null;
  });

  $: {
    const activeIds = new Set(widgets.map((widget) => widget.id));

    for (const widgetId of prevVisibleById.keys()) {
      if (!activeIds.has(widgetId)) {
        prevVisibleById.delete(widgetId);

        const animTimer = animTimers.get(widgetId);
        if (animTimer) {
          clearTimeout(animTimer);
          animTimers.delete(widgetId);
        }

        if (widgetAnimClasses[widgetId]) {
          const nextClasses = { ...widgetAnimClasses };
          delete nextClasses[widgetId];
          widgetAnimClasses = nextClasses;
        }
      }
    }

    for (const widget of widgets) {
      const isVisible = widget.visible === true;
      const prevVisible = prevVisibleById.get(widget.id);

      if (prevVisible === undefined) {
        prevVisibleById.set(widget.id, isVisible);
        continue;
      }

      if (isVisible && !prevVisible) {
        const animation = normalizeEntranceAnimation(widget.props.entranceAnimation);
        if (animation.type !== "none") {
          widgetAnimClasses = {
            ...widgetAnimClasses,
            [widget.id]: `anim-${animation.type}`
          };

          const existingTimer = animTimers.get(widget.id);
          if (existingTimer) {
            clearTimeout(existingTimer);
          }

          const timer = setTimeout(() => {
            if (widgetAnimClasses[widget.id]) {
              const nextClasses = { ...widgetAnimClasses };
              delete nextClasses[widget.id];
              widgetAnimClasses = nextClasses;
            }
            animTimers.delete(widget.id);
          }, animation.duration + 50);

          animTimers.set(widget.id, timer);
        }
      }

      prevVisibleById.set(widget.id, isVisible);
    }
  }
</script>

<div class="canvas-wrap">
<div class="canvas-toolbar">
  <div class="canvas-toolbar-group">
    <div class="tooltip tooltip-right" data-tip="Zoom out">
      <button type="button" class="btn btn-ghost btn-sm" aria-label="Zoom out" on:click={() => zoomByStep(1 / ZOOM_STEP)}>
        <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M5 12h14" />
        </svg>
      </button>
    </div>
    <div class="tooltip tooltip-bottom" data-tip="Reset to 100%">
      <button type="button" class="btn btn-ghost btn-sm tabular-nums" aria-label="Reset zoom to 100%" on:click={resetZoom}>
        {Math.round($viewport.zoom * 100)}%
      </button>
    </div>
    <div class="tooltip tooltip-bottom" data-tip="Zoom in">
      <button type="button" class="btn btn-ghost btn-sm" aria-label="Zoom in" on:click={() => zoomByStep(ZOOM_STEP)}>
        <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </div>
    <div class="tooltip tooltip-bottom" data-tip="Fit canvas to viewport">
      <button type="button" class="btn btn-ghost btn-sm" aria-label="Fit canvas to viewport" on:click={fitToViewport}>
        <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
        </svg>
      </button>
    </div>
  </div>
  <div class="canvas-toolbar-group">
  <div class="tooltip tooltip-left" data-tip="Undo (Ctrl+Z)">
    <button
      type="button"
      class="btn btn-ghost btn-sm"
      aria-label="Undo"
      disabled={!$canUndo}
      on:click={undo}
    >
      <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="M9 14 4 9l5-5" />
        <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
      </svg>
    </button>
  </div>
  <div class="tooltip tooltip-left" data-tip="Redo (Ctrl+Shift+Z)">
    <button
      type="button"
      class="btn btn-ghost btn-sm"
      aria-label="Redo"
      disabled={!$canRedo}
      on:click={redo}
    >
      <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="m15 14 5-5-5-5" />
        <path d="M20 9H10a6 6 0 0 0 0 12h3" />
      </svg>
    </button>
  </div>
  <div class="tooltip tooltip-left" data-tip={`Snap to ${GRID_SIZE}px grid (hold Alt while dragging to disable)`}>
    <button
      type="button"
      class={`btn btn-ghost btn-sm ${snapEnabled ? "btn-active" : ""}`}
      aria-label="Toggle snap to grid"
      aria-pressed={snapEnabled}
      on:click={toggleSnap}
    >
      <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
        <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
        <rect x="3" y="3" width="18" height="18" rx="1.5" />
      </svg>
    </button>
  </div>
  </div>
</div>

<div
  class={`canvas-shell${spaceHeld || panning ? " is-panning" : ""}${mediaDragOver ? " media-drag-over" : ""}`}
  bind:this={viewportElement}
>
  <div
    class="canvas-stage"
    role="button"
    tabindex="0"
    aria-label="Deselect widget"
    on:mousedown={handleShellMouseDown}
    on:touchstart={() => setSelection([])}
    on:keydown={(event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        setSelection([]);
      }
    }}
    style={`position:absolute;left:0;top:0;width:${CANVAS_WIDTH}px;height:${CANVAS_HEIGHT}px;transform-origin:0 0;transform:translate(${$viewport.panX}px,${$viewport.panY}px) scale(${$viewport.zoom});--inv-zoom:${1 / $viewport.zoom};${snapEnabled ? `background-image:radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px);background-size:${GRID_SIZE}px ${GRID_SIZE}px;` : ""}`}
  >
    {#if widgets.length === 0}
      <div class="canvas-empty-state" aria-hidden="true">
        <div class="empty-icon-box">
          <span>📺</span>
        </div>
        <p class="empty-title">Your canvas is empty.</p>
        <p class="empty-subtitle">Add a widget from the panel →</p>
      </div>
    {/if}

    {#each widgets as sourceWidget (sourceWidget.id)}
      {@const isTextWidget = isTextWidgetType(sourceWidget.type)}
      {@const effectStyles = buildEffectStyles(sourceWidget.props.effects, isTextWidget)}
      {@const entranceAnimation = normalizeEntranceAnimation(sourceWidget.props.entranceAnimation)}
      {@const animClass = widgetAnimClasses[sourceWidget.id] ?? ""}
      <div
        class={`widget-frame ${selectedIdSet.has(sourceWidget.id) ? "selected" : ""}${primarySelectedId === sourceWidget.id && selectedWidgetIds.length > 1 ? " selected-primary" : ""}${!sourceWidget.visible ? " hidden-widget" : ""}`}
        role="button"
        tabindex="0"
        aria-label={`Select ${sourceWidget.type} widget`}
        style={`left:${draftWidgets[sourceWidget.id]?.x ?? sourceWidget.x}px;top:${draftWidgets[sourceWidget.id]?.y ?? sourceWidget.y}px;width:${draftWidgets[sourceWidget.id]?.width ?? sourceWidget.width}px;height:${draftWidgets[sourceWidget.id]?.height ?? sourceWidget.height}px;transform:rotate(${draftWidgets[sourceWidget.id]?.rotation ?? sourceWidget.rotation ?? 0}deg);opacity:${sourceWidget.visible ? 1 : 0.4};font-family:${fontFamilyStyle(normalizeFontName(sourceWidget.props.fontFamily))};${sourceWidget.type !== "image" ? effectStyles.containerStyle : ""}`}
        on:mousedown={(event) => handleWidgetMouseDown(event, sourceWidget)}
        on:touchstart={(event) => handleWidgetTouchStart(event, sourceWidget)}
        on:keydown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            selectOnly(sourceWidget.id);
          }
        }}
      >
        {#if sourceWidget.locked}
          <div class="widget-lock-badge" aria-hidden="true">🔒</div>
        {/if}

        {#if sourceWidget.createdBy}
          <div class="widget-owner-tag">{sourceWidget.createdBy}</div>
        {/if}

        <div class={animClass} style={`width:100%;height:100%;--anim-duration:${entranceAnimation.duration}ms;`}>
          <div class={`widget-preview ${isTextWidget ? "widget-preview-text" : ""}`}>
          {#if sourceWidget.type === "text"}
            {@const fontFamily = normalizeFontName(sourceWidget.props.fontFamily)}
            <div
              style={`width:100%;height:100%;font-size:${asNumber(sourceWidget.props.fontSize, 24)}px;color:${asString(sourceWidget.props.color, "#ffffff")};font-weight:${asString(sourceWidget.props.fontWeight, "normal") === "bold" ? "bold" : "normal"};background:${asString(sourceWidget.props.backgroundColor, "transparent")};display:flex;align-items:center;padding:4px 8px;box-sizing:border-box;overflow:visible;`}
            >
              <span style={`display:inline-block;font-family:${fontFamilyStyle(fontFamily)};line-height:1.1;${effectStyles.textStyle}`}>{asString(sourceWidget.props.content, "Text")}</span>
            </div>
          {:else if sourceWidget.type === "image"}
            {#if asString(sourceWidget.props.url, "")}
              {#if isVideoUrl(asString(sourceWidget.props.url, ""))}
                <!-- svelte-ignore a11y-media-has-caption -->
                <video src={asString(sourceWidget.props.url, "")} muted autoplay loop playsinline style={`width:100%;height:100%;object-fit:contain;display:block;${effectStyles.containerStyle}`}></video>
              {:else}
                <img src={asString(sourceWidget.props.url, "")} alt="Widget preview" style={`width:100%;height:100%;object-fit:contain;display:block;${effectStyles.containerStyle}`} />
              {/if}
            {:else}
              <div class="placeholder">No image</div>
            {/if}
          {:else if sourceWidget.type === "timer"}
            {@const fontFamily = normalizeFontName(sourceWidget.props.fontFamily)}
            {@const displaySeconds = getTimerDisplaySeconds(sourceWidget, now)}
            {@const mm = Math.floor(displaySeconds / 60).toString().padStart(2, "0")}
            {@const ss = (displaySeconds % 60).toString().padStart(2, "0")}
            <div
              style={`width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:${asNumber(sourceWidget.props.fontSize, 32)}px;color:${asString(sourceWidget.props.color, "#ffffff")};`}
            >
              <span style={`display:inline-block;font-family:${fontFamilyStyle(fontFamily)};line-height:1.1;${effectStyles.textStyle}`}>{mm}:{ss}</span>
            </div>
          {:else if sourceWidget.type === "counter"}
            {@const fontFamily = normalizeFontName(sourceWidget.props.fontFamily)}
            <div style={`width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;color:${asString(sourceWidget.props.color, "#ffffff")};`}>
              {#if asString(sourceWidget.props.label, "")}
                <div
                  style={`font-size:${asNumber(sourceWidget.props.fontSize, 32) * 0.45}px;line-height:1.2;opacity:0.8;font-family:${fontFamilyStyle(fontFamily)};${effectStyles.textStyle}`}
                >
                  {asString(sourceWidget.props.label, "")}
                </div>
              {/if}
              <div
                style={`font-size:${asNumber(sourceWidget.props.fontSize, 32)}px;line-height:1.1;font-family:${fontFamilyStyle(fontFamily)};${effectStyles.textStyle}`}
              >
                {asNumber(sourceWidget.props.value, 0)}
              </div>
            </div>
          {:else if sourceWidget.type === "marquee"}
            {@const fontFamily = normalizeFontName(sourceWidget.props.fontFamily)}
            {@const direction = asString(sourceWidget.props.direction, "left") === "right" ? "right" : "left"}
            <div
              style={`width:100%;height:100%;display:flex;align-items:center;overflow:hidden;background:${asString(sourceWidget.props.backgroundColor, "transparent")};padding:0 8px;box-sizing:border-box;`}
            >
              <span style={`display:inline-block;white-space:nowrap;font-size:${asNumber(sourceWidget.props.fontSize, 24)}px;color:${asString(sourceWidget.props.color, "#ffffff")};font-family:${fontFamilyStyle(fontFamily)};${effectStyles.textStyle}`}>{direction === "left" ? "<-" : "->"} {asString(sourceWidget.props.content, "Marquee text")}</span>
            </div>
          {:else if sourceWidget.type === "clock"}
            {@const fontFamily = normalizeFontName(sourceWidget.props.fontFamily)}
            {@const use12Hour = asString(sourceWidget.props.format, "24h") === "12h"}
            {@const clockText = formatClockTime(now, use12Hour, asBoolean(sourceWidget.props.showSeconds, true))}
            <div
              style={`width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:${asNumber(sourceWidget.props.fontSize, 48)}px;color:${asString(sourceWidget.props.color, "#ffffff")};font-weight:${asString(sourceWidget.props.fontWeight, "bold") === "normal" ? "normal" : "bold"};`}
            >
              <span style={`display:inline-block;font-family:${fontFamilyStyle(fontFamily)};line-height:1.1;${effectStyles.textStyle}`}>{clockText}</span>
            </div>
          {:else if sourceWidget.type === "shape"}
            {@const shapeKind = asString(sourceWidget.props.shape, "rectangle")}
            {@const fill = hexToRgba(asString(sourceWidget.props.fillColor, "#7c3aed"), asNumber(sourceWidget.props.fillOpacity, 1))}
            {@const border = hexToRgba(asString(sourceWidget.props.borderColor, "transparent"), asNumber(sourceWidget.props.borderOpacity, 1))}
            {@const borderRadius = shapeKind === "circle" ? "50%" : shapeKind === "pill" ? "999px" : "0px"}
            <div
              style={`width:100%;height:100%;background:${fill};border:${Math.max(0, Math.floor(asNumber(sourceWidget.props.borderWidth, 0)))}px solid ${border};box-sizing:border-box;border-radius:${borderRadius};`}
            ></div>
          {:else if sourceWidget.type === "soundboard"}
            <div class="preview-stack">
              <div style="font-size:1.8rem;line-height:1;">speaker</div>
              <div class="preview-text">Soundboard</div>
            </div>
          {:else if sourceWidget.type === "custom-html"}
            <div class="preview-stack">
              <div style="font-size:1.5rem;line-height:1;">&lt;/&gt;</div>
              <div class="preview-text">Custom HTML</div>
            </div>
          {:else}
            <div class="preview-text">{sourceWidget.type}</div>
          {/if}
          </div>
        </div>

        {#if primarySelectedId === sourceWidget.id && selectedWidgetIds.length === 1 && canTransform && !sourceWidget.locked}
          <div class="rotation-line"></div>
          <button
            type="button"
            class="rotation-handle"
            aria-label="Rotate widget"
            on:mousedown={(event) => handleRotateMouseDown(event, sourceWidget)}
            on:touchstart={(event) => handleRotateTouchStart(event, sourceWidget)}
          ></button>

          {#each handles as handle}
            <button
              type="button"
              class={`resize-handle handle-${handle}`}
              aria-label={`Resize widget ${handle}`}
              on:mousedown={(event) => handleResizeMouseDown(event, sourceWidget, handle)}
              on:touchstart={(event) => handleResizeTouchStart(event, sourceWidget, handle)}
            ></button>
          {/each}
        {/if}
      </div>
    {/each}

    {#if marquee}
      <div
        class="marquee-rect"
        style={`left:${Math.min(marquee.startX, marquee.x)}px;top:${Math.min(marquee.startY, marquee.y)}px;width:${Math.abs(marquee.x - marquee.startX)}px;height:${Math.abs(marquee.y - marquee.startY)}px;`}
        aria-hidden="true"
      ></div>
    {/if}

    {#each activeGuides.vertical as guideX (guideX)}
      <div class="guide-line bg-accent" style={`left:${guideX}px;top:0;width:1px;height:${CANVAS_HEIGHT}px;`}></div>
    {/each}
    {#each activeGuides.horizontal as guideY (guideY)}
      <div class="guide-line bg-accent" style={`top:${guideY}px;left:0;width:${CANVAS_WIDTH}px;height:1px;`}></div>
    {/each}
  </div>
</div>
</div>

<style>
  .canvas-wrap {
    width: 100%;
  }

  .canvas-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.25rem;
    margin-bottom: 0.25rem;
  }

  .canvas-toolbar-group {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .guide-line {
    position: absolute;
    z-index: 30;
    pointer-events: none;
  }

  .canvas-shell {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 9;
    max-height: 760px;
    background:
      linear-gradient(45deg, #1f2430 25%, transparent 25%) -12px 0 / 24px 24px,
      linear-gradient(-45deg, #1f2430 25%, transparent 25%) -12px 0 / 24px 24px,
      linear-gradient(45deg, transparent 75%, #1f2430 75%) -12px 0 / 24px 24px,
      linear-gradient(-45deg, transparent 75%, #1f2430 75%) -12px 0 / 24px 24px,
      #121620;
    border-radius: 0.75rem;
    overflow: hidden;
    touch-action: none;
  }

  .canvas-shell.media-drag-over {
    outline: 2px dashed var(--color-accent, #06b6d4);
    outline-offset: -4px;
  }

  .canvas-shell.is-panning {
    cursor: grab;
  }

  .canvas-shell.is-panning:active {
    cursor: grabbing;
  }

  .canvas-stage {
    background: rgba(10, 14, 24, 0.28);
    /* Pan/zoom must feel immediate — never animate the stage transform. */
    transition: none;
  }

  .canvas-empty-state {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    color: rgba(231, 226, 255, 0.55);
    pointer-events: none;
  }

  .empty-icon-box {
    width: 5.25rem;
    height: 5.25rem;
    border: 1px dashed rgba(207, 190, 255, 0.35);
    border-radius: 0.9rem;
    display: grid;
    place-items: center;
    background: rgba(122, 76, 230, 0.08);
    font-size: 1.9rem;
  }

  .empty-title {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 600;
    letter-spacing: 0.01em;
  }

  .empty-subtitle {
    margin: 0;
    font-size: 0.9rem;
    opacity: 0.85;
  }

  .widget-frame {
    position: absolute;
    border: 1px solid rgba(132, 149, 175, 0.55);
    transform-origin: center center;
    box-sizing: border-box;
    user-select: none;
  }

  .widget-lock-badge {
    position: absolute;
    top: 4px;
    left: 4px;
    z-index: 4;
    font-size: 12px;
    line-height: 1;
    background: rgba(10, 14, 24, 0.6);
    border-radius: 4px;
    padding: 2px 4px;
    pointer-events: none;
  }

  .widget-owner-tag {
    position: absolute;
    left: 6px;
    bottom: 4px;
    z-index: 4;
    font-size: 10px;
    line-height: 1;
    color: rgba(222, 229, 243, 0.55);
    pointer-events: none;
  }

  .widget-frame.selected {
    border: 2px solid #06b6d4;
    box-shadow: 0 0 0 2px rgba(6, 182, 212, 0.35);
  }

  .widget-frame.selected-primary {
    box-shadow: 0 0 0 3px rgba(6, 182, 212, 0.6);
  }

  .marquee-rect {
    position: absolute;
    z-index: 40;
    border: 1px solid #06b6d4;
    background: rgba(6, 182, 212, 0.1);
    pointer-events: none;
  }

  .hidden-widget {
    border: 1px dashed rgba(255, 200, 50, 0.8) !important;
    box-shadow: none !important;
  }

  .anim-fade { animation: anim-fade var(--anim-duration, 400ms) ease both; }
  .anim-slide-up { animation: anim-slide-up var(--anim-duration, 400ms) ease both; }
  .anim-slide-down { animation: anim-slide-down var(--anim-duration, 400ms) ease both; }
  .anim-slide-left { animation: anim-slide-left var(--anim-duration, 400ms) ease both; }
  .anim-slide-right { animation: anim-slide-right var(--anim-duration, 400ms) ease both; }
  .anim-pop { animation: anim-pop var(--anim-duration, 400ms) ease both; }
  .anim-bounce { animation: anim-bounce var(--anim-duration, 400ms) ease both; }

  .widget-preview {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    color: #ffffff;
    background: rgba(20, 23, 33, 0.5);
  }

  .widget-preview-text {
    overflow: visible;
  }

  .preview-text {
    text-align: center;
    padding: 0.3rem;
    font-weight: 600;
    font-size: 0.95rem;
    line-height: 1.2;
  }

  .preview-stack {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    pointer-events: none;
  }

  .placeholder {
    border: 1px dashed rgba(255, 255, 255, 0.65);
    width: calc(100% - 12px);
    height: calc(100% - 12px);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.8rem;
  }

  /* Handles live in the scaled stage layer; counter-scale by 1/zoom so they
     stay a constant ~12px on screen and remain grabbable at low zoom. */
  .resize-handle,
  .rotation-handle {
    position: absolute;
    width: 12px;
    height: 12px;
    border: 0;
    padding: 0;
    border-radius: 2px;
    background: #06b6d4;
    cursor: pointer;
    transform: translate(-50%, -50%) scale(var(--inv-zoom, 1));
  }

  .rotation-handle {
    border-radius: 999px;
    width: 14px;
    height: 14px;
    left: 50%;
    top: -24px;
  }

  .rotation-line {
    position: absolute;
    width: 2px;
    height: 16px;
    background: #06b6d4;
    left: 50%;
    top: -16px;
    transform: translateX(-50%);
  }

  .handle-nw { left: 0; top: 0; cursor: nwse-resize; }
  .handle-n { left: 50%; top: 0; cursor: ns-resize; }
  .handle-ne { left: 100%; top: 0; cursor: nesw-resize; }
  .handle-e { left: 100%; top: 50%; cursor: ew-resize; }
  .handle-se { left: 100%; top: 100%; cursor: nwse-resize; }
  .handle-s { left: 50%; top: 100%; cursor: ns-resize; }
  .handle-sw { left: 0; top: 100%; cursor: nesw-resize; }
  .handle-w { left: 0; top: 50%; cursor: ew-resize; }
</style>
