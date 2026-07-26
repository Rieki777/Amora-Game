import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    strictPort: false,
    host: true,
    // Dev API proxy (plan hazard table, dies at S0): `pnpm dev` used to serve
    // the SPA with no backend at all — and the API server ALSO defaulted to
    // port 3000, so the two collided before a proxy could even exist. Run
    // `pnpm dev:server` (API on 3001 via .env PORT) beside `pnpm dev` and the
    // SPA talks to a real backend.
    proxy: {
      "/api": { target: process.env.API_PROXY_TARGET || "http://localhost:3001", changeOrigin: true },
      "/health": { target: process.env.API_PROXY_TARGET || "http://localhost:3001", changeOrigin: true },
    },
  },
});
