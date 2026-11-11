/** Retain only images the reader has actually reached, so opacity can fade out
 * without eagerly downloading every configured preview in a long directory.
 * CSS alone remains a working hover/focus fallback when scripts are disabled. */
export function initEntryPreviews(): void {
  const root = document.documentElement;
  if (root.dataset.entryPreviewEvents === "ready") return;
  root.dataset.entryPreviewEvents = "ready";
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  const retain = (target: EventTarget | null): void => {
    if (!(target instanceof Element)) return;
    const card = target.closest<HTMLElement>("[data-entry-preview]");
    if (card) card.dataset.entryPreviewLoaded = "true";
  };
  document.addEventListener("pointerover", (event) => {
    if (event.pointerType !== "touch" && finePointer.matches) retain(event.target);
  }, { passive: true });
  document.addEventListener("focusin", (event) => {
    const target = event.target;
    if (target instanceof Element && target.matches(":focus-visible")) retain(target);
  });
}
