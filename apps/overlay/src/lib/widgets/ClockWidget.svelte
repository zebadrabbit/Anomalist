<script lang="ts">
  import { onDestroy } from "svelte";
  import type { Widget } from "@anomalist/types";

  export let widget: Widget;

  const ALLOWED_TIMEZONES = new Set([
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "America/Sao_Paulo",
    "Europe/London",
    "Europe/Paris",
    "Europe/Berlin",
    "Asia/Tokyo",
    "Asia/Shanghai",
    "Asia/Kolkata",
    "Australia/Sydney",
    "Pacific/Auckland"
  ]);

  let now = Date.now();
  const interval = setInterval(() => {
    now = Date.now();
  }, 1000);

  function asString(value: unknown, fallback: string): string {
    return typeof value === "string" ? value : fallback;
  }

  function asNumber(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  }

  function asBoolean(value: unknown, fallback: boolean): boolean {
    return typeof value === "boolean" ? value : fallback;
  }

  function formatClockTime(timestamp: number): string {
    const date = new Date(timestamp);
    const use12h = format === "12h";
    const options: Intl.DateTimeFormatOptions = {
      hour: "2-digit",
      minute: "2-digit",
      hour12: use12h
    };

    if (showSeconds) {
      options.second = "2-digit";
    }

    if (timezone) {
      options.timeZone = timezone;
    }

    return date.toLocaleTimeString("en-US", options);
  }

  $: format = asString(widget.props.format, "24h") === "12h" ? "12h" : "24h";
  $: showSeconds = asBoolean(widget.props.showSeconds, true);
  $: requestedTimezone = asString(widget.props.timezone, "");
  $: timezone = requestedTimezone && ALLOWED_TIMEZONES.has(requestedTimezone) ? requestedTimezone : "";
  $: fontSize = Math.max(8, asNumber(widget.props.fontSize, 48));
  $: color = asString(widget.props.color, "#ffffff");
  $: fontWeight = asString(widget.props.fontWeight, "bold") === "normal" ? "normal" : "bold";
  $: display = formatClockTime(now);

  onDestroy(() => {
    clearInterval(interval);
  });
</script>

<div
  style={`width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:${fontSize}px;color:${color};font-weight:${fontWeight};font-variant-numeric:tabular-nums;`}
>
  {display}
</div>
