export interface Widget {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  layerId: string;
  props: Record<string, unknown>;
}

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
}

export interface Scene {
  id: string;
  name: string;
  widgets: Widget[];
}

export interface CanvasState {
  scenes: Scene[];
  layers: Layer[];
  activeSceneId: string;
}

export interface User {
  id: string;
  username: string;
  role: "owner" | "moderator";
}

export const SocketEvents = {
  AUTH_ERROR: "AUTH_ERROR",
  CANVAS_UPDATE: "CANVAS_UPDATE",
  PUSH_TO_LIVE: "PUSH_TO_LIVE",
  STAGING_UPDATE: "STAGING_UPDATE",
  WIDGET_ADD: "WIDGET_ADD",
  WIDGET_REMOVE: "WIDGET_REMOVE",
  WIDGET_UPDATE: "WIDGET_UPDATE",
  SCENE_CHANGE: "SCENE_CHANGE",
  USER_JOIN: "USER_JOIN",
  USER_LEAVE: "USER_LEAVE"
} as const;
