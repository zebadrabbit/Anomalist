import { registerWidget, type WidgetDefinition } from "../index.js";

export const chatWidgetDefinition: WidgetDefinition = {
  id: "chat",
  name: "Chat Feed",
  defaultProps: {
    maxMessages: 10,
    fontSize: 16,
    showBadges: true,
    colorByUser: true,
    background: "rgba(0,0,0,0.5)",
    textColor: "#ffffff",
    messageTimeout: 0,
    borderRadius: 8
  },
  renderUrl: "/widgets/chat"
};

registerWidget(chatWidgetDefinition);
