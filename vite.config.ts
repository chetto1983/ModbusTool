import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// Tauri expects a fixed port and must see Rust compile errors in the terminal.
export default defineConfig({
  plugins: [svelte()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: { target: "es2022" },
  test: {
    include: ["src/**/*.test.ts"],
    coverage: { include: ["src/lib/**/*.ts"], exclude: ["src/lib/**/*.test.ts", "src/lib/api.ts"] },
  },
});
