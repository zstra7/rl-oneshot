import { defineStore } from "pinia";

import type { AppState, UiError } from "@/core/ApplicationState";

export interface ApplicationStoreState {
  appState: AppState;
  fatalError: UiError | null;
}

export const useApplicationStore = defineStore("application", {
  state: (): ApplicationStoreState => ({
    appState: "BOOT",
    fatalError: null
  }),

  actions: {
    setAppState(appState: AppState): void {
      this.appState = appState;
    },

    setFatalError(error: UiError): void {
      this.fatalError = error;
      this.appState = "FATAL_ERROR";
    }
  }
});
