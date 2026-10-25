// A query is an AND of space-separated, literal substrings in the document body.
// Each replacement preserves string length, so match offsets point into the original body.
export function normalizeSearchText(value) {
  return String(value)
    .replace(/[！-～]/gu, (character) => String.fromCharCode(character.charCodeAt(0) - 0xfee0))
    .replace(/[A-Z]/gu, (character) => character.toLowerCase());
}

export function searchTerms(query) {
  return [...new Set(String(query).trim().split(/\s+/u).map(normalizeSearchText).filter(Boolean))];
}

export function searchDocuments(documents, query) {
  const terms = searchTerms(query);
  if (terms.length === 0) return [];

  return documents
    .map((document) => {
      const normalizedBody = normalizeSearchText(document.body);
      const positions = terms.map((term) => normalizedBody.indexOf(term));
      if (positions.some((position) => position < 0)) return null;
      return { document, body: document.body, positions, firstPosition: Math.min(...positions) };
    })
    .filter(Boolean)
    .sort((left, right) =>
      left.firstPosition - right.firstPosition ||
      left.document.title.localeCompare(right.document.title, "zh-CN") ||
      left.document.url.localeCompare(right.document.url),
    );
}
