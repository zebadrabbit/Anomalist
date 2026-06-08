import { registerWidget, type WidgetDefinition } from "../index.js";

export const shapeWidgetDefinition: WidgetDefinition = {
  id: "shape",
  name: "Shape",
  defaultProps: {
    rotation: 0,
    shape: "rectangle",
    fillColor: "#7c3aed",
    fillOpacity: 1,
    borderColor: "transparent",
    borderWidth: 0,
    borderOpacity: 1
  },
  renderUrl: "/widgets/shape"
};

registerWidget(shapeWidgetDefinition);
