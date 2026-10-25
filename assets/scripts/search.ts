import { normalizeSearchText, searchDocuments, searchTerms } from "./search-core.mjs";

type SearchState = "idle" | "loading" | "results" | "empty" | "error" | "missing";

interface SearchDocument {
  url: string;
  title: string;
  body: string;
  kind: string;
  section: string;
}

interface SearchIndex {
  version: number;
  documents: SearchDocument[];
}

interface SearchMatch {
  document: SearchDocument;
  body: string;
  positions: number[];
}

const PAGE_SIZE = 10;
const EXCERPT_RADIUS = 42;

const ENTITY_LABELS: Record<string, string> = {
  nation: "国家／政权", person: "人物", event: "历史事件",
  region: "地区", organization: "组织", concept: "概念",
  artifact: "物品", species: "物种", record: "文献",
  subpage: "实体章节", library: "图书馆", page: "普通页面",
};

function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Search interface element missing: ${selector}`);
  return element;
}

function appendHighlighted(target: HTMLElement, text: string, terms: string[]): void {
  const normalized = normalizeSearchText(text);
  let offset = 0;
  while (offset < text.length) {
    let position = -1;
    let matched = "";
    for (const term of terms) {
      const found = normalized.indexOf(term, offset);
      if (found >= 0 && (position < 0 || found < position || (found === position && term.length > matched.length))) {
        position = found;
        matched = term;
      }
    }
    if (position < 0) {
      target.append(document.createTextNode(text.slice(offset)));
      break;
    }
    if (position > offset) target.append(document.createTextNode(text.slice(offset, position)));
    const mark = document.createElement("mark");
    mark.textContent = text.slice(position, position + matched.length);
    target.append(mark);
    offset = position + matched.length;
  }
}

class ArchiveSearch {
  private readonly root: HTMLElement;
  private readonly form: HTMLFormElement;
  private readonly input: HTMLInputElement;
  private readonly clearButton: HTMLButtonElement;
  private readonly status: HTMLElement;
  private readonly resultCount: HTMLElement;
  private readonly resultsList: HTMLOListElement;
  private readonly loadMoreButton: HTMLButtonElement;
  private documents: SearchDocument[] = [];
  private matches: SearchMatch[] = [];
  private visibleCount = 0;
  private debounceTimer: number | undefined;

  constructor(root: HTMLElement) {
    this.root = root;
    this.form = requiredElement(root, "[data-search-form]");
    this.input = requiredElement(root, "[data-search-input]");
    this.clearButton = requiredElement(root, "[data-search-clear]");
    this.status = requiredElement(root, "[data-search-status]");
    this.resultCount = requiredElement(root, "[data-search-count]");
    this.resultsList = requiredElement(root, "[data-search-results]");
    this.loadMoreButton = requiredElement(root, "[data-search-more]");
  }

  async init(): Promise<void> {
    this.bindEvents();
    this.input.value = new URLSearchParams(location.search).get("q") ?? "";
    this.clearButton.hidden = this.input.value.length === 0;
    this.setState("loading");
    this.setBusy(true);

    try {
      const url = this.root.dataset.searchIndexUrl;
      if (!url) throw new Error("Missing search index URL.");
      const response = await fetch(url);
      if (!response.ok) {
        this.setState(response.status === 404 ? "missing" : "error");
        this.status.textContent = response.status === 404 ? "NO INDEX" : "ERROR";
        return;
      }
      const index = await response.json() as SearchIndex;
      if (index.version !== 1 || !Array.isArray(index.documents)) {
        throw new Error("Unexpected search index format.");
      }
      this.documents = index.documents;
      this.input.disabled = false;
      this.status.textContent = "READY";
      this.performSearch(false);
    } catch (error) {
      console.error("Search initialization failed:", error);
      this.setState("error");
      this.status.textContent = "ERROR";
    } finally {
      this.setBusy(false);
    }
  }

  private bindEvents(): void {
    this.form.addEventListener("submit", (event) => {
      event.preventDefault();
      this.cancelDebounce();
      this.performSearch();
    });
    this.input.addEventListener("input", () => {
      this.clearButton.hidden = this.input.value.length === 0;
      this.cancelDebounce();
      this.debounceTimer = window.setTimeout(() => this.performSearch(), 120);
    });
    this.clearButton.addEventListener("click", () => {
      this.cancelDebounce();
      this.input.value = "";
      this.clearButton.hidden = true;
      this.performSearch();
      this.input.focus();
    });
    this.loadMoreButton.addEventListener("click", () => this.renderNextPage());
    document.addEventListener("keydown", (event) => {
      const target = event.target;
      const isTyping = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable);
      if ((event.key === "/" && !isTyping) || (event.key.toLowerCase() === "k" && (event.ctrlKey || event.metaKey))) {
        event.preventDefault();
        this.input.focus();
        this.input.select();
      }
    });
  }

  private cancelDebounce(): void {
    if (this.debounceTimer !== undefined) window.clearTimeout(this.debounceTimer);
    this.debounceTimer = undefined;
  }

  private performSearch(updateUrl = true): void {
    if (this.input.disabled) return;
    const query = this.input.value.trim();
    if (updateUrl) {
      const url = new URL(location.href);
      if (query) url.searchParams.set("q", query);
      else url.searchParams.delete("q");
      url.searchParams.delete("kind");
      url.searchParams.delete("section");
      history.replaceState({}, "", url);
    }

    this.resultsList.replaceChildren();
    this.visibleCount = 0;
    this.loadMoreButton.hidden = true;
    if (!query) {
      this.matches = [];
      this.resultCount.textContent = "AWAITING QUERY";
      this.setState("idle");
      return;
    }

    this.matches = searchDocuments(this.documents, query) as SearchMatch[];
    this.resultCount.textContent = `${this.matches.length} RESULTS`;
    this.setState(this.matches.length ? "results" : "empty");
    this.renderNextPage();
  }

  private renderNextPage(): void {
    const end = Math.min(this.visibleCount + PAGE_SIZE, this.matches.length);
    const terms = searchTerms(this.input.value);
    const fragment = document.createDocumentFragment();
    for (const match of this.matches.slice(this.visibleCount, end)) {
      fragment.append(this.renderResult(match, terms));
    }
    this.resultsList.append(fragment);
    this.visibleCount = end;
    this.loadMoreButton.hidden = end >= this.matches.length;
  }

  private renderResult(match: SearchMatch, terms: string[]): HTMLLIElement {
    const { document: record, body, positions } = match;
    const item = document.createElement("li");
    const article = document.createElement("article");
    article.className = "search-result";
    const topline = document.createElement("div");
    topline.className = "search-result__topline";
    const kind = document.createElement("span");
    kind.className = "search-result__kind";
    kind.textContent = ENTITY_LABELS[record.kind] ?? record.kind;
    const code = document.createElement("span");
    code.className = "search-result__code";
    code.textContent = "正文匹配";
    topline.append(kind, code);

    const heading = document.createElement("h2");
    heading.className = "search-result__title";
    const link = document.createElement("a");
    link.href = record.url;
    link.textContent = record.title;
    heading.append(link);
    article.append(topline, heading);

    const ranges = positions
      .map((position, index) => ({
        start: Math.max(0, position - EXCERPT_RADIUS),
        end: Math.min(body.length, position + terms[index].length + EXCERPT_RADIUS),
      }))
      .sort((left, right) => left.start - right.start);
    const mergedRanges: typeof ranges = [];
    for (const range of ranges) {
      const previous = mergedRanges[mergedRanges.length - 1];
      if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
      else mergedRanges.push({ ...range });
    }

    for (const { start, end } of mergedRanges) {
      const excerpt = document.createElement("p");
      excerpt.className = "search-result__excerpt";
      if (start > 0) excerpt.append(document.createTextNode("…"));
      appendHighlighted(excerpt, body.slice(start, end), terms);
      if (end < body.length) excerpt.append(document.createTextNode("…"));
      article.append(excerpt);
    }

    if (record.section) {
      const footer = document.createElement("footer");
      footer.className = "search-result__footer";
      const section = document.createElement("span");
      section.className = "search-result__meta";
      section.textContent = `SECTION / ${record.section}`;
      footer.append(section);
      article.append(footer);
    }
    item.append(article);
    return item;
  }

  private setState(state: SearchState): void { this.root.dataset.state = state; }
  private setBusy(busy: boolean): void { this.root.setAttribute("aria-busy", String(busy)); }
}

export function initSearch(): void {
  const root = document.querySelector<HTMLElement>("[data-search-root]");
  if (root) void new ArchiveSearch(root).init();
}
