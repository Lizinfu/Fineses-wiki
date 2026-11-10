const STORAGE_KEY = "world-library-motion";
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

type Particle = {
  x: number;
  y: number;
  drift: number;
  size: number;
  accent: boolean;
};

type Exclusion = { left: number; top: number; right: number; bottom: number };
type ArchiveSignal = Particle & { targetX: number; targetY: number; start: number };

function readPreference(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

/** One small Canvas 2D layer, confined to the page's introductory header. */
class ArchiveParticles {
  private readonly canvas = document.createElement("canvas");
  private readonly context: CanvasRenderingContext2D | null;
  private readonly intersection?: IntersectionObserver;
  private readonly resize?: ResizeObserver;
  private particles: Particle[] = [];
  private signals: ArchiveSignal[] = [];
  private exclusions: Exclusion[] = [];
  private frame = 0;
  private previousTime = 0;
  private enabled = false;
  private visible = true;
  private width = 0;
  private height = 0;
  private accent = "#e6ad28";
  private ink = "#6d7d72";

  constructor(private readonly host: HTMLElement) {
    host.classList.add("archive-particle-host");
    this.canvas.className = "archive-particles";
    this.canvas.setAttribute("aria-hidden", "true");
    this.canvas.hidden = true;
    host.append(this.canvas);
    this.context = this.canvas.getContext("2d");

    if ("IntersectionObserver" in window) {
      this.intersection = new IntersectionObserver(([entry]) => {
        this.visible = entry.isIntersecting;
        this.sync();
      });
      this.intersection.observe(this.canvas);
    }

    if ("ResizeObserver" in window) {
      this.resize = new ResizeObserver(() => this.measure());
      this.resize.observe(host);
    }

    document.fonts?.ready.then(() => this.measure());
    this.measure();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled && this.context !== null;
    this.canvas.hidden = !this.enabled;
    this.sync();
  }

  refresh(): void {
    this.measure();
    this.sync();
  }

  pulse(): void {
    if (!this.enabled) return;
    const start = performance.now();
    this.signals = Array.from({ length: this.width < 480 ? 7 : 14 }, (_, index) => ({
      x: this.width * (0.6 + Math.random() * 0.34),
      y: this.height * (0.5 + Math.random() * 0.4),
      targetX: this.width * (0.76 + Math.random() * 0.18),
      targetY: 16 + Math.random() * 25,
      start,
      drift: 0,
      size: 1.3 + Math.random(),
      accent: index % 3 === 0,
    }));
  }

  pause(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.previousTime = 0;
  }

  private sync(): void {
    if (!this.enabled || !this.visible || document.hidden) {
      this.pause();
      return;
    }
    if (!this.frame) this.frame = requestAnimationFrame(this.draw);
  }

  private measure(): void {
    this.width = this.host.clientWidth;
    this.height = Math.min(this.host.clientHeight, 220);
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    this.canvas.width = Math.max(1, Math.round(this.width * ratio));
    this.canvas.height = Math.max(1, Math.round(this.height * ratio));
    this.context?.setTransform(ratio, 0, 0, ratio, 0, 0);
    const style = getComputedStyle(document.documentElement);
    this.accent = style.getPropertyValue("--accent").trim() || this.accent;
    this.ink = style.getPropertyValue("--text-muted").trim() || this.ink;

    const count = this.width < 480 ? 10 : 26;
    this.particles = Array.from({ length: count }, (_, index) => ({
      x: this.width * (0.5 + Math.random() * 0.48),
      y: 10 + Math.random() * Math.max(0, this.height - 20),
      drift: 1 + Math.random() * 2,
      size: 1 + Math.random(),
      accent: index % 7 === 0,
    }));

    // Measure text once per resize, rather than doing layout work in each frame.
    const bounds = this.host.getBoundingClientRect();
    const walker = document.createTreeWalker(this.host, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    this.exclusions = [];
    let text: Node | null;
    while ((text = walker.nextNode())) {
      if (!text.textContent?.trim()) continue;
      range.selectNodeContents(text);
      for (const rect of range.getClientRects()) {
        if (!rect.width || !rect.height) continue;
        this.exclusions.push({
          left: rect.left - bounds.left - 8,
          top: rect.top - bounds.top - 6,
          right: rect.right - bounds.left + 8,
          bottom: rect.bottom - bounds.top + 6,
        });
      }
    }
    for (const control of this.host.querySelectorAll("input, button, select, textarea")) {
      const rect = control.getBoundingClientRect();
      this.exclusions.push({
        left: rect.left - bounds.left - 5,
        top: rect.top - bounds.top - 5,
        right: rect.right - bounds.left + 5,
        bottom: rect.bottom - bounds.top + 5,
      });
    }
  }

  private readonly draw = (time: number): void => {
    this.frame = 0;
    if (!this.enabled || !this.visible || document.hidden || !this.context) return;

    // Thirty draws per second is sufficient for this slow, decorative drift.
    if (this.previousTime && time - this.previousTime < 32) {
      this.frame = requestAnimationFrame(this.draw);
      return;
    }
    const delta = this.previousTime
      ? Math.min((time - this.previousTime) / 1000, 0.08)
      : 0.032;
    this.previousTime = time;
    this.context.clearRect(0, 0, this.width, this.height);
    for (const particle of this.particles) {
      particle.y -= particle.drift * delta;
      if (particle.y < 8) particle.y = this.height - 8;
      if (this.exclusions.some((rect) =>
        particle.x >= rect.left && particle.x <= rect.right &&
        particle.y >= rect.top && particle.y <= rect.bottom)) continue;

      this.context.globalAlpha = particle.accent ? 0.4 : 0.19;
      this.context.fillStyle = particle.accent ? this.accent : this.ink;
      this.context.fillRect(particle.x, particle.y, particle.size, particle.size);
      if (particle.accent) {
        this.context.globalAlpha = 0.12;
        this.context.fillRect(particle.x + 5, particle.y, 6, 1);
      }
    }
    this.context.globalAlpha = 1;
    this.signals = this.signals.filter((signal) => time - signal.start < 500);
    for (const signal of this.signals) {
      const progress = Math.max(0, Math.min(1, (time - signal.start) / 500));
      const eased = 1 - Math.pow(1 - progress, 3);
      const x = signal.x + (signal.targetX - signal.x) * eased;
      const y = signal.y + (signal.targetY - signal.y) * eased;
      if (this.exclusions.some((rect) => x >= rect.left && x <= rect.right &&
          y >= rect.top && y <= rect.bottom)) continue;
      this.context.globalAlpha = Math.sin(progress * Math.PI) * 0.55;
      this.context.fillStyle = signal.accent ? this.accent : this.ink;
      this.context.fillRect(x, y, signal.size, signal.size);
    }
    this.context.globalAlpha = 1;
    this.frame = requestAnimationFrame(this.draw);
  };
}

export function initMotion(): void {
  const root = document.documentElement;
  if (root.hasAttribute("data-motion-ready")) return;
  const reduced = window.matchMedia(REDUCED_MOTION);
  const controls = document.querySelectorAll<HTMLButtonElement>("[data-motion-toggle]");
  const atlas = Boolean(document.querySelector(".atlas-page"));
  const header = atlas ? null : document.querySelector<HTMLElement>(".home-hero, .entity-header");
  const particles = header ? new ArchiveParticles(header) : null;
  const detailAnimations = new Set<Animation>();
  let enabled = readPreference();
  let entryTimeout = 0;

  const active = (): boolean => enabled && !reduced.matches;
  const finishEntry = (): void => {
    clearTimeout(entryTimeout);
    delete root.dataset.motionEntering;
  };
  const sync = (): void => {
    root.dataset.motion = reduced.matches ? "reduced" : enabled ? "on" : "off";
    for (const button of controls) {
      button.hidden = false;
      button.disabled = reduced.matches;
      button.setAttribute("aria-pressed", String(active()));
      button.setAttribute("aria-label", reduced.matches
        ? "系统已启用减少动态效果"
        : active() ? "关闭动态效果" : "开启动态效果");
      const label = button.querySelector("[data-motion-label]") ?? button;
      label.textContent = reduced.matches ? "动效减少" : active() ? "动效开启" : "动效关闭";
    }
    if (!active()) {
      finishEntry();
      for (const animation of detailAnimations) animation.cancel();
      detailAnimations.clear();
    }
    particles?.setEnabled(active());
  };

  root.dataset.motionReady = "true";
  sync();
  // The parser-blocking head helper marks a native incoming transition early.
  // In all other browsers, animate only the new page; links remain native.
  const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  if (active() && !atlas && navigation?.type !== "back_forward" &&
      root.dataset.motionTransition !== "active") {
    root.dataset.motionEntering = "true";
    entryTimeout = window.setTimeout(finishEntry, 380);
  }
  if (active() && navigation?.type !== "back_forward") particles?.pulse();

  for (const button of controls) {
    button.addEventListener("click", () => {
      enabled = !enabled;
      try {
        window.localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
      } catch {
        // The selected preference still applies for this document.
      }
      sync();
    });
  }

  document.addEventListener("toggle", (event) => {
    const details = event.target;
    if (!(details instanceof HTMLDetailsElement) || !details.open || !active()) return;
    for (const content of Array.from(details.children)) {
      if (!(content instanceof HTMLElement) || content.tagName === "SUMMARY" || !content.animate) continue;
      const animation = content.animate([
        { opacity: 0.4, transform: "translateY(-3px)" },
        { opacity: 1, transform: "translateY(0)" },
      ], { duration: 160, easing: "ease-out" });
      detailAnimations.add(animation);
      animation.onfinish = animation.oncancel = () => detailAnimations.delete(animation);
    }
  }, true);

  reduced.addEventListener("change", sync);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) particles?.pause();
    else particles?.refresh();
  });
  window.addEventListener("pagehide", () => {
    finishEntry();
    particles?.pause();
    for (const animation of detailAnimations) animation.cancel();
    detailAnimations.clear();
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) finishEntry();
    enabled = readPreference();
    sync();
    particles?.refresh();
  });
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY || event.key === null) {
      enabled = readPreference();
      sync();
    }
  });
  const themeObserver = new MutationObserver(() => particles?.refresh());
  themeObserver.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
}
