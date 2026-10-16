// Navigation state that asks the catalog page to focus its search field instead of the page heading.
export const searchFocusState = { focusSearch: true } as const

export function wantsSearchFocus(state: unknown): boolean {
  return typeof state === 'object' && state !== null && (state as { focusSearch?: unknown }).focusSearch === true
}

export const SEARCH_INPUT_ID = 'query'
