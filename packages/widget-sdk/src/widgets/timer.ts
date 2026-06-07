import { registerWidget, type WidgetDefinition } from "../index.js";

export const timerWidgetDefinition: WidgetDefinition = {
  id: "timer",
  name: "Timer",
  defaultProps: {
    rotation: 0,
    mode: "stopwatch",
    durationSeconds: 60,
    running: false,
    fontSize: 32,
    color: "#ffffff"
  },
  renderUrl: "/widgets/timer"
};

registerWidget(timerWidgetDefinition);
