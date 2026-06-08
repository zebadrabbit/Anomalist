import "dotenv/config";
import express from "express";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import path from "node:path";
import { Server } from "socket.io";
import type { CanvasState, Widget, WidgetTransform, WidgetUpdate } from "@anomalist/types";
import { loadState, saveState } from "./db.js";

const app = express();
const port = Number(process.env.PORT ?? 3001);
const JOIN_EVENT = "JOIN";
const SocketEvents = {
  AUTH_ERROR: "AUTH_ERROR",
  CANVAS_UPDATE: "CANVAS_UPDATE",
  WIDGET_TRANSFORM: "widget:transform",
  WIDGET_ADD: "WIDGET_ADD",
  WIDGET_REMOVE: "WIDGET_REMOVE",
  WIDGET_UPDATE: "WIDGET_UPDATE",
  SCENE_CHANGE: "SCENE_CHANGE"
} as const;
const configuredOwnerToken = process.env.OWNER_TOKEN;
const ownerToken =
  configuredOwnerToken && configuredOwnerToken !== "change-me" ? configuredOwnerToken : randomUUID();
const isProduction = process.env.NODE_ENV === "production";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (!configuredOwnerToken || configuredOwnerToken === "change-me") {
  console.log(
    `WARNING: No OWNER_TOKEN set in .env — using temporary token for this session only: ${ownerToken}`
  );
  console.log("Set OWNER_TOKEN in apps/server/.env to make it permanent.");
}

function createDefaultState(): CanvasState {
  return {
    scenes: [
      {
        id: "default",
        name: "Default Scene",
        widgets: []
      }
    ],
    layers: [
      {
        id: "layer-1",
        name: "Layer 1",
        visible: true
      }
    ],
    activeSceneId: "default"
  };
}

const persistedCanvasState = loadState("canvas");

let canvasState: CanvasState = persistedCanvasState ?? createDefaultState();

if (!persistedCanvasState) {
  saveState("canvas", canvasState);
}

function getActiveScene(state: CanvasState) {
  return state.scenes.find((scene) => scene.id === state.activeSceneId);
}

if (isProduction) {
  const dashboardBuildPath = path.join(__dirname, "../../dashboard/build");
  const overlayBuildPath = path.join(__dirname, "../../overlay/build");

  app.use("/overlay", express.static(overlayBuildPath));
  app.use(express.static(dashboardBuildPath));

  app.get("/overlay/*rest", (_req, res) => {
    res.sendFile(path.join(overlayBuildPath, "index.html"));
  });

  app.get("/*rest", (req, res, next) => {
    if (req.path.startsWith("/socket.io") || req.path.startsWith("/overlay")) {
      next();
      return;
    }

    res.sendFile(path.join(dashboardBuildPath, "index.html"));
  });
}

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*"
  }
});

io.on("connection", (socket) => {
  console.log("client connected");

  socket.on(JOIN_EVENT, (payload: { role: "dashboard" | "overlay"; token?: string }) => {
    if (!payload || (payload.role !== "dashboard" && payload.role !== "overlay")) {
      return;
    }

    if (payload.role === "dashboard") {
      if (!payload.token || payload.token !== ownerToken) {
        socket.emit(SocketEvents.AUTH_ERROR, "Invalid token");
        socket.disconnect(true);
        return;
      }
    }

    socket.data.role = payload.role;
    socket.emit(SocketEvents.CANVAS_UPDATE, canvasState);
  });

  socket.on(SocketEvents.WIDGET_ADD, (widget: Widget) => {
    if (socket.data.role !== "dashboard") {
      return;
    }

    const activeScene = getActiveScene(canvasState);
    if (!activeScene) {
      return;
    }

    activeScene.widgets.push(widget);
    saveState("canvas", canvasState);
    io.emit(SocketEvents.CANVAS_UPDATE, canvasState);
  });

  socket.on(SocketEvents.WIDGET_UPDATE, (incomingWidget: Widget | WidgetUpdate) => {
    if (socket.data.role !== "dashboard") {
      return;
    }

    const activeScene = getActiveScene(canvasState);
    if (!activeScene) {
      return;
    }

    const widgetIndex = activeScene.widgets.findIndex((widget) => widget.id === incomingWidget.id);
    if (widgetIndex === -1) {
      return;
    }

    const existingWidget = activeScene.widgets[widgetIndex];
    const { id: _id, props, ...topLevelUpdates } = incomingWidget;

    Object.assign(existingWidget, topLevelUpdates);
    if (props && typeof props === "object") {
      existingWidget.props = {
        ...existingWidget.props,
        ...props
      };
    }

    saveState("canvas", canvasState);
    io.emit(SocketEvents.CANVAS_UPDATE, canvasState);
  });

  socket.on(SocketEvents.WIDGET_TRANSFORM, (data: WidgetTransform) => {
    socket.broadcast.emit(SocketEvents.WIDGET_TRANSFORM, data);
  });

  socket.on(SocketEvents.WIDGET_REMOVE, (payload: { id: string }) => {
    if (socket.data.role !== "dashboard") {
      return;
    }

    const activeScene = getActiveScene(canvasState);
    if (!activeScene) {
      return;
    }

    activeScene.widgets = activeScene.widgets.filter((widget) => widget.id !== payload.id);
    saveState("canvas", canvasState);
    io.emit(SocketEvents.CANVAS_UPDATE, canvasState);
  });

  socket.on(SocketEvents.SCENE_CHANGE, (payload: { sceneId: string }) => {
    if (socket.data.role !== "dashboard") {
      return;
    }

    const sceneExists = canvasState.scenes.some((scene) => scene.id === payload.sceneId);
    if (!sceneExists) {
      return;
    }

    canvasState.activeSceneId = payload.sceneId;
    saveState("canvas", canvasState);
    io.emit(SocketEvents.CANVAS_UPDATE, canvasState);
  });
});

httpServer.listen(port, () => {
  console.log(`server listening on port ${port}`);
});

export { app };
