import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";

export default defineConfig(({ mode }) => {
  const isTestBuild =
    mode === "test" ||
    process.env.PLAYWRIGHT_TEST === "1";

  return {
    plugins: [
      vue()
    ],

    resolve: {
      alias: {
        "@": fileURLToPath(
          new URL("./src", import.meta.url)
        )
      }
    },

    define: {
      __DEV__: JSON.stringify(mode !== "production"),
      __TEST_BUILD__: JSON.stringify(isTestBuild),
      __PHYSICS_CONTRACT__: JSON.stringify("2.1"),
      __APP_VERSION__: JSON.stringify(
        process.env.npm_package_version
      )
    },

    assetsInclude: [
      "**/*.glb",
      "**/*.gltf",
      "**/*.wasm"
    ],

    build: {
      target: "es2022",
      sourcemap: true,

      rollupOptions: {
        output: {
          manualChunks(id: string): string | undefined {
            if (id.includes("node_modules/vue") || id.includes("node_modules/pinia")) {
              return "vue";
            }
            if (id.includes("node_modules/three")) {
              return "three";
            }
            if (id.includes("node_modules/@dimforge/rapier3d-compat")) {
              return "rapier";
            }
            return undefined;
          }
        }
      }
    },

    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true
    },

    preview: {
      host: "127.0.0.1",
      port: 4173,
      strictPort: true
    }
  };
});
