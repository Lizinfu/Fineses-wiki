export function initTableOfContents(): void {
  const toc = document.querySelector<HTMLElement>("[data-page-toc]");
  if (!toc) return;

  const links = Array.from(
    toc.querySelectorAll<HTMLAnchorElement>("a[href^='#']"),
  );
  if (links.length === 0) return;

  const entries = links
    .map((link) => {
      const rawId = link.hash.slice(1);
      const id = decodeURIComponent(rawId);
      const heading = document.getElementById(id);

      return heading ? { link, heading } : null;
    })
    .filter(
      (
        entry,
      ): entry is {
        link: HTMLAnchorElement;
        heading: HTMLElement;
      } => entry !== null,
    );

  if (entries.length === 0) return;

  const setCurrent = (activeLink: HTMLAnchorElement): void => {
    entries.forEach(({ link }) => {
      if (link === activeLink) {
        link.setAttribute("aria-current", "location");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  };

  if (!("IntersectionObserver" in window)) {
    setCurrent(entries[0].link);
    return;
  }

  const visible = new Map<Element, IntersectionObserverEntry>();

  const observer = new IntersectionObserver(
    (observerEntries) => {
      observerEntries.forEach((entry) => {
        if (entry.isIntersecting) {
          visible.set(entry.target, entry);
        } else {
          visible.delete(entry.target);
        }
      });

      const firstVisible = entries.find(({ heading }) => visible.has(heading));
      if (firstVisible) {
        setCurrent(firstVisible.link);
        return;
      }

      const passed = [...entries]
        .reverse()
        .find(({ heading }) => heading.getBoundingClientRect().top < 140);

      if (passed) setCurrent(passed.link);
    },
    {
      rootMargin: "-18% 0px -68% 0px",
      threshold: [0, 1],
    },
  );

  entries.forEach(({ heading }) => observer.observe(heading));
  setCurrent(entries[0].link);
}
