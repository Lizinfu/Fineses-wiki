type Theme = "light" | "dark";

const STORAGE_KEY = "world-library-theme";

function getStoredTheme(): Theme | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

function getPreferredTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;

  document
    .querySelectorAll<HTMLButtonElement>("[data-theme-toggle]")
    .forEach((button) => {
      const nextTheme = theme === "dark" ? "light" : "dark";
      button.setAttribute("aria-pressed", String(theme === "dark"));
      button.setAttribute(
        "aria-label",
        nextTheme === "dark" ? "切换到深色模式" : "切换到浅色模式",
      );
      button.dataset.nextTheme = nextTheme;
    });
}

export function initThemeToggle(): void {
  const initialTheme =
    (document.documentElement.dataset.theme as Theme | undefined) ??
    getStoredTheme() ??
    getPreferredTheme();

  applyTheme(initialTheme);

  document
    .querySelectorAll<HTMLButtonElement>("[data-theme-toggle]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const currentTheme =
          document.documentElement.dataset.theme === "dark" ? "dark" : "light";
        const nextTheme: Theme =
          currentTheme === "dark" ? "light" : "dark";

        applyTheme(nextTheme);

        try {
          window.localStorage.setItem(STORAGE_KEY, nextTheme);
        } catch {
          // The interface still works when storage is unavailable.
        }
      });
    });
}
