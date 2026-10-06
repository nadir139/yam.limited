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
