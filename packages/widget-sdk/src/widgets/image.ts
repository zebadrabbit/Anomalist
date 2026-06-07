import { registerWidget, type WidgetDefinition } from "../index.js";

export const imageWidgetDefinition: WidgetDefinition = {
  id: "image",
  name: "Image",
  defaultProps: {
    url: "",
    opacity: 1,
    borderRadius: 0
  },
  renderUrl: "/widgets/image"
};

registerWidget(imageWidgetDefinition);
