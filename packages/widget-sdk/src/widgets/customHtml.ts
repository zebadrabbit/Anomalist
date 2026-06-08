import { registerWidget, type WidgetDefinition } from "../index.js";

export const customHtmlWidgetDefinition: WidgetDefinition = {
  id: "custom-html",
  name: "Custom HTML",
  defaultProps: {
    html: "<div style='color:white;font-size:24px'>Hello</div>"
  },
  renderUrl: "/widgets/custom-html"
};

registerWidget(customHtmlWidgetDefinition);
