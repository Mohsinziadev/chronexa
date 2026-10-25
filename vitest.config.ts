import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    typecheck: { enabled: false, include: ["tests/**/*.test-d.ts"], tsconfig: "./tsconfig.json" },
    coverage: { provider: "v8", include: ["src/**"], reporter: ["text-summary"] },
  },
});
