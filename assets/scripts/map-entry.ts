import { initAtlas } from "./atlas/app";

function bootAtlas(): void {
  void initAtlas();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootAtlas, { once: true });
} else {
  bootAtlas();
}
