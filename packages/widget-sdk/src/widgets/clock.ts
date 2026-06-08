import { registerWidget, type WidgetDefinition } from "../index.js";

export const clockWidgetDefinition: WidgetDefinition = {
  id: "clock",
  name: "Clock",
  defaultProps: {
    rotation: 0,
    format: "24h",
    showSeconds: true,
    timezone: "",
    fontSize: 48,
    color: "#ffffff",
    fontWeight: "bold"
  },
  renderUrl: "/widgets/clock"
};

registerWidget(clockWidgetDefinition);
