/**
 * Search utility functions for hierarchy-aware scoped section search.
 * Ensures case-insensitive, whitespace-trimmed, safe partial matching without regex from user input.
 */

export function normalizeSearchText(value: unknown): string {
  if (value == null) return '';
  if (Array.isArray(value)) {
    return value.map(v => normalizeSearchText(v)).join(' ');
  }
  if (typeof value === 'object') {
    // If it's a plain object with name/code/etc., stringify values or extract common fields
    try {
      return Object.values(value as Record<string, unknown>)
        .map(v => (typeof v === 'string' || typeof v === 'number' ? String(v) : ''))
        .join(' ')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ');
    } catch {
      return '';
    }
  }
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

export function matchesSearch(query: string, fields: unknown[]): boolean {
  const normQuery = normalizeSearchText(query);
  if (!normQuery) return true; // Empty query matches everything

  // Split query into individual terms for multi-word search support
  const queryTerms = normQuery.split(' ').filter(Boolean);
  if (queryTerms.length === 0) return true;

  // Combine all searchable fields into a single normalized haystack string
  const haystack = fields
    .map(f => normalizeSearchText(f))
    .filter(Boolean)
    .join(' ');

  if (!haystack) return false;

  // Every term in the query must match some part of the haystack (AND logic for query words)
  return queryTerms.every(term => haystack.includes(term));
}
