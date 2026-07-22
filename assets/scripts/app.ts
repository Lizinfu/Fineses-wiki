import { initNavigation } from "./navigation";
import { initSearch } from "./search";
import { initThemeToggle } from "./theme";
import { initTableOfContents } from "./table-of-contents";
import { initTimeline } from "./timeline";

function boot(): void {
  document.documentElement.classList.remove("no-js");
  document.documentElement.classList.add("js");

  initThemeToggle();
  initNavigation();
  initTableOfContents();
  initSearch();
  initTimeline();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
