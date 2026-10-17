import { initAtlas } from "./map";

function bootAtlas(): void {
  initAtlas();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootAtlas, { once: true });
} else {
  bootAtlas();
}
