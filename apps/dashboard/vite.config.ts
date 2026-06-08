import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

const socketProxyTarget = process.env.VITE_SERVER_TARGET ?? "http://localhost:3001";

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    proxy: {
      "/api": {
        target: socketProxyTarget
      },
      "/media": {
        target: socketProxyTarget
      },
      "/socket.io": {
        target: socketProxyTarget,
        ws: true
      }
    }
  }
});
