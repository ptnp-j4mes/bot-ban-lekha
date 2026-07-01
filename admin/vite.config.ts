import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// ponytail: dev proxy /api -> backend, so no CORS and same-origin cookies/headers.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:8787" },
  },
  build: {
    // Two entry points: the admin SPA (index.html) and the customer-facing LIFF page (liff.html).
    rollupOptions: { input: { main: path.resolve(__dirname, "index.html"), liff: path.resolve(__dirname, "liff.html") } },
  },
});
