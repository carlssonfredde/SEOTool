import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  test: { include: ["scripts/scheduled-monitoring.integration.test.ts"], environment: "node" },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
