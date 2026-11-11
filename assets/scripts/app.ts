import { initNavigation } from "./navigation";
import { initMarginalNotes } from "./marginal-notes";
import { initSearch } from "./search";
import { initThemeToggle } from "./theme";
import { initTableOfContents } from "./table-of-contents";
import { initLibraryComments } from "./library-comments";
import { initLibraryAnnouncement } from "./library-announcement";
import { initMotion } from "./motion";
import { initRecommendations } from "./recommendations";
import { initEntryPreviews } from "./entry-preview";

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
  initMotion();
  initRecommendations();
  initEntryPreviews();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
