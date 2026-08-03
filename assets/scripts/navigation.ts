const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function initNavigation(): void {
  const drawer = document.querySelector<HTMLElement>("[data-mobile-nav]");
  if (!drawer) return;

  const openButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>("[data-nav-toggle]"),
  );
  const closeButtons = Array.from(
    drawer.querySelectorAll<HTMLElement>("[data-nav-close]"),
  );
  const panel = drawer.querySelector<HTMLElement>("[data-nav-panel]");

  if (!panel || openButtons.length === 0) return;

  let lastFocused: HTMLElement | null = null;

  const isOpen = (): boolean => drawer.dataset.state === "open";

  const getFocusable = (): HTMLElement[] =>
    Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
      (element) =>
        !element.hasAttribute("disabled") &&
        element.getAttribute("aria-hidden") !== "true" &&
        element.offsetParent !== null,
    );

  const setOpen = (open: boolean): void => {
    drawer.dataset.state = open ? "open" : "closed";
    drawer.setAttribute("aria-hidden", String(!open));
    document.body.classList.toggle("nav-open", open);

    openButtons.forEach((button) => {
      button.setAttribute("aria-expanded", String(open));
      button.setAttribute(
        "aria-label",
        open ? "关闭导航菜单" : "打开导航菜单",
      );
    });

    if (open) {
      lastFocused =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;

      window.requestAnimationFrame(() => {
        const [firstFocusable] = getFocusable();
        firstFocusable?.focus();
      });
    } else {
      lastFocused?.focus();
      lastFocused = null;
    }
  };

  openButtons.forEach((button) => {
    button.addEventListener("click", () => setOpen(!isOpen()));
  });

  closeButtons.forEach((button) => {
    button.addEventListener("click", () => setOpen(false));
  });

  drawer.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((link) => {
    link.addEventListener("click", () => setOpen(false));
  });

  document.addEventListener("keydown", (event) => {
    if (!isOpen()) return;

    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }

    if (event.key !== "Tab") return;

    const focusable = getFocusable();
    if (focusable.length === 0) {
      event.preventDefault();
      panel.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  });

  const desktopQuery = window.matchMedia("(min-width: 55.001rem)");
  const closeAtDesktop = (event: MediaQueryListEvent | MediaQueryList): void => {
    if (event.matches && isOpen()) setOpen(false);
  };

  desktopQuery.addEventListener?.("change", closeAtDesktop);
  closeAtDesktop(desktopQuery);
}
