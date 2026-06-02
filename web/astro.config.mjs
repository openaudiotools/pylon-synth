import { defineConfig } from "astro/config";

// Phase-1 Astro wrap of the (formerly buildless) pylon-synth control surface.
// - `output: "static"` — no SSR adapter; Cloudflare Pages serves dist/ as static.
// - `three` is now bundled by Vite from node_modules (pinned to 0.160.0); the old
//   CDN import map is gone.
// - SuperSonic is imported from a fully-qualified https://unpkg.com URL inside
//   pylon-synth.js and self-loads its WASM/core from there at runtime, so it must
//   stay an external (non-bundled) import. Rollup leaves absolute-URL imports
//   external by default; `optimizeDeps.exclude` keeps the dev pre-bundler off it.
export default defineConfig({
  output: "static",
  site: "https://pylonsynth.xyz",
  vite: {
    optimizeDeps: {
      exclude: ["supersonic-scsynth"],
    },
  },
});
