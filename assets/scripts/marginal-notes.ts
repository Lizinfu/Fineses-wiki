type MarginalNote = HTMLElement & {
  dataset: DOMStringMap & { state?: "open" | "closed" };
};

const mobileQuery = window.matchMedia("(max-width: 55rem)");
const hoverQuery = window.matchMedia("(hover: hover) and (pointer: fine)");

function isOpen(note: MarginalNote): boolean {
  return note.dataset.state === "open";
}

function positionPanel(trigger: HTMLButtonElement, panel: HTMLElement): void {
  if (mobileQuery.matches) {
    panel.style.left = "";
    panel.style.top = "";
    return;
  }

  const triggerRect = trigger.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  const gutter = 12;
  const preferredLeft = triggerRect.right + gutter;
  const left = Math.min(
    Math.max(gutter, preferredLeft),
    window.innerWidth - panelRect.width - gutter,
  );
  const top = Math.min(
    Math.max(gutter, triggerRect.top - gutter),
    window.innerHeight - panelRect.height - gutter,
  );

  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
}

export function initMarginalNotes(): void {
  const notes = Array.from(
    document.querySelectorAll<MarginalNote>("[data-marginal-note]"),
  );

  for (const note of notes) {
    const trigger = note.querySelector<HTMLButtonElement>(
      "[data-marginal-note-trigger]",
    );
    const panel = note.querySelector<HTMLElement>("[data-marginal-note-panel]");
    if (!trigger || !panel) continue;

    const setOpen = (open: boolean, returnFocus = false): void => {
      note.dataset.state = open ? "open" : "closed";
      trigger.setAttribute("aria-expanded", String(open));
      if (open)
        window.requestAnimationFrame(() => positionPanel(trigger, panel));
      if (!open && returnFocus) trigger.focus();
    };

    trigger.addEventListener("click", () => setOpen(true));

    note.addEventListener("pointerenter", () => {
      if (hoverQuery.matches) setOpen(true);
    });

    note.addEventListener("pointerleave", () => {
      if (hoverQuery.matches) setOpen(false);
    });

    trigger.addEventListener("focus", () => setOpen(true));

    note.addEventListener("focusout", () => {
      window.requestAnimationFrame(() => {
        if (!note.contains(document.activeElement)) setOpen(false);
      });
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && isOpen(note)) {
        event.preventDefault();
        setOpen(false, true);
      }
    });

    document.addEventListener("pointerdown", (event) => {
      if (isOpen(note) && !note.contains(event.target as Node)) setOpen(false);
    });

    window.addEventListener("resize", () => {
      if (isOpen(note)) positionPanel(trigger, panel);
    });
  }
}
