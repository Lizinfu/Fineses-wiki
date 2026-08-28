import { initNavigation } from "./navigation";
import { initMarginalNotes } from "./marginal-notes";
import { initSearch } from "./search";
import { initThemeToggle } from "./theme";
import { initTableOfContents } from "./table-of-contents";
import { initLibraryComments } from "./library-comments";
import { initLibraryAnnouncement } from "./library-announcement";

function boot(): void {
  document.documentElement.classList.remove("no-js");
  document.documentElement.classList.add("js");

  initThemeToggle();
  initNavigation();
  initMarginalNotes();
  initTableOfContents();
  initSearch();
  initLibraryComments();
  initLibraryAnnouncement();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
