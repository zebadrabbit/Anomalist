import { registerWidget, type WidgetDefinition } from "../index.js";

export const marqueeWidgetDefinition: WidgetDefinition = {
  id: "marquee",
  name: "Marquee",
  defaultProps: {
    rotation: 0,
    content: "Marquee text",
    speed: 20,
    direction: "left",
    fontSize: 24,
    color: "#ffffff",
    backgroundColor: "transparent",
    pauseOnHover: false
  },
  renderUrl: "/widgets/marquee"
};

registerWidget(marqueeWidgetDefinition);
