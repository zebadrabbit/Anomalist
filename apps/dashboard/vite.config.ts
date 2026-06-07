import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    proxy: {
      "/socket.io": {
        target: "http://localhost:3001",
        ws: true
      }
    }
  }
});
