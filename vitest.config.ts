import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` / `client-only` are RSC build guards; stub them for tests.
      "server-only": fileURLToPath(new URL("./test/empty.ts", import.meta.url)),
      "client-only": fileURLToPath(new URL("./test/empty.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    include: ["src/**/*.test.ts"],
    hookTimeout: 30000,
    testTimeout: 30000,
  },
});
