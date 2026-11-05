import type { SearchIndex } from '@/lib/search/searchIndex';

/**
 * The one search index, kept in memory only (never on disk) and tagged with
 * the key it was built for — who is searching and what they can open. A
 * different key never reuses it. AccessProvider clears it on sign-out and
 * whenever the tier changes.
 */
let cached: { key: string; index: SearchIndex } | null = null;

export function readSearchIndex(key: string): SearchIndex | null {
  return cached && cached.key === key ? cached.index : null;
}

export function storeSearchIndex(key: string, index: SearchIndex): void {
  cached = { key, index };
}

export function clearSearchIndex(): void {
  cached = null;
}

export function hasCachedSearchIndex(): boolean {
  return cached !== null;
}
