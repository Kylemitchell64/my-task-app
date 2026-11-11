import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { toasts } from "./app/services.js";
import App from "./components/App.jsx";
import "./styles/app.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// The service worker caches the app itself, so it opens instantly and works offline.
// A new version downloads in the background. It is never swapped in underneath someone
// mid-task: they are offered a reload, and otherwise get it the next time they open the app.
if (import.meta.env.PROD) {
  const update = registerSW({
    immediate: true,
    onNeedRefresh() {
      toasts.show("A new version is ready.", {
        duration: 60_000,
        action: { label: "Reload", run: () => update(true) },
      });
    },
  });
}
