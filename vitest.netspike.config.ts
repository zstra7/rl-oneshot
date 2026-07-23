import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";

/**
 * Netcode spike config (plan/ONLINE_MULTIPLAYER_PLAN.md): identical to
 * vitest.config.ts except the physics engine is aliased to the
 * cross-platform-deterministic Rapier build (same 0.19.3 version, same
 * API — the vendor's drop-in variant that trades some optimisation for
 * a bit-identical simulation on every machine/OS/browser). Running the
 * netspike determinism spec under this config proves the swap is truly
 * drop-in and pins the cross-machine golden hash.
 *
 *   npx vitest run tests/unit/netspikeDeterminism.spec.ts --config vitest.netspike.config.ts
 */
export default defineConfig({
  plugins: [vue()],

  resolve: {
    alias: {
      "@dimforge/rapier3d-compat": "@dimforge/rapier3d-deterministic-compat",
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
    include: ["tests/unit/**/*.spec.ts"],
    env: {
      NETSPIKE_DETERMINISTIC_BUILD: "1"
    }
  }
});
