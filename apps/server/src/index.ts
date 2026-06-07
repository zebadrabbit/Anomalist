import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import type { CanvasState, Widget } from "@anomalist/types";
import { SocketEvents } from "@anomalist/types";

const app = express();
const port = Number(process.env.PORT ?? 3001);
const JOIN_EVENT = "JOIN";

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

let stagingState: CanvasState = createDefaultState();
let liveState: CanvasState = createDefaultState();

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

  socket.on(JOIN_EVENT, (payload: { role: "dashboard" | "overlay" }) => {
    if (!payload || (payload.role !== "dashboard" && payload.role !== "overlay")) {
      return;
    }

    socket.join(payload.role);

    if (payload.role === "dashboard") {
      socket.emit(SocketEvents.STAGING_UPDATE, stagingState);
    }

    if (payload.role === "overlay") {
      socket.emit(SocketEvents.CANVAS_UPDATE, liveState);
    }
  });

  socket.on(SocketEvents.WIDGET_ADD, (widget: Widget) => {
    const activeScene = getActiveScene(stagingState);
    if (!activeScene) {
      return;
    }

    activeScene.widgets.push(widget);
    io.to("dashboard").emit(SocketEvents.STAGING_UPDATE, stagingState);
  });

  socket.on(SocketEvents.WIDGET_UPDATE, (incomingWidget: Partial<Widget> & { id: string }) => {
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

    io.to("dashboard").emit(SocketEvents.STAGING_UPDATE, stagingState);
  });

  socket.on(SocketEvents.WIDGET_REMOVE, (payload: { id: string }) => {
    const activeScene = getActiveScene(stagingState);
    if (!activeScene) {
      return;
    }

    activeScene.widgets = activeScene.widgets.filter((widget) => widget.id !== payload.id);
    io.to("dashboard").emit(SocketEvents.STAGING_UPDATE, stagingState);
  });

  socket.on(SocketEvents.SCENE_CHANGE, (payload: { sceneId: string }) => {
    const sceneExists = stagingState.scenes.some((scene) => scene.id === payload.sceneId);
    if (!sceneExists) {
      return;
    }

    stagingState.activeSceneId = payload.sceneId;
    io.to("dashboard").emit(SocketEvents.STAGING_UPDATE, stagingState);
  });

  socket.on(SocketEvents.PUSH_TO_LIVE, () => {
    liveState = structuredClone(stagingState);
    io.to("overlay").emit(SocketEvents.CANVAS_UPDATE, liveState);
    socket.emit(SocketEvents.CANVAS_UPDATE, liveState);
  });
});

httpServer.listen(port, () => {
  console.log(`server listening on port ${port}`);
});

export { app };
