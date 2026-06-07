import { registerWidget, type WidgetDefinition } from "../index.js";

export const counterWidgetDefinition: WidgetDefinition = {
  id: "counter",
  name: "Counter",
  defaultProps: {
    rotation: 0,
    value: 0,
    label: "",
    step: 1,
    fontSize: 32,
    color: "#ffffff"
  },
  renderUrl: "/widgets/counter"
};

registerWidget(counterWidgetDefinition);
