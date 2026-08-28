const GISCUS_ORIGIN = "https://giscus.app";

type Theme = "light" | "dark";

function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function sendTheme(theme: Theme): void {
  document
    .querySelectorAll<HTMLIFrameElement>("iframe.giscus-frame")
    .forEach((frame) => {
      frame.contentWindow?.postMessage(
        { giscus: { setConfig: { theme } } },
        GISCUS_ORIGIN,
      );
    });
}

export function initLibraryComments(): void {
  const widget = document.querySelector<HTMLElement>(".library-comments");
  if (!widget) return;

  // Align the iframe as soon as giscus mounts it.
  new MutationObserver(() => sendTheme(currentTheme())).observe(widget, {
    childList: true,
    subtree: true,
  });

  // Giscus lets the parent know as it loads; keep the theme in sync.
  window.addEventListener("message", (event) => {
    if (event.origin !== GISCUS_ORIGIN) return;
    const data = event.data as { giscus?: unknown } | null;
    if (data == null || data.giscus === undefined) return;
    sendTheme(currentTheme());
  });

  // Follow the site-wide theme toggle from here on.
  new MutationObserver(() => sendTheme(currentTheme())).observe(
    document.documentElement,
    { attributes: true, attributeFilter: ["data-theme"] },
  );
}