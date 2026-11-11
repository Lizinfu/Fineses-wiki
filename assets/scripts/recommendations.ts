const ROTATION_DELAY = 7000;
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/** Native scrolling and ordinary links remain usable without this enhancement. */
class Recommendations {
  private readonly root = document.documentElement;
  private readonly reduced = window.matchMedia(REDUCED_MOTION);
  private readonly track: HTMLElement;
  private readonly slides: HTMLElement[];
  private readonly previous: HTMLButtonElement | null;
  private readonly next: HTMLButtonElement | null;
  private readonly toggle: HTMLButtonElement | null;
  private readonly indicators: HTMLButtonElement[];
  private readonly interval: number;
  private readonly cleanup: (() => void)[] = [];
  private index = 0;
  private rotationRequested = true;
  private hovered = false;
  private visible = false;
  private pageActive = true;
  private scrolling = false;
  private programmatic = false;
  private scrollDestination: number | null = null;
  private toggleIntent: boolean | null = null;
  private timer = 0;
  private settleTimer = 0;
  private width = 0;
  private disposed = false;

  constructor(private readonly host: HTMLElement) {
    const track = host.querySelector<HTMLElement>("[data-recommendations-track]");
    if (!track) throw new Error("Recommendation track is missing");
    this.track = track;
    const configuredInterval = Number(host.dataset.recommendationInterval);
    this.interval = Number.isFinite(configuredInterval) && configuredInterval > 0
      ? Math.max(3000, Math.min(60000, configuredInterval)) : ROTATION_DELAY;
    this.slides = Array.from(track.querySelectorAll<HTMLElement>("[data-recommendation]"));
    this.previous = host.querySelector<HTMLButtonElement>("[data-recommendation-prev]");
    this.next = host.querySelector<HTMLButtonElement>("[data-recommendation-next]");
    this.toggle = host.querySelector<HTMLButtonElement>("[data-recommendation-toggle]");
    this.indicators = Array.from(host.querySelectorAll<HTMLButtonElement>("[data-recommendation-goto]"));
    const controls = host.querySelector<HTMLElement>("[data-recommendations-controls]");
    if (controls) controls.hidden = this.slides.length < 2;
    if (this.slides.length < 2) {
      this.host.dataset.recommendationsState = "static";
      this.track.tabIndex = -1;
      return;
    }
    this.width = track.clientWidth;
    this.updateIndex(this.closestSlide());
    this.listen(this.previous, "click", () => this.go(this.index - 1, true));
    this.listen(this.next, "click", () => this.go(this.index + 1, true));
    this.listen(this.toggle, "pointerdown", () => {
      // Preserve the action shown before focusin pauses rotation. Otherwise a
      // pointer click on a visible Pause button would immediately play again.
      this.toggleIntent = !this.rotationRequested;
    });
    this.listen(this.toggle, "click", (event) => {
      if (!this.motionAllowed()) return;
      this.rotationRequested = (event as MouseEvent).detail > 0 && this.toggleIntent !== null
        ? this.toggleIntent : !this.rotationRequested;
      this.toggleIntent = null;
      this.sync();
    });
    for (const indicator of this.indicators) {
      this.listen(indicator, "click", () => {
        const index = Number(indicator.dataset.recommendationGoto);
        if (Number.isInteger(index) && index >= 0 && index < this.slides.length) this.go(index, true);
      });
    }
    this.listen(host, "pointerenter", (event) => {
      if ((event as PointerEvent).pointerType === "touch") return;
      this.hovered = true;
      this.sync();
    });
    this.listen(host, "pointerleave", () => {
      this.hovered = false;
      this.sync();
    });
    // Keyboard users control when rotation resumes. Moving focus away does not
    // unexpectedly restart a carousel they have started reading or operating.
    this.listen(host, "focusin", () => this.stopByUser());
    this.listen(track, "pointerdown", () => this.stopByUser(), { passive: true });
    this.listen(track, "wheel", () => this.stopByUser(), { passive: true });
    this.listen(track, "keydown", (event) => {
      const key = event as KeyboardEvent;
      if (key.altKey || key.ctrlKey || key.metaKey || key.shiftKey) return;
      const target = key.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable='true']")) return;
      const destination = key.key === "ArrowRight" ? this.index + 1
        : key.key === "ArrowLeft" ? this.index - 1
        : key.key === "Home" ? 0
        : key.key === "End" ? this.slides.length - 1
        : null;
      if (destination === null) return;
      key.preventDefault();
      this.go(destination, true);
    });
    this.listen(track, "scroll", () => {
      if (!this.programmatic) this.rotationRequested = false;
      this.scrolling = true;
      this.updateIndex(this.closestSlide());
      this.deferSettle();
      this.sync();
    }, { passive: true });
    this.listen(track, "scrollend", () => this.finishScroll());
    this.listen(document, "visibilitychange", () => this.sync());
    this.listen(this.reduced, "change", () => this.sync());
    this.listen(window, "pagehide", (event) => {
      this.pageActive = false;
      this.clearRotation();
      window.clearTimeout(this.settleTimer);
      if (!(event as PageTransitionEvent).persisted) this.dispose();
    });
    this.listen(window, "pageshow", () => {
      this.pageActive = true;
      this.scrolling = false;
      this.programmatic = false;
      this.scrollDestination = null;
      this.updateIndex(this.closestSlide());
      this.sync();
    });
    const motionObserver = new MutationObserver(() => this.sync());
    motionObserver.observe(this.root, { attributes: true, attributeFilter: ["data-motion"] });
    this.cleanup.push(() => motionObserver.disconnect());
    if ("IntersectionObserver" in window) {
      const intersection = new IntersectionObserver(([entry]) => {
        this.visible = entry.isIntersecting && entry.intersectionRatio >= 0.2;
        this.sync();
      }, { threshold: [0, 0.2] });
      intersection.observe(host);
      this.cleanup.push(() => intersection.disconnect());
    } else {
      this.visible = true;
    }
    const resize = (): void => {
      const width = track.clientWidth;
      if (width <= 0 || Math.abs(width - this.width) <= 1) return;
      this.width = width;
      this.go(this.index, false, true);
    };
    if ("ResizeObserver" in window) {
      const observer = new ResizeObserver(resize);
      observer.observe(track);
      this.cleanup.push(() => observer.disconnect());
    } else {
      this.listen(window, "resize", resize, { passive: true });
    }
    this.sync();
  }

  private listen(target: EventTarget | null, type: string, callback: EventListener, options?: AddEventListenerOptions): void {
    if (!target) return;
    target.addEventListener(type, callback, options);
    this.cleanup.push(() => target.removeEventListener(type, callback, options));
  }

  private motionAllowed(): boolean {
    return !this.reduced.matches && this.root.dataset.motion !== "off" && this.root.dataset.motion !== "reduced";
  }

  private stopByUser(): void {
    this.rotationRequested = false;
    this.programmatic = false;
    this.scrollDestination = null;
    this.sync();
  }

  private clearRotation(): void {
    window.clearTimeout(this.timer);
    this.timer = 0;
  }

  private sync(): void {
    if (this.disposed) return;
    const allowed = this.motionAllowed();
    const canRotate = allowed && this.rotationRequested && !this.hovered && this.visible
      && !document.hidden && this.pageActive && !this.scrolling;
    this.host.dataset.recommendationsState = canRotate ? "playing" : "paused";
    if (this.toggle) {
      this.toggle.disabled = !allowed;
      this.toggle.setAttribute("aria-pressed", String(allowed && this.rotationRequested));
      this.toggle.setAttribute("aria-label", !allowed ? "自动轮播已关闭" : this.rotationRequested ? "暂停自动轮播" : "播放推荐阅读");
      const label = this.toggle.querySelector<HTMLElement>("[data-recommendation-play-label]") ?? this.toggle;
      label.textContent = !allowed ? "静态浏览" : this.rotationRequested ? "暂停" : "播放";
    }
    if (!canRotate) {
      this.clearRotation();
    } else if (!this.timer) {
      this.timer = window.setTimeout(() => {
        this.timer = 0;
        this.go(this.index + 1, false);
      }, this.interval);
    }
  }

  private closestSlide(): number {
    if (!this.slides.length) return 0;
    const max = this.track.scrollWidth - this.track.clientWidth;
    if (max > 1 && this.track.scrollLeft >= max - 2) return this.slides.length - 1;
    const left = this.track.getBoundingClientRect().left + this.track.clientLeft;
    let best = 0;
    let distance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < this.slides.length; index++) {
      const delta = Math.abs(this.slides[index].getBoundingClientRect().left - left);
      if (delta < distance) {
        best = index;
        distance = delta;
      }
    }
    return best;
  }

  private updateIndex(index: number): void {
    this.index = index;
    this.host.dataset.recommendationsIndex = String(index);
    this.slides.forEach((slide, slideIndex) => {
      slide.toggleAttribute("data-active", slideIndex === index);
    });
    for (const indicator of this.indicators) {
      if (Number(indicator.dataset.recommendationGoto) === index) indicator.setAttribute("aria-current", "true");
      else indicator.removeAttribute("aria-current");
    }
    const position = this.host.querySelector<HTMLElement>("[data-recommendation-position]");
    if (position) position.textContent = `${String(index + 1).padStart(2, "0")} / ${String(this.slides.length).padStart(2, "0")}`;
  }

  private go(index: number, manual: boolean, instant = false): void {
    if (this.disposed || !this.slides.length) return;
    if (manual) this.rotationRequested = false;
    this.clearRotation();
    const destination = (index + this.slides.length) % this.slides.length;
    const slide = this.slides[destination];
    const left = this.track.scrollLeft + slide.getBoundingClientRect().left
      - this.track.getBoundingClientRect().left - this.track.clientLeft;
    this.programmatic = true;
    this.scrolling = true;
    this.scrollDestination = Math.max(0, Math.min(this.track.scrollWidth - this.track.clientWidth, left));
    this.track.scrollTo({ left: this.scrollDestination, behavior: instant || !this.motionAllowed() ? "instant" : "smooth" });
    this.updateIndex(destination);
    if (manual) {
      const status = this.host.querySelector<HTMLElement>("[data-recommendation-status]");
      const title = slide.querySelector<HTMLElement>(".recommendations__title")?.textContent?.trim();
      if (status) status.textContent = `推荐阅读 ${destination + 1} / ${this.slides.length}${title ? `：${title}` : ""}`;
    }
    // Also settle when scrolling to the already-selected slide produces no event.
    this.deferSettle();
    this.sync();
  }

  private deferSettle(): void {
    window.clearTimeout(this.settleTimer);
    this.settleTimer = window.setTimeout(() => this.finishScroll(), 180);
  }

  private finishScroll(): void {
    if (this.programmatic && this.scrollDestination !== null
      && Math.abs(this.track.scrollLeft - this.scrollDestination) > 2) {
      // Smooth scrolling follows the browser's rendering clock. A delayed
      // frame must not turn the remainder of our own scroll into a user gesture.
      this.deferSettle();
      return;
    }
    window.clearTimeout(this.settleTimer);
    this.scrolling = false;
    this.programmatic = false;
    this.scrollDestination = null;
    this.updateIndex(this.closestSlide());
    this.sync();
  }

  private dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearRotation();
    window.clearTimeout(this.settleTimer);
    for (const cleanup of this.cleanup.splice(0)) cleanup();
  }
}

export function initRecommendations(): void {
  for (const host of document.querySelectorAll<HTMLElement>("[data-recommendations]")) {
    if (host.dataset.recommendationsReady === "true") continue;
    if (!host.querySelector("[data-recommendations-track]")) continue;
    host.dataset.recommendationsReady = "true";
    new Recommendations(host);
  }
}
