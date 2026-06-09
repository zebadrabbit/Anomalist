<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { createEventDispatcher } from "svelte";
  import { writable } from "svelte/store";
  import type { CanvasState, Widget } from "@anomalist/types";
  import { SocketEvents } from "@anomalist/types";
  import type { Socket } from "socket.io-client";

  const CANVAS_WIDTH = 1920;
  const CANVAS_HEIGHT = 1080;
  const SYSTEM_FONT_NAMES = new Set(["Arial", "Helvetica", "Georgia", "Times New Roman", "Courier New", "Impact"]);
  const MIN_SIZE = 20;

  type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

  interface InteractionState {
    mode: "drag" | "resize" | "rotate";
    widgetId: string;
    startPoint: { x: number; y: number };
    startWidget: Widget;
    handle?: ResizeHandle;
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
  export let selectedWidgetId: string | null;
  export let canTransform = true;

  const dispatch = createEventDispatcher<{ select: string | null }>();
  const selectedStore = writable<string | null>(null);

  let shellElement: HTMLDivElement | null = null;
  let canvasElement: HTMLDivElement | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let scale = 1;
  let offsetX = 0;
  let interaction: InteractionState | null = null;
  let draftWidgets: Record<string, Partial<Widget>> = {};
  let now = Date.now();
  let tickInterval: ReturnType<typeof setInterval>;
  let timerElapsedByWidget: Record<string, number> = {};
  let timerFallbackStartByWidget: Record<string, number> = {};
  let widgetAnimClasses: Record<string, string> = {};
  const prevVisibleById = new Map<string, boolean>();
  const animTimers = new Map<string, ReturnType<typeof setTimeout>>();

  const handles: ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

  $: selectedStore.set(selectedWidgetId);
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

  const emitTransform = throttle((widgetId: string, draft: Partial<Widget>) => {
    if (!socket) {
      return;
    }

    socket.emit(SocketEvents.WIDGET_TRANSFORM, { id: widgetId, ...draft });
  }, 33);

  function updateScale() {
    if (!shellElement) {
      return;
    }

    const availableWidth = shellElement.clientWidth;
    const availableHeight = shellElement.clientHeight;
    if (availableWidth === 0 || availableHeight === 0) {
      return;
    }

    scale = Math.min(availableWidth / CANVAS_WIDTH, availableHeight / CANVAS_HEIGHT, 1);
    offsetX = (availableWidth - CANVAS_WIDTH * scale) / 2;
  }

  function getCanvasPoint(clientX: number, clientY: number): { x: number; y: number } {
    if (!canvasElement) {
      return { x: 0, y: 0 };
    }

    const rect = canvasElement.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / scale,
      y: (clientY - rect.top) / scale
    };
  }

  function getPointFromMouse(event: MouseEvent): { x: number; y: number } {
    return getCanvasPoint(event.clientX, event.clientY);
  }

  function getPointFromTouch(event: TouchEvent): { x: number; y: number } {
    const touch = event.touches[0] ?? event.changedTouches[0];
    return getCanvasPoint(touch.clientX, touch.clientY);
  }

  function selectWidget(nextWidgetId: string | null) {
    selectedStore.set(nextWidgetId);
    dispatch("select", nextWidgetId);
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

    emitTransform(widgetId, draftWidgets[widgetId] ?? {});
  }

  function clearDraft(widgetId: string) {
    const { [widgetId]: _removed, ...rest } = draftWidgets;
    draftWidgets = rest;
  }

  function beginDrag(widget: Widget, point: { x: number; y: number }) {
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

  function handleWidgetMouseDown(event: MouseEvent, widget: Widget) {
    event.stopPropagation();
    event.preventDefault();
    selectWidget(widget.id);
    if (!canTransform || widget.locked === true) {
      return;
    }
    beginDrag(widget, getPointFromMouse(event));
  }

  function handleWidgetTouchStart(event: TouchEvent, widget: Widget) {
    event.stopPropagation();
    event.preventDefault();
    selectWidget(widget.id);
    if (!canTransform || widget.locked === true) {
      return;
    }
    beginDrag(widget, getPointFromTouch(event));
  }

  function handleResizeMouseDown(event: MouseEvent, widget: Widget, handle: ResizeHandle) {
    if (!canTransform || widget.locked === true) {
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    selectWidget(widget.id);
    beginResize(widget, getPointFromMouse(event), handle);
  }

  function handleResizeTouchStart(event: TouchEvent, widget: Widget, handle: ResizeHandle) {
    if (!canTransform || widget.locked === true) {
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    selectWidget(widget.id);
    beginResize(widget, getPointFromTouch(event), handle);
  }

  function handleRotateMouseDown(event: MouseEvent, widget: Widget) {
    if (!canTransform || widget.locked === true) {
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    selectWidget(widget.id);
    beginRotate(widget, getPointFromMouse(event));
  }

  function handleRotateTouchStart(event: TouchEvent, widget: Widget) {
    if (!canTransform || widget.locked === true) {
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    selectWidget(widget.id);
    beginRotate(widget, getPointFromTouch(event));
  }

  function updateDrag(point: { x: number; y: number }) {
    if (!interaction) {
      return;
    }

    const dx = point.x - interaction.startPoint.x;
    const dy = point.y - interaction.startPoint.y;
    const nextX = clamp(
      interaction.startWidget.x + dx,
      0,
      Math.max(0, CANVAS_WIDTH - interaction.startWidget.width)
    );
    const nextY = clamp(
      interaction.startWidget.y + dy,
      0,
      Math.max(0, CANVAS_HEIGHT - interaction.startWidget.height)
    );

    updateDraft(interaction.widgetId, {
      x: Math.round(nextX),
      y: Math.round(nextY)
    });
  }

  function updateResize(point: { x: number; y: number }) {
    if (!interaction || !interaction.handle) {
      return;
    }

    const dx = point.x - interaction.startPoint.x;
    const dy = point.y - interaction.startPoint.y;

    let nextX = interaction.startWidget.x;
    let nextY = interaction.startWidget.y;
    let nextWidth = interaction.startWidget.width;
    let nextHeight = interaction.startWidget.height;

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

  function onPointerMove(point: { x: number; y: number }, snap: boolean) {
    if (!interaction || !canTransform) {
      return;
    }

    if (interaction.mode === "drag") {
      updateDrag(point);
      return;
    }

    if (interaction.mode === "resize") {
      updateResize(point);
      return;
    }

    if (interaction.mode === "rotate") {
      updateRotation(point, snap);
    }
  }

  function emitFinalUpdate() {
    if (!interaction || !socket) {
      return;
    }

    const draft = draftWidgets[interaction.widgetId];
    if (draft) {
      socket.emit(SocketEvents.WIDGET_UPDATE, {
        id: interaction.widgetId,
        ...draft
      });
    }
  }

  function onPointerEnd() {
    if (!interaction) {
      return;
    }

    emitFinalUpdate();
    clearDraft(interaction.widgetId);
    interaction = null;
  }

  function handleWindowMouseMove(event: MouseEvent) {
    if (!interaction) {
      return;
    }

    onPointerMove(getPointFromMouse(event), event.shiftKey);
  }

  function handleWindowTouchMove(event: TouchEvent) {
    if (!interaction) {
      return;
    }

    event.preventDefault();
    onPointerMove(getPointFromTouch(event), false);
  }

  function handleWindowMouseUp() {
    onPointerEnd();
  }

  function handleWindowTouchEnd() {
    onPointerEnd();
  }

  onMount(() => {
    tickInterval = setInterval(() => {
      now = Date.now();
    }, 1000);

    updateScale();
    resizeObserver = new ResizeObserver(() => {
      updateScale();
    });

    if (shellElement) {
      resizeObserver.observe(shellElement);
    }

    window.addEventListener("resize", updateScale);
    window.addEventListener("mousemove", handleWindowMouseMove);
    window.addEventListener("mouseup", handleWindowMouseUp);
    window.addEventListener("touchmove", handleWindowTouchMove, { passive: false });
    window.addEventListener("touchend", handleWindowTouchEnd);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateScale);
      window.removeEventListener("mousemove", handleWindowMouseMove);
      window.removeEventListener("mouseup", handleWindowMouseUp);
      window.removeEventListener("touchmove", handleWindowTouchMove);
      window.removeEventListener("touchend", handleWindowTouchEnd);
    };
  });

  onDestroy(() => {
    clearInterval(tickInterval);
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

<div
  class="canvas-shell"
  bind:this={shellElement}
  role="button"
  tabindex="0"
  aria-label="Deselect widget"
  on:mousedown={() => selectWidget(null)}
  on:touchstart={() => selectWidget(null)}
  on:keydown={(event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectWidget(null);
    }
  }}
>
  <div
    class="canvas-stage"
    bind:this={canvasElement}
    style={`position:absolute;left:0;top:0;width:${CANVAS_WIDTH}px;height:${CANVAS_HEIGHT}px;transform-origin:top left;transform:translate(${offsetX}px,0px) scale(${scale});`}
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
        class={`widget-frame ${$selectedStore === sourceWidget.id ? "selected" : ""}${!sourceWidget.visible ? " hidden-widget" : ""}`}
        role="button"
        tabindex="0"
        aria-label={`Select ${sourceWidget.type} widget`}
        style={`left:${draftWidgets[sourceWidget.id]?.x ?? sourceWidget.x}px;top:${draftWidgets[sourceWidget.id]?.y ?? sourceWidget.y}px;width:${draftWidgets[sourceWidget.id]?.width ?? sourceWidget.width}px;height:${draftWidgets[sourceWidget.id]?.height ?? sourceWidget.height}px;transform:rotate(${draftWidgets[sourceWidget.id]?.rotation ?? sourceWidget.rotation ?? 0}deg);opacity:${sourceWidget.visible ? 1 : 0.4};font-family:${fontFamilyStyle(normalizeFontName(sourceWidget.props.fontFamily))};${sourceWidget.type !== "image" ? effectStyles.containerStyle : ""}`}
        on:mousedown={(event) => handleWidgetMouseDown(event, sourceWidget)}
        on:touchstart={(event) => handleWidgetTouchStart(event, sourceWidget)}
        on:keydown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            selectWidget(sourceWidget.id);
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
              <img src={asString(sourceWidget.props.url, "")} alt="Widget preview" style={`width:100%;height:100%;object-fit:contain;display:block;${effectStyles.containerStyle}`} />
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

        {#if $selectedStore === sourceWidget.id && canTransform && !sourceWidget.locked}
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
  </div>
</div>

<style>
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

  .canvas-stage {
    background: rgba(10, 14, 24, 0.28);
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
    transform: translate(-50%, -50%);
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
