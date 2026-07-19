import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
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
    runtimeErrorOverlay(),
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
              proxy.on("proxyReq", (proxyReq) => {
                proxyReq.setHeader("origin", "https://financetracker.work");
                proxyReq.setHeader("referer", "https://financetracker.work/");
              });
              proxy.on("proxyRes", (proxyRes) => {
                const cookies = proxyRes.headers["set-cookie"];
                if (cookies) {
                  proxyRes.headers["set-cookie"] = (Array.isArray(cookies) ? cookies : [cookies]).map(
                    (c) => c
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
