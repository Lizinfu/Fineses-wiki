import { initNavigation } from "./navigation";
import { initSearch } from "./search";
import { initThemeToggle } from "./theme";
import { initTableOfContents } from "./table-of-contents";

function boot(): void {
  document.documentElement.classList.remove("no-js");
  document.documentElement.classList.add("js");

  initThemeToggle();
  initNavigation();
  initTableOfContents();
  initSearch();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
