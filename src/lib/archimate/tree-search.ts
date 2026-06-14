/** Minimum query length before sidebar tree filtering runs. */
export const TREE_SEARCH_MIN_LENGTH = 3

/** Debounce delay for sidebar tree search input (ms). */
export const TREE_SEARCH_DEBOUNCE_MS = 350

/** Max matches per section when search is active (avoids huge Ant Design trees). */
export const TREE_SEARCH_MAX_RESULTS = 500

export interface TreeSearchState {
  /** Normalized query used for filtering; empty when search is inactive. */
  query: string
  /** Trimmed raw input for UI hints. */
  input: string
  isActive: boolean
  /** Typed text is shorter than {@link TREE_SEARCH_MIN_LENGTH}. */
  isPending: boolean
  remainingChars: number
}

export function resolveTreeSearchState(input: string): TreeSearchState {
  const trimmed = input.trim()
  const query = trimmed.toLowerCase()

  if (!query) {
    return {
      query: '',
      input: trimmed,
      isActive: false,
      isPending: false,
      remainingChars: TREE_SEARCH_MIN_LENGTH,
    }
  }

  if (query.length < TREE_SEARCH_MIN_LENGTH) {
    return {
      query: '',
      input: trimmed,
      isActive: false,
      isPending: true,
      remainingChars: TREE_SEARCH_MIN_LENGTH - query.length,
    }
  }

  return {
    query,
    input: trimmed,
    isActive: true,
    isPending: false,
    remainingChars: 0,
  }
}

export function capTreeSearchResults<T>(
  items: T[],
  isActive: boolean,
): { items: T[]; truncated: boolean; totalMatches: number } {
  const totalMatches = items.length
  if (!isActive || totalMatches <= TREE_SEARCH_MAX_RESULTS) {
    return { items, truncated: false, totalMatches }
  }
  return {
    items: items.slice(0, TREE_SEARCH_MAX_RESULTS),
    truncated: true,
    totalMatches,
  }
}

export function matchesTreeSearchHaystack(haystack: string, query: string): boolean {
  return haystack.includes(query)
}
