/**
 * OR semantics: an item matches when any of its `tags` appears in `selectedTags`.
 * When `selectedTags` is empty, returns a shallow copy of all items (no filtering).
 */
export function filterItemsByAnyTag<T extends { tags: readonly string[] }>(
  items: readonly T[],
  selectedTags: ReadonlySet<string>,
): T[] {
  if (selectedTags.size === 0) return [...items]
  return items.filter((it) => it.tags.some((t) => selectedTags.has(t)))
}
