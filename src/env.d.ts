/// <reference types="vite/client" />

declare const __DEV__: boolean;
declare const __TEST_BUILD__: boolean;
declare const __PHYSICS_CONTRACT__: string;
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_APP_TITLE?: string;
  readonly VITE_DEFAULT_AI_DIFFICULTY?:
    "easy" | "medium" | "hard";
  readonly VITE_DEFAULT_MATCH_MINUTES?:
    "1" | "3" | "10";
  readonly VITE_ENABLE_DEBUG_UI?:
    "0" | "1";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
