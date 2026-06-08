export interface WidgetDefinition {
  id: string;
  name: string;
  defaultProps: Record<string, unknown>;
  renderUrl: string;
  settingsSchema?: Record<string, unknown>;
}

export function registerWidget(def: WidgetDefinition): void {
  if (!def || typeof def !== "object") {
    throw new Error("Widget definition is required.");
  }

  const requiredStringFields: Array<keyof Pick<WidgetDefinition, "id" | "name" | "renderUrl">> = [
    "id",
    "name",
    "renderUrl"
  ];

  for (const field of requiredStringFields) {
    if (!def[field] || typeof def[field] !== "string") {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  if (!def.defaultProps || typeof def.defaultProps !== "object") {
    throw new Error("Missing required field: defaultProps");
  }

  console.log(`Registered widget: ${def.id}`);
}

export * from "./widgets/index.js";
export { marqueeWidgetDefinition } from "./widgets/marquee.js";
export { clockWidgetDefinition } from "./widgets/clock.js";
export { shapeWidgetDefinition } from "./widgets/shape.js";
