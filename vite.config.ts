// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import path from "path";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import type { Plugin } from "vite";

/**
 * HeadContent.dev.js (loaded by @tanstack/react-router's "development" export condition)
 * calls useHydrated() → useSyncExternalStore(subscribe, ()=>true, ()=>false).
 * During React 19 hydrateRoot on a HostSingleton (<head>), the snapshot mismatch
 * triggers tearing-detection which resets ReactCurrentDispatcher to ContextOnlyDispatcher
 * mid-render, causing "Invalid hook call" + cascading "Hydration failed" on every page load.
 * Fix: redirect the import to the production build which omits useHydrated() entirely.
 */
const noHeadContentDev: Plugin = {
  name: "no-head-content-dev",
  enforce: "pre",
  resolveId(id, importer) {
    if (id === "./HeadContent.dev.js" || id.endsWith("/HeadContent.dev.js")) {
      // Strip Vite query params (e.g. ?v=xxx) from importer before computing dirname
      const importerPath = importer ? importer.split("?")[0] : "";
      const dir = importerPath
        ? path.dirname(importerPath)
        : path.resolve("node_modules/@tanstack/react-router/dist/esm");
      return path.join(dir, "HeadContent.js");
    }
  },
};

export default defineConfig({
  vite: {
    plugins: [noHeadContentDev],
    server: {
      host: "0.0.0.0",
      port: 5000,
      strictPort: true,
      allowedHosts: true,
      headers: {
        "Cache-Control": "no-store",
      },
    },
    preview: {
      host: "0.0.0.0",
      port: 5000,
      strictPort: true,
      allowedHosts: true,
    },
    // Pre-declare TanStack Start's internal SSR modules so Vite optimizes them
    // before serving the first request. Without this, Vite discovers them as
    // "new" deps during the first page load, re-optimizes mid-flight, and
    // invalidates the browser's already-loaded module hashes — crashing the app.
    optimizeDeps: {
      include: [
        "@tanstack/router-core",
        "@tanstack/router-core/ssr/client",
        "@tanstack/router-core/ssr/server",
        "@tanstack/history",
        "seroval",
        "h3-v2",
      ],
    },
  },
});
