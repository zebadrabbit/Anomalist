export interface Widget {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  visible: boolean;
  layerId: string;
  props: Record<string, unknown>;
}

export type WidgetUpdate =
  { id: string } &
  Partial<Omit<Widget, "id" | "props">> & {
    props?: Partial<Widget["props"]>;
  };

export type WidgetTransform =
  { id: string } &
  Partial<Pick<Widget, "x" | "y" | "width" | "height" | "rotation">>;

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
  role: "owner" | "editor" | "moderator";
  permissions?: string[];
}

export const SocketEvents = {
  AUTH_ERROR: "AUTH_ERROR",
  AUTH_SUCCESS: "auth:success",
  CANVAS_UPDATE: "CANVAS_UPDATE",
  PERMISSION_DENIED: "permission:denied",
  WIDGET_TRANSFORM: "widget:transform",
  WIDGET_ADD: "WIDGET_ADD",
  WIDGET_REMOVE: "WIDGET_REMOVE",
  WIDGET_UPDATE: "WIDGET_UPDATE",
  SCENE_CHANGE: "SCENE_CHANGE",
  USER_JOIN: "USER_JOIN",
  USER_LEAVE: "USER_LEAVE"
} as const;
