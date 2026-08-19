import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const rawPort = process.env.PORT ?? "3000";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH ?? "/";

export default defineConfig(async ({ mode }) => {
const env = loadEnv(mode, process.cwd(), "");
const apiUrl = env.VITE_API_URL ?? "";
return {
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      devOptions: { enabled: false },
      workbox: {
        // Without this the service worker's navigation fallback serves
        // index.html for ANY navigation — including /api/auth/callback/google.
        // Google's OAuth redirect was being swallowed by the PWA and booting
        // the React app instead, which looked exactly like the page reloading.
        // curl worked because curl has no service worker.
        navigateFallbackDenylist: [/^\/api\//],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: { cacheName: "google-fonts-cache", expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
      manifest: {
        name: "Numeris",
        short_name: "Numeris",
        description: "Numeris — your personal finance OS",
        theme_color: "#0D1117",
        background_color: "#0D1117",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "/icons/icon-192.svg", sizes: "192x192", type: "image/svg+xml" },
          { src: "/icons/icon-512.svg", sizes: "512x512", type: "image/svg+xml" },
          { src: "/icons/icon-maskable-512.svg", sizes: "512x512", type: "image/svg+xml", purpose: "maskable" },
        ],
      },
    }),
...(process.env.NODE_ENV !== "production" ? [runtimeErrorOverlay()] : []),
...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  publicDir: path.resolve(import.meta.dirname, "static"),
  build: {
    outDir: path.resolve(import.meta.dirname, "public"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes("node_modules/recharts") || id.includes("node_modules/d3-")) return "charts";
          if (id.includes("node_modules/@radix-ui")) return "radix";
          if (id.includes("node_modules/react-dom")) return "react-dom";
          if (id.includes("node_modules/@tanstack")) return "query";
          if (id.includes("node_modules/better-auth")) return "auth";
          if (id.includes("node_modules/zod")) return "zod";
          if (id.includes("node_modules/lucide-react")) return "icons";
        },
      },
    },
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
    proxy: apiUrl
      ? {
          "/api": {
            target: apiUrl,
            changeOrigin: true,
            secure: true,
            configure: (proxy) => {
              // Request rewrites are for a REMOTE https API only: spoof the
              // production origin past its CORS allow-list, and restore the
              // __Secure- cookie prefix the remote host expects. Against a local
              // http API both are harmful — the spoofed origin is rejected by the
              // dev CORS check and surfaces as 403 on sign-in.
              if (apiUrl.startsWith("https://")) {
                proxy.on("proxyReq", (proxyReq) => {
                  proxyReq.setHeader("origin", "https://financetracker.work");
                  proxyReq.setHeader("referer", "https://financetracker.work/");
                  const cookie = proxyReq.getHeader("cookie");
                  if (cookie && typeof cookie === "string") {
                    proxyReq.setHeader("cookie", cookie.replace(/\bbetter-auth\./g, "__Secure-better-auth."));
                  }
                });
              }
              // Response normalisation applies to BOTH targets. better-auth marks
              // session cookies Secure + SameSite=None, which a browser on
              // http://localhost silently discards — you would sign in and appear
              // logged out immediately.
              proxy.on("proxyRes", (proxyRes) => {
                const cookies = proxyRes.headers["set-cookie"];
                if (cookies) {
                  proxyRes.headers["set-cookie"] = (Array.isArray(cookies) ? cookies : [cookies]).map(
                    (c) => c
                      .replace(/__Secure-better-auth\./g, "better-auth.")  // strip prefix so HTTP localhost stores it
                      .replace(/;\s*Secure/gi, "")
                      .replace(/;\s*SameSite=None/gi, "; SameSite=Lax")
                      .replace(/;\s*Domain=[^;]*/gi, "")
                  );
                }
              });
            },
          },
        }
      : undefined,
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
};
});
