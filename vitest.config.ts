import { defineConfig } from "vitest/config";

// Node environment on purpose: these tests cover pure string and URL logic in
// src/utils. Nothing here needs a DOM, and jsdom would be a second dev
// dependency with nothing to exercise.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
