import express from "express";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { Server } from "socket.io";
import type { CanvasState, Widget } from "@anomalist/types";
import { SocketEvents } from "@anomalist/types";
import { loadState, saveState } from "./db.js";

const app = express();
const port = Number(process.env.PORT ?? 3001);
const JOIN_EVENT = "JOIN";
const defaultOwnerToken = randomUUID();
const ownerToken = process.env.OWNER_TOKEN ?? defaultOwnerToken;

if (!process.env.OWNER_TOKEN) {
  console.log(`OWNER TOKEN: ${ownerToken}`);
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

const persistedStagingState = loadState("staging");
const persistedLiveState = loadState("live");

let stagingState: CanvasState = persistedStagingState ?? createDefaultState();
let liveState: CanvasState = persistedLiveState ?? createDefaultState();

if (!persistedStagingState) {
  saveState("staging", stagingState);
}

if (!persistedLiveState) {
  saveState("live", liveState);
}

function getActiveScene(state: CanvasState) {
  return state.scenes.find((scene) => scene.id === state.activeSceneId);
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
    socket.join(payload.role);

    if (payload.role === "dashboard") {
      socket.emit(SocketEvents.STAGING_UPDATE, stagingState);
    }

    if (payload.role === "overlay") {
      socket.emit(SocketEvents.CANVAS_UPDATE, liveState);
    }
  });

  socket.on(SocketEvents.WIDGET_ADD, (widget: Widget) => {
    if (socket.data.role !== "dashboard") {
      return;
    }

    const activeScene = getActiveScene(stagingState);
    if (!activeScene) {
      return;
    }

    activeScene.widgets.push(widget);
    saveState("staging", stagingState);
    io.to("dashboard").emit(SocketEvents.STAGING_UPDATE, stagingState);
  });

  socket.on(SocketEvents.WIDGET_UPDATE, (incomingWidget: Partial<Widget> & { id: string }) => {
    if (socket.data.role !== "dashboard") {
      return;
    }

    const activeScene = getActiveScene(stagingState);
    if (!activeScene) {
      return;
    }

    const widgetIndex = activeScene.widgets.findIndex((widget) => widget.id === incomingWidget.id);
    if (widgetIndex === -1) {
      return;
    }

    activeScene.widgets[widgetIndex] = {
      ...activeScene.widgets[widgetIndex],
      ...incomingWidget
    };

    saveState("staging", stagingState);
    io.to("dashboard").emit(SocketEvents.STAGING_UPDATE, stagingState);
  });

  socket.on(SocketEvents.WIDGET_REMOVE, (payload: { id: string }) => {
    if (socket.data.role !== "dashboard") {
      return;
    }

    const activeScene = getActiveScene(stagingState);
    if (!activeScene) {
      return;
    }

    activeScene.widgets = activeScene.widgets.filter((widget) => widget.id !== payload.id);
    saveState("staging", stagingState);
    io.to("dashboard").emit(SocketEvents.STAGING_UPDATE, stagingState);
  });

  socket.on(SocketEvents.SCENE_CHANGE, (payload: { sceneId: string }) => {
    if (socket.data.role !== "dashboard") {
      return;
    }

    const sceneExists = stagingState.scenes.some((scene) => scene.id === payload.sceneId);
    if (!sceneExists) {
      return;
    }

    stagingState.activeSceneId = payload.sceneId;
    saveState("staging", stagingState);
    io.to("dashboard").emit(SocketEvents.STAGING_UPDATE, stagingState);
  });

  socket.on(SocketEvents.PUSH_TO_LIVE, () => {
    if (socket.data.role !== "dashboard") {
      return;
    }

    liveState = structuredClone(stagingState);
    saveState("live", liveState);
    io.to("overlay").emit(SocketEvents.CANVAS_UPDATE, liveState);
    socket.emit(SocketEvents.CANVAS_UPDATE, liveState);
  });
});

httpServer.listen(port, () => {
  console.log(`server listening on port ${port}`);
});

export { app };
