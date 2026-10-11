import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

// ErrorBoundary reloads once when a deploy has replaced the route chunks this
// tab was built against. Clearing the flag after a healthy start lets the next
// deploy do the same, without allowing a reload loop on a genuinely broken one.
window.addEventListener('load', () => {
  setTimeout(() => {
    try {
      sessionStorage.removeItem('yam.chunk-reload')
    } catch {
      // Storage unavailable; nothing was stored either.
    }
  }, 10_000)
})

// Offline mode (migration 038): the service worker keeps the app itself so it
// opens without signal; data and pending writes are kept by the app. Only in
// a production build, where asset names are content hashes.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.error('Service worker not registered', err))
  })
}
