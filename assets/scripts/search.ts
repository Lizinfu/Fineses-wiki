type SearchState =
  | "idle"
  | "loading"
  | "results"
  | "empty"
  | "error"
  | "missing";

type FilterMap = Record<string, Record<string, number>>;
type ActiveFilters = Record<string, string>;

interface PagefindResultData {
  url: string;
  excerpt?: string;
  plain_excerpt?: string;
  meta?: Record<string, unknown>;
  sub_results?: Array<{
    title?: string;
    url: string;
    excerpt?: string;
    plain_excerpt?: string;
  }>;
}

interface PagefindResultHandle {
  id: string;
  data: () => Promise<PagefindResultData>;
}

interface PagefindSearchResponse {
  results: PagefindResultHandle[];
  unfilteredResultCount?: number;
  filters?: FilterMap;
  totalFilters?: FilterMap;
}

interface PagefindModule {
  options: (options: {
    baseUrl?: string;
    basePath?: string;
    excerptLength?: number;
    ranking?: {
      metaWeights?: Record<string, number>;
    };
  }) => Promise<void>;
  init: () => Promise<void> | void;
  filters: () => Promise<FilterMap>;
  debouncedSearch: (
    term: string | null,
    options?: { filters?: ActiveFilters },
    debounceTimeout?: number,
  ) => Promise<PagefindSearchResponse | null>;
}

class SearchIndexMissingError extends Error {
  constructor(message = "Pagefind search index was not found.") {
    super(message);
    this.name = "SearchIndexMissingError";
  }
}

const PAGE_SIZE = 10;

const ENTITY_LABELS: Record<string, string> = {
  nation: "国家／政权",
  people: "人物",
  person: "人物",
  character: "人物",
  characters: "人物",
  event: "历史事件",
  era: "历史时代",
  region: "地区",
  organization: "组织",
  concept: "概念",
  artifact: "物品",
  biome: "生态区",
  species: "物种",
  record: "文献",
  page: "普通页面",
};

function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

function humanize(value: string): string {
  if (ENTITY_LABELS[value]) return ENTITY_LABELS[value];

  return value
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);

  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;

  return element;
}

