<script lang="ts">
  import type { Widget } from "@anomalist/types";
  import { SocketEvents } from "@anomalist/types";
  import type { Socket } from "socket.io-client";

  export let widget: Widget;
  export let socket: Socket | null;

  const SOFT_LIMIT = 50000;
  let previewEnabled = true;

  function debounce(fn: (...args: any[]) => void, ms: number) {
    let timer: ReturnType<typeof setTimeout>;
    return (...args: any[]) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  }

  function asString(value: unknown, fallback: string): string {
    return typeof value === "string" ? value : fallback;
  }

  const emitHtml = debounce((html: string) => {
    socket?.emit(SocketEvents.WIDGET_UPDATE, {
      id: widget.id,
      props: { html }
    });
  }, 500);

  $: html = asString(widget.props.html, "");
  $: count = html.length;
</script>

<section class="flex flex-col gap-3">
  <div class="alert alert-warning text-sm">
    <span>Only paste HTML code you wrote or fully trust. This widget runs in a sandboxed frame.</span>
  </div>

  <label class="form-control w-full">
    <span class="label-text mb-1">HTML</span>
    <textarea
      class="textarea textarea-bordered w-full font-mono"
      style="min-height:200px;"
      placeholder="<!-- Your HTML here -->"
      value={html}
      on:input={(event) => emitHtml(event.currentTarget.value)}
    ></textarea>
  </label>

  <div class="flex items-center justify-between text-xs text-base-content/70">
    <span>{count.toLocaleString()} characters</span>
    {#if count > SOFT_LIMIT}
      <span class="text-warning">Soft limit exceeded (50,000 characters)</span>
    {/if}
  </div>

  <label class="label cursor-pointer justify-start gap-3 px-0">
    <input class="toggle toggle-primary" type="checkbox" bind:checked={previewEnabled} />
    <span class="label-text">Preview</span>
  </label>

  {#if previewEnabled}
    <div class="rounded-lg border border-base-300 bg-base-100 p-2">
      <div class="h-56 overflow-hidden rounded border border-base-300">
        <iframe
          srcdoc={html}
          sandbox="allow-scripts allow-same-origin"
          style="width:100%;height:100%;border:none;background:transparent;"
          title="Custom HTML preview"
        ></iframe>
      </div>
    </div>
  {/if}
</section>
