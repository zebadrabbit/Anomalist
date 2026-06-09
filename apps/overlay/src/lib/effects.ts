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

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

export function buildEffectStyles(effects: any, isTextWidget: boolean): {
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
    // For text widgets, move glow/shadow filter onto the text element so it only
    // affects the rendered text and not the widget background.
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
        // Gradient text and stroke conflict visually, so stroke is only applied when gradient is disabled.
        textParts.push(`-webkit-text-stroke: ${width}px ${color}`);
        textParts.push("paint-order: stroke fill");
      }
    }
  }

  // For non-text widgets, filter stays on the container (glows the whole widget).
  const containerStyle = !isTextWidget && filterParts.length ? `filter:${filterParts.join(" ")};` : "";
  const textStyle = textParts.length ? `${textParts.join(";")};` : "";

  return { containerStyle, textStyle };
}