function getRequiredElement<T extends Element>(
  root: ParentNode,
  selector: string,
): T {
  const element = root.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Search interface element missing: ${selector}`);
  }

  return element;
}

class ArchiveSearch {
  private readonly root: HTMLElement;
  private readonly form: HTMLFormElement;
  private readonly input: HTMLInputElement;
  private readonly clearButton: HTMLButtonElement;
  private readonly kindSelect: HTMLSelectElement;
  private readonly sectionSelect: HTMLSelectElement;
  private readonly resetFiltersButton: HTMLButtonElement;
  private readonly filterStatus: HTMLElement;
  private readonly resultCount: HTMLElement;
  private readonly resultsList: HTMLOListElement;
  private readonly loadMoreButton: HTMLButtonElement;

  private pagefind: PagefindModule | null = null;
  private currentResults: PagefindResultHandle[] = [];
  private visibleCount = 0;
  private requestSequence = 0;
  private initialized = false;

  constructor(root: HTMLElement) {
    this.root = root;
    this.form = getRequiredElement(root, "[data-search-form]");
    this.input = getRequiredElement(root, "[data-search-input]");
    this.clearButton = getRequiredElement(root, "[data-search-clear]");
    this.kindSelect = getRequiredElement(root, "[data-filter-kind]");
    this.sectionSelect = getRequiredElement(root, "[data-filter-section]");
    this.resetFiltersButton = getRequiredElement(
      root,
      "[data-filter-reset]",
    );
    this.filterStatus = getRequiredElement(root, "[data-filter-status]");
    this.resultCount = getRequiredElement(root, "[data-search-count]");
    this.resultsList = getRequiredElement(root, "[data-search-results]");
    this.loadMoreButton = getRequiredElement(root, "[data-search-more]");
  }

  async init(): Promise<void> {
    this.bindEvents();
    this.restoreQueryFromUrl();
    this.setState("loading");
    this.setBusy(true);

    try {
      this.pagefind = await this.loadPagefind();
      const filters = await this.pagefind.filters();

      this.populateFilter(
        this.kindSelect,
        filters.entity_kind ?? {},
        "全部实体类型",
        humanize,
      );

      this.populateFilter(
        this.sectionSelect,
        filters.section ?? {},
        "全部目录",
        humanize,
      );

      this.enableControls();
      this.initialized = true;
      this.filterStatus.textContent = "READY";

      if (this.hasSearchCriteria()) {
        await this.performSearch();
      } else {
        this.setState("idle");
      }
    } catch (error) {
      this.disableFilterControls();

      if (error instanceof SearchIndexMissingError) {
        this.setState("missing");
        this.filterStatus.textContent = "NO INDEX";
      } else {
        console.error("Search initialization failed:", error);
        this.setState("error");
        this.filterStatus.textContent = "ERROR";
      }
    } finally {
      this.setBusy(false);
    }
  }

  private bindEvents(): void {
    this.form.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.performSearch();
    });

    this.input.addEventListener("input", () => {
      this.clearButton.hidden = this.input.value.length === 0;

      if (!this.initialized) return;
      void this.performSearch();
    });

    this.input.addEventListener(
      "focus",
      () => {
        if (!this.initialized) return;
        void this.performSearch(false);
      },
      { once: true },
    );

    this.kindSelect.addEventListener("change", () => {
      void this.performSearch();
    });

    this.sectionSelect.addEventListener("change", () => {
      void this.performSearch();
    });

    this.clearButton.addEventListener("click", () => {
      this.input.value = "";
      this.clearButton.hidden = true;
      this.input.focus();
      void this.performSearch();
    });

    this.resetFiltersButton.addEventListener("click", () => {
      this.kindSelect.value = "";
      this.sectionSelect.value = "";
      void this.performSearch();
    });

    this.loadMoreButton.addEventListener("click", () => {
      void this.renderNextPage();
    });

    document.addEventListener("keydown", (event) => {
      const target = event.target;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable);

      const slashShortcut = event.key === "/" && !isTyping;
      const commandShortcut =
        event.key.toLowerCase() === "k" && (event.ctrlKey || event.metaKey);

      if (!slashShortcut && !commandShortcut) return;

      event.preventDefault();
      this.input.focus();
      this.input.select();
    });
  }

  private async loadPagefind(): Promise<PagefindModule> {
    const moduleUrl = this.root.dataset.pagefindUrl;
    const basePath = this.root.dataset.pagefindBasePath;
    const baseUrl = this.root.dataset.pagefindBaseUrl;

    if (!moduleUrl) {
      throw new Error("Missing data-pagefind-url.");
    }

    let probe: Response;

    try {
      probe = await fetch(moduleUrl, {
        method: "HEAD",
        cache: "no-store",
      });
    } catch (error) {
      throw new SearchIndexMissingError(
        `Unable to request Pagefind module: ${String(error)}`,
      );
    }

    if (!probe.ok) {
      throw new SearchIndexMissingError(
        `Pagefind module returned HTTP ${probe.status}.`,
      );
    }

    let imported: unknown;

    try {
      imported = await import(moduleUrl);
    } catch (error) {
      throw new Error(`Unable to import Pagefind: ${String(error)}`);
    }

    const pagefind = imported as PagefindModule;

    if (
      typeof pagefind.options !== "function" ||
      typeof pagefind.init !== "function" ||
      typeof pagefind.filters !== "function" ||
      typeof pagefind.debouncedSearch !== "function"
    ) {
      throw new Error("Loaded Pagefind module has an unexpected API.");
    }

    await pagefind.options({
      baseUrl,
      basePath,
      excerptLength: 34,
      ranking: {
        metaWeights: {
          title: 8,
          stable_id: 12,
          catalog_no: 12,
          aliases: 6,
          description: 2.5,
          entity_kind: 1.5,
        },
      },
    });

    await Promise.resolve(pagefind.init());
    return pagefind;
  }

  private populateFilter(
    select: HTMLSelectElement,
    values: Record<string, number>,
    allLabel: string,
    labelFormatter: (value: string) => string,
  ): void {
    const selected = select.dataset.initialValue ?? select.value;
    select.replaceChildren();

    const allOption = document.createElement("option");
    allOption.value = "";
    allOption.textContent = allLabel;
    select.append(allOption);

    Object.entries(values)
      .sort(([left], [right]) =>
        labelFormatter(left).localeCompare(labelFormatter(right), "zh-CN"),
      )
      .forEach(([value, count]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = `${labelFormatter(value)} (${count})`;
        select.append(option);
      });

    if (
      selected &&
      Array.from(select.options).some((option) => option.value === selected)
    ) {
      select.value = selected;
    }

    delete select.dataset.initialValue;
  }

  private restoreQueryFromUrl(): void {
    const params = new URLSearchParams(window.location.search);
    const query = params.get("q") ?? "";
    const kind = params.get("kind") ?? "";
    const section = params.get("section") ?? "";

    this.input.value = query;
    this.clearButton.hidden = query.length === 0;
    this.kindSelect.dataset.initialValue = kind;
    this.sectionSelect.dataset.initialValue = section;
  }

  private enableControls(): void {
    this.input.disabled = false;
    this.kindSelect.disabled = false;
    this.sectionSelect.disabled = false;
    this.resetFiltersButton.disabled = false;
  }

  private disableFilterControls(): void {
    this.kindSelect.disabled = true;
    this.sectionSelect.disabled = true;
    this.resetFiltersButton.disabled = true;
  }

  private activeFilters(): ActiveFilters {
    const filters: ActiveFilters = {};

    if (this.kindSelect.value) {
      filters.entity_kind = this.kindSelect.value;
    }

    if (this.sectionSelect.value) {
      filters.section = this.sectionSelect.value;
    }

    return filters;
  }

  private hasSearchCriteria(): boolean {
    return (
      this.input.value.trim().length > 0 ||
      this.kindSelect.value.length > 0 ||
      this.sectionSelect.value.length > 0 ||
      Boolean(this.kindSelect.dataset.initialValue) ||
      Boolean(this.sectionSelect.dataset.initialValue)
    );
  }

  private async performSearch(updateUrl = true): Promise<void> {
    if (!this.pagefind) return;

    const query = this.input.value.trim();
    const filters = this.activeFilters();
    const hasFilters = Object.keys(filters).length > 0;

    if (updateUrl) this.syncUrl(query, filters);

    if (!query && !hasFilters) {
      this.requestSequence += 1;
      this.currentResults = [];
      this.visibleCount = 0;
      this.resultsList.replaceChildren();
      this.resultCount.textContent = "AWAITING QUERY";
      this.loadMoreButton.hidden = true;
      this.setState("idle");
      return;
    }

    const requestId = ++this.requestSequence;
    this.setState("loading");
    this.setBusy(true);
    this.filterStatus.textContent = "SEARCHING";

    try {
      const response = await this.pagefind.debouncedSearch(
        query || null,
        { filters },
        180,
      );

      if (response === null || requestId !== this.requestSequence) return;

      this.currentResults = response.results;
      this.visibleCount = 0;
      this.resultsList.replaceChildren();

      if (this.currentResults.length === 0) {
        this.resultCount.textContent = "0 RESULTS";
        this.loadMoreButton.hidden = true;
        this.setState("empty");
        return;
      }

      this.resultCount.textContent =
        `${this.currentResults.length} RESULTS`;

      this.setState("results");
      await this.renderNextPage(requestId);
    } catch (error) {
      if (requestId !== this.requestSequence) return;

      console.error("Search request failed:", error);
      this.resultCount.textContent = "SEARCH ERROR";
      this.loadMoreButton.hidden = true;
      this.setState("error");
    } finally {
      if (requestId === this.requestSequence) {
        this.setBusy(false);
        this.filterStatus.textContent = "READY";
      }
    }
  }

  private async renderNextPage(
    requestId = this.requestSequence,
  ): Promise<void> {
    const start = this.visibleCount;
    const end = Math.min(start + PAGE_SIZE, this.currentResults.length);
    const handles = this.currentResults.slice(start, end);

    if (handles.length === 0) {
      this.loadMoreButton.hidden = true;
      return;
    }

    this.loadMoreButton.disabled = true;
    this.loadMoreButton.textContent = "LOADING";

    try {
      const data = await Promise.all(handles.map((result) => result.data()));

      if (requestId !== this.requestSequence) return;

      const fragment = document.createDocumentFragment();

      data.forEach((result) => {
        fragment.append(this.renderResult(result));
      });

      this.resultsList.append(fragment);
      this.visibleCount = end;
      this.loadMoreButton.hidden =
        this.visibleCount >= this.currentResults.length;
    } catch (error) {
      console.error("Unable to load search result data:", error);
      this.setState("error");
    } finally {
      this.loadMoreButton.disabled = false;
      this.loadMoreButton.textContent = "加载更多档案";
    }
  }

  private renderResult(data: PagefindResultData): HTMLLIElement {
    const meta = data.meta ?? {};
    const title = asString(meta.title) || "未命名档案";
    const kind = asString(meta.entity_kind) || "page";
    const stableId = asString(meta.stable_id);
    const catalog = asString(meta.catalog_no);
    const section = asString(meta.section);
    const description = asString(meta.description);

    const item = createElement("li");
    const article = createElement("article", "search-result");
    const topline = createElement("div", "search-result__topline");
    const kindLabel = createElement(
      "span",
      "search-result__kind",
      humanize(kind),
    );
    const code = createElement(
      "span",
      "search-result__code",
      catalog || stableId || "ARCHIVE RECORD",
    );

    topline.append(kindLabel, code);

    const heading = createElement("h2", "search-result__title");
    const link = createElement("a");
    link.href = data.url;
    link.textContent = title;
    heading.append(link);

    const excerpt = createElement("p", "search-result__excerpt");
    if (data.excerpt) {
      // Pagefind HTML-encodes excerpts before inserting <mark> tags.
      excerpt.innerHTML = data.excerpt;
    } else {
      excerpt.textContent = description || "该档案没有可用摘要。";
    }

    article.append(topline, heading, excerpt);

    const subResults = (data.sub_results ?? [])
      .filter(
        (subResult) =>
          subResult.url !== data.url &&
          Boolean(subResult.title),
      )
      .slice(0, 3);

    if (subResults.length > 0) {
      const subList = createElement("ul", "search-subresults");

      subResults.forEach((subResult) => {
        const subItem = createElement("li", "search-subresult");
        const subLink = createElement("a");
        subLink.href = subResult.url;
        subLink.textContent = subResult.title ?? "相关小节";
        subItem.append(subLink);
        subList.append(subItem);
      });

      article.append(subList);
    }

    const footer = createElement("footer", "search-result__footer");

    if (stableId) {
      footer.append(
        createElement("span", "search-result__meta", `ID / ${stableId}`),
      );
    }

    if (section) {
      footer.append(
        createElement(
          "span",
          "search-result__meta",
          `SECTION / ${humanize(section)}`,
        ),
      );
    }

    if (footer.childElementCount > 0) article.append(footer);

    item.append(article);
    return item;
  }

  private syncUrl(query: string, filters: ActiveFilters): void {
    const url = new URL(window.location.href);

    if (query) {
      url.searchParams.set("q", query);
    } else {
      url.searchParams.delete("q");
    }

    if (filters.entity_kind) {
      url.searchParams.set("kind", filters.entity_kind);
    } else {
      url.searchParams.delete("kind");
    }

    if (filters.section) {
      url.searchParams.set("section", filters.section);
    } else {
      url.searchParams.delete("section");
    }

    window.history.replaceState({}, "", url);
  }

  private setState(state: SearchState): void {
    this.root.dataset.state = state;
  }

  private setBusy(busy: boolean): void {
    this.root.setAttribute("aria-busy", String(busy));
  }
}

export function initSearch(): void {
  const root = document.querySelector<HTMLElement>("[data-search-root]");
  if (!root) return;

  const search = new ArchiveSearch(root);
  void search.init();
}
