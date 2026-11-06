import { paraglideVitePlugin } from "@inlang/paraglide-js";
import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// Tauri expects a fixed port and must see Rust compile errors in the terminal.
export default defineConfig({
  plugins: [
    paraglideVitePlugin({
      project: "./project.inlang",
      outdir: "./src/paraglide",
      emitTsDeclarations: true,
      // Not the plugin's default "virtual-modules": on Windows its virtual messages import
      // runtime.js by a backslash path (path.resolve in virtual-messages.js resolveId) while the
      // app imports it by Vite's forward-slash path, so the bundle held two runtimes and the
      // language never changed (Windows build, 2026-11-06). Physical modules resolve one runtime.
      outputStructure: "message-modules",
    }),
    svelte(),
  ],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: { target: "es2022" },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "happy-dom",
    coverage: {
      include: ["src/lib/**/*.ts"],
      exclude: ["src/lib/**/*.test.ts"],
      // CLAUDE.md coverage floor.
      thresholds: { lines: 85, statements: 85, functions: 85, branches: 85 },
    },
  },
});
