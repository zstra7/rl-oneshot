import { createApp } from "vue";
import { createPinia } from "pinia";

import App from "@/App.vue";
import { disposeGameRuntime } from "@/core/GameRuntimeFactory";

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);

app.config.errorHandler = (error, _instance, info) => {
  // eslint-disable-next-line no-console
  console.error("[vue-error]", info, error);
};

app.mount("#app");

if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose(() => {
    disposeGameRuntime();
  });
}
