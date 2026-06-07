import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";

const app = express();
const port = Number(process.env.PORT ?? 3001);

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*"
  }
});

io.on("connection", () => {
  console.log("client connected");
});

httpServer.listen(port, () => {
  console.log(`server listening on port ${port}`);
});

export { app };
