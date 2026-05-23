import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

// TextAlive primes its <audio> element on load (play/pause/fetch) without catching
// the internal promises, so browsers surface benign, harmless rejections:
//   - AbortError: a media fetch was canceled, or a pause interrupted a pending play
//   - NotAllowedError: autoplay blocked before a user gesture (e.g. Firefox)
// Real playback works once the user clicks, so swallow just these two.
window.addEventListener("unhandledrejection", (event) => {
  const name = (event.reason as { name?: string } | undefined)?.name;
  if (name === "AbortError" || name === "NotAllowedError") event.preventDefault();
});

const container = document.getElementById("root");
if (!container) throw new Error("#root element not found");

createRoot(container).render(<App />);
