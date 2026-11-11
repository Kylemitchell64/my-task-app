import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./components/App.jsx";
import "./styles/app.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// The service worker caches the app itself, so it opens instantly and works offline.
// New versions are picked up in the background and used on the next visit.
if (import.meta.env.PROD) {
  registerSW({ immediate: true });
}
