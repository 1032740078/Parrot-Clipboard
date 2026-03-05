import { fileURLToPath, URL } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@tauri-apps/api/core": fileURLToPath(
        new URL("./src/__mocks__/@tauri-apps/api/core.ts", import.meta.url)
      ),
      "@tauri-apps/api/event": fileURLToPath(
        new URL("./src/__mocks__/@tauri-apps/api/event.ts", import.meta.url)
      ),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/__tests__/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      thresholds: {
        lines: 75,
        branches: 75,
        functions: 75,
        statements: 75,
      },
    },
  },
});
