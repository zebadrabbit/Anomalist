<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { createEventDispatcher } from "svelte";
  import { writable } from "svelte/store";
  import type { CanvasState, Widget } from "@anomalist/types";
  import { SocketEvents } from "@anomalist/types";
  import type { Socket } from "socket.io-client";

  const CANVAS_WIDTH = 1920;
  const CANVAS_HEIGHT = 1080;
  const MIN_SIZE = 20;

  type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

  interface InteractionState {
    mode: "drag" | "resize" | "rotate";
    widgetId: string;
    startPoint: { x: number; y: number };
    startWidget: Widget;
    handle?: ResizeHandle;
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

  const handles: ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

  $: selectedStore.set(selectedWidgetId);
  $: activeScene = stagingState.scenes.find((scene) => scene.id === stagingState.activeSceneId);
  $: widgets = activeScene?.widgets ?? [];

  function asString(value: unknown, fallback: string): string {
    return typeof value === "string" ? value : fallback;
  }

  function asNumber(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  }

  function asBoolean(value: unknown, fallback: boolean): boolean {
    return typeof value === "boolean" ? value : fallback;
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
    if (!canTransform) {
      return;
    }
    beginDrag(widget, getPointFromMouse(event));
  }

  function handleWidgetTouchStart(event: TouchEvent, widget: Widget) {
    event.stopPropagation();
    event.preventDefault();
    selectWidget(widget.id);
    if (!canTransform) {
      return;
    }
    beginDrag(widget, getPointFromTouch(event));
  }

  function handleResizeMouseDown(event: MouseEvent, widget: Widget, handle: ResizeHandle) {
    if (!canTransform) {
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    selectWidget(widget.id);
    beginResize(widget, getPointFromMouse(event), handle);
  }

  function handleResizeTouchStart(event: TouchEvent, widget: Widget, handle: ResizeHandle) {
    if (!canTransform) {
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    selectWidget(widget.id);
    beginResize(widget, getPointFromTouch(event), handle);
  }

  function handleRotateMouseDown(event: MouseEvent, widget: Widget) {
    if (!canTransform) {
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    selectWidget(widget.id);
    beginRotate(widget, getPointFromMouse(event));
  }

  function handleRotateTouchStart(event: TouchEvent, widget: Widget) {
    if (!canTransform) {
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
    interaction = null;
  });
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
    {#each widgets as sourceWidget (sourceWidget.id)}
      <div
        class={`widget-frame ${$selectedStore === sourceWidget.id ? "selected" : ""}${!sourceWidget.visible ? " hidden-widget" : ""}`}
        role="button"
        tabindex="0"
        aria-label={`Select ${sourceWidget.type} widget`}
        style={`left:${draftWidgets[sourceWidget.id]?.x ?? sourceWidget.x}px;top:${draftWidgets[sourceWidget.id]?.y ?? sourceWidget.y}px;width:${draftWidgets[sourceWidget.id]?.width ?? sourceWidget.width}px;height:${draftWidgets[sourceWidget.id]?.height ?? sourceWidget.height}px;transform:rotate(${draftWidgets[sourceWidget.id]?.rotation ?? sourceWidget.rotation ?? 0}deg);opacity:${sourceWidget.visible ? 1 : 0.4};`}
        on:mousedown={(event) => handleWidgetMouseDown(event, sourceWidget)}
        on:touchstart={(event) => handleWidgetTouchStart(event, sourceWidget)}
        on:keydown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            selectWidget(sourceWidget.id);
          }
        }}
      >
        <div class="widget-preview">
          {#if sourceWidget.type === "text"}
            <div
              class="preview-text"
              style={`font-size:${asNumber(sourceWidget.props.fontSize, 24)}px;color:${asString(sourceWidget.props.color, "#ffffff")};`}
            >
              {asString(sourceWidget.props.content, "Text")}
            </div>
          {:else if sourceWidget.type === "image"}
            {#if asString(sourceWidget.props.url, "")}
              <img src={asString(sourceWidget.props.url, "")} alt="Widget preview" />
            {:else}
              <div class="placeholder">No image</div>
            {/if}
          {:else if sourceWidget.type === "timer"}
            {@const displaySeconds = getTimerDisplaySeconds(sourceWidget, now)}
            {@const mm = Math.floor(displaySeconds / 60).toString().padStart(2, "0")}
            {@const ss = (displaySeconds % 60).toString().padStart(2, "0")}
            <div
              class="preview-text"
              style={`font-size:${asNumber(sourceWidget.props.fontSize, 32)}px;color:${asString(sourceWidget.props.color, "#ffffff")};`}
            >
              {mm}:{ss}
            </div>
          {:else if sourceWidget.type === "counter"}
            <div class="preview-stack">
              {#if asString(sourceWidget.props.label, "")}
                <div
                  style={`font-size:${asNumber(sourceWidget.props.fontSize, 32) * 0.45}px;color:${asString(sourceWidget.props.color, "#ffffff")};opacity:0.8;`}
                >
                  {asString(sourceWidget.props.label, "")}
                </div>
              {/if}
              <div
                style={`font-size:${asNumber(sourceWidget.props.fontSize, 32)}px;color:${asString(sourceWidget.props.color, "#ffffff")};`}
              >
                {asNumber(sourceWidget.props.value, 0)}
              </div>
            </div>
          {:else if sourceWidget.type === "marquee"}
            {@const direction = asString(sourceWidget.props.direction, "left") === "right" ? "right" : "left"}
            <div
              class="preview-text"
              style={`font-size:${asNumber(sourceWidget.props.fontSize, 24)}px;color:${asString(sourceWidget.props.color, "#ffffff")};`}
            >
              {direction === "left" ? "<-" : "->"} {asString(sourceWidget.props.content, "Marquee text")}
            </div>
          {:else if sourceWidget.type === "clock"}
            {@const use12Hour = asString(sourceWidget.props.format, "24h") === "12h"}
            {@const clockText = formatClockTime(now, use12Hour, asBoolean(sourceWidget.props.showSeconds, true))}
            <div
              class="preview-text"
              style={`font-size:${asNumber(sourceWidget.props.fontSize, 48)}px;color:${asString(sourceWidget.props.color, "#ffffff")};font-weight:${asString(sourceWidget.props.fontWeight, "bold") === "normal" ? "normal" : "bold"};font-variant-numeric:tabular-nums;`}
            >
              {clockText}
            </div>
          {:else if sourceWidget.type === "shape"}
            {@const shapeKind = asString(sourceWidget.props.shape, "rectangle")}
            {@const fill = hexToRgba(asString(sourceWidget.props.fillColor, "#7c3aed"), asNumber(sourceWidget.props.fillOpacity, 1))}
            {@const border = hexToRgba(asString(sourceWidget.props.borderColor, "transparent"), asNumber(sourceWidget.props.borderOpacity, 1))}
            {@const borderRadius = shapeKind === "circle" ? "50%" : shapeKind === "pill" ? "999px" : "0px"}
            <div
              style={`width:100%;height:100%;background:${fill};border:${Math.max(0, Math.floor(asNumber(sourceWidget.props.borderWidth, 0)))}px solid ${border};box-sizing:border-box;border-radius:${borderRadius};`}
            ></div>
          {:else}
            <div class="preview-text">{sourceWidget.type}</div>
          {/if}
        </div>

        {#if $selectedStore === sourceWidget.id && canTransform}
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

  .widget-frame {
    position: absolute;
    border: 1px solid rgba(132, 149, 175, 0.55);
    transform-origin: center center;
    box-sizing: border-box;
    user-select: none;
  }

  .widget-frame.selected {
    border: 2px solid #06b6d4;
    box-shadow: 0 0 0 2px rgba(6, 182, 212, 0.35);
  }

  .hidden-widget {
    border: 1px dashed rgba(255, 200, 50, 0.8) !important;
    box-shadow: none !important;
  }

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
