import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";

/**
 * Serve the staged Living Map artifact in DEV.
 *
 * `client/public/grounds/index.html` is served correctly in production, where
 * Express hands out `dist/public` with `express.static`. Dev is different: a
 * request ending in `.html` is claimed by vite's own HTML middleware, which
 * resolves it against `root` (`client/`), finds no `client/grounds/index.html`
 * and falls through to the SPA. `/map` then probes the manifest, gets the
 * app's own HTML back, and honestly reports the map as not installed, which is
 * safe and completely baffling on a laptop where the file plainly exists.
 *
 * Registering the middleware directly (rather than returning a function from
 * configureServer) puts it AHEAD of vite's internal middlewares, which is the
 * whole point. Two exact paths, no directory walking.
 */
function serveGroundsInDev(): Plugin {
  const dir = path.resolve(import.meta.dirname, "client", "public", "grounds");
  const types: Record<string, string> = {
    "/grounds/index.html": "text/html; charset=utf-8",
    "/grounds/manifest.json": "application/json; charset=utf-8",
  };
  return {
    name: "serve-grounds-in-dev",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? "").split("?")[0];
        const contentType = types[url];
        if (!contentType) return next();
        const file = path.join(dir, path.basename(url));
        if (!fs.existsSync(file)) return next();
        res.setHeader("Content-Type", contentType);
        fs.createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), serveGroundsInDev()],
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
