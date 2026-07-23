import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [vue()],

  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  },

  define: {
    __DEV__: JSON.stringify(false),
    __TEST_BUILD__: JSON.stringify(true),
    __PHYSICS_CONTRACT__: JSON.stringify("2.1"),
    __APP_VERSION__: JSON.stringify("0.1.0")
  },

  test: {
    environment: "node",
    include: ["tests/unit/**/*.spec.ts"]
  }
});
