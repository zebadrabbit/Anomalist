import { registerWidget, type WidgetDefinition } from "../index.js";

export const soundboardWidgetDefinition: WidgetDefinition = {
  id: "soundboard",
  name: "Soundboard",
  defaultProps: {
    sounds: [],
    columns: 3,
    buttonColor: "#7c3aed",
    buttonTextColor: "#ffffff"
  },
  renderUrl: "/widgets/soundboard"
};

registerWidget(soundboardWidgetDefinition);
