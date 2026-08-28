const STORAGE_PREFIX = "world-library-notice:";

export function initLibraryAnnouncement(): void {
  const dialog = document.querySelector<HTMLDialogElement>(
    "dialog#library-announcement",
  );
  if (!dialog) return;

  const id = dialog.dataset.announcementId ?? "default";
  const storageKey = `${STORAGE_PREFIX}${id}`;
  const supportsModal = typeof dialog.showModal === "function";

  const isDismissed = (): boolean => {
    try {
      return window.localStorage.getItem(storageKey) === "1";
    } catch {
      return false;
    }
  };

  const remember = (): void => {
    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {
      // Storage unavailable; the notice still closes for this visit.
    }
  };

  const close = (): void => {
    if (supportsModal) {
      if (dialog.open) dialog.close();
    } else {
      dialog.removeAttribute("open");
    }
    remember();
  };

  if (isDismissed()) return;

  if (supportsModal) {
    dialog.showModal();
  } else {
    dialog.setAttribute("open", "");
  }

  dialog
    .querySelectorAll<HTMLElement>("[data-announcement-close]")
    .forEach((button) => button.addEventListener("click", close));

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) close();
  });

  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
}