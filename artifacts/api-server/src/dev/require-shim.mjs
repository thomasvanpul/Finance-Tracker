// lib/market.ts still calls require() for yahoo-finance2. The production
// bundle is built by tsup, which shims require for it; a raw tsx run has no
// such shim and dies with "require is not defined in ES module scope". This
// preload puts one back so dev harnesses under src/dev can import the real
// server modules. Node flag: --import ./src/dev/require-shim.mjs
import { createRequire } from "node:module";
globalThis.require = createRequire(import.meta.url);
