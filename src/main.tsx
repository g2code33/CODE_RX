import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// PWA: register the service worker in production builds only.
//
// `updateViaCache: 'none'` makes the browser re-check /sw.js itself on every
// load instead of trusting an HTTP-cached copy — an old worker is exactly what
// keeps a shipped fix invisible. When a new worker takes over (`controllerchange`)
// the page reloads ONCE, so the visitor lands on the build that was just
// deployed rather than the one they happened to be holding.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  let reloadedForNewWorker = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloadedForNewWorker) return;
    reloadedForNewWorker = true;
    window.location.reload();
  });
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then((registration) => {
      // A worker installed while this tab was already open must activate now.
      registration.update().catch(() => undefined);
      if (registration.waiting) registration.waiting.postMessage({ type: "skip-waiting" });
    }).catch((err) => {
      console.warn("[code-rx] Service worker registration failed:", err);
    });
  });
}
