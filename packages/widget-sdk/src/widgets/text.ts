import { registerWidget, type WidgetDefinition } from "../index.js";

export const textWidgetDefinition: WidgetDefinition = {
  id: "text",
  name: "Text",
  defaultProps: {
    rotation: 0,
    content: "Text",
    fontSize: 24,
    color: "#ffffff",
    fontWeight: "normal",
    backgroundColor: "transparent"
  },
  renderUrl: "/widgets/text"
};

registerWidget(textWidgetDefinition);
