interface TimelineControls {
  query: HTMLInputElement;
  calendar: HTMLSelectElement;
  category: HTMLSelectElement;
  kind: HTMLSelectElement;
  status: HTMLSelectElement;
  clear: HTMLButtonElement;
  count: HTMLElement;
}

interface ActiveTimelineFilters {
  query: string;
  calendar: string;
  category: string;
  kind: string;
  status: string;
}

function required<T extends Element>(
  root: ParentNode,
  selector: string,
): T {
  const element = root.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Timeline control missing: ${selector}`);
  }

  return element;
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("zh-CN");
}

class TimelineBrowser {
  private readonly root: HTMLElement;
  private readonly controls: TimelineControls;
  private readonly entries: HTMLElement[];
  private readonly groups: HTMLElement[];

  constructor(root: HTMLElement) {
    this.root = root;
    this.controls = {
      query: required(root, "[data-timeline-query]"),
      calendar: required(root, "[data-timeline-calendar]"),
      category: required(root, "[data-timeline-category]"),
      kind: required(root, "[data-timeline-kind]"),
      status: required(root, "[data-timeline-status]"),
      clear: required(root, "[data-timeline-clear]"),
      count: required(root, "[data-timeline-count]"),
    };
    this.entries = Array.from(
      root.querySelectorAll<HTMLElement>("[data-timeline-entry]"),
    );
    this.groups = Array.from(
      root.querySelectorAll<HTMLElement>("[data-timeline-group]"),
    );
  }

  init(): void {
    this.restoreFromUrl();
    this.enableControls();
    this.bindEvents();
    this.applyFilters(false);
  }

  private enableControls(): void {
    this.controls.query.disabled = false;
    this.controls.calendar.disabled = false;
    this.controls.category.disabled = false;
    this.controls.kind.disabled = false;
    this.controls.status.disabled = false;
    this.controls.clear.disabled = false;
  }

  private bindEvents(): void {
    this.controls.query.addEventListener("input", () => {
      this.applyFilters();
    });

    for (const select of [
      this.controls.calendar,
      this.controls.category,
      this.controls.kind,
      this.controls.status,
    ]) {
      select.addEventListener("change", () => {
        this.applyFilters();
      });
    }

    this.controls.clear.addEventListener("click", () => {
      this.controls.query.value = "";
      this.controls.calendar.value = "";
      this.controls.category.value = "";
      this.controls.kind.value = "";
      this.controls.status.value = "";
      this.controls.query.focus();
      this.applyFilters();
    });
  }

  private activeFilters(): ActiveTimelineFilters {
    return {
      query: normalize(this.controls.query.value),
      calendar: this.controls.calendar.value,
      category: this.controls.category.value,
      kind: this.controls.kind.value,
      status: this.controls.status.value,
    };
  }

  private matches(
    entry: HTMLElement,
    filters: ActiveTimelineFilters,
  ): boolean {
    const searchableText = normalize(
      entry.dataset.timelineSearch ?? entry.textContent ?? "",
    );
    const categories = (
      entry.dataset.timelineCategories ?? ""
    ).split("|");

    return (
      (!filters.query || searchableText.includes(filters.query)) &&
      (!filters.calendar ||
        entry.dataset.timelineCalendar === filters.calendar) &&
      (!filters.category || categories.includes(filters.category)) &&
      (!filters.kind ||
        entry.dataset.timelineKind === filters.kind) &&
      (!filters.status ||
        entry.dataset.timelineStatus === filters.status)
    );
  }

  private applyFilters(updateUrl = true): void {
    const filters = this.activeFilters();
    let visibleCount = 0;

    for (const entry of this.entries) {
      const visible = this.matches(entry, filters);
      entry.hidden = !visible;
      if (visible) visibleCount += 1;
    }

    for (const group of this.groups) {
      const hasVisibleEntries = Array.from(
        group.querySelectorAll<HTMLElement>("[data-timeline-entry]"),
      ).some((entry) => !entry.hidden);

      group.hidden = !hasVisibleEntries;
    }

    this.controls.count.textContent =
      `${visibleCount} / ${this.entries.length} RECORDS`;

    this.root.dataset.timelineState =
      visibleCount > 0 ? "results" : "empty";

    if (updateUrl) this.syncUrl(filters);
  }

  private restoreFromUrl(): void {
    const params = new URLSearchParams(window.location.search);

    this.controls.query.value = params.get("q") ?? "";
    this.setSelectValue(
      this.controls.calendar,
      params.get("calendar") ?? "",
    );
    this.setSelectValue(
      this.controls.category,
      params.get("category") ?? "",
    );
    this.setSelectValue(
      this.controls.kind,
      params.get("kind") ?? "",
    );
    this.setSelectValue(
      this.controls.status,
      params.get("status") ?? "",
    );
  }

  private setSelectValue(
    select: HTMLSelectElement,
    value: string,
  ): void {
    const exists = Array.from(select.options).some(
      (option) => option.value === value,
    );

    if (exists) select.value = value;
  }

  private syncUrl(filters: ActiveTimelineFilters): void {
    const url = new URL(window.location.href);
    const values: Record<string, string> = {
      q: filters.query,
      calendar: filters.calendar,
      category: filters.category,
      kind: filters.kind,
      status: filters.status,
    };

    for (const [key, value] of Object.entries(values)) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }

    window.history.replaceState({}, "", url);
  }
}

export function initTimeline(): void {
  const root = document.querySelector<HTMLElement>(
    "[data-timeline-root]",
  );

  if (!root) return;

  try {
    new TimelineBrowser(root).init();
  } catch (error) {
    console.error("Timeline initialization failed:", error);
    root.dataset.timelineState = "error";
  }
}
