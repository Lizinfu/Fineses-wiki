import { initSignalField } from "./signal-field";

function bootSignal(): void {
  initSignalField();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootSignal, { once: true });
} else {
  bootSignal();
}
