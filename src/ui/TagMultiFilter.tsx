export type TagMultiFilterProps = {
  /** `<details>` summary text (collapsed label). */
  summary: string
  /** Short helper under the chips. */
  hint: string
  allTags: readonly string[]
  /** Tags currently included in the filter (subset of `allTags` for display). */
  selected: readonly string[]
  onToggle: (tag: string) => void
  onClear: () => void
}

/**
 * Collapsible multi-select tag filter (OR). Renders nothing when `allTags` is empty.
 */
export function TagMultiFilter({ summary, hint, allTags, selected, onToggle, onClear }: TagMultiFilterProps) {
  const hasSelection = selected.length > 0

  if (allTags.length === 0) return null

  return (
    <details className="nb-tag-filter">
      <summary className="nb-tag-filter-summary">{summary}</summary>
      <div className="nb-tag-filter-body">
        <div className="nb-tag-filter-chips" role="group" aria-label="Tag filters">
          {allTags.map((tag) => {
            const on = selected.includes(tag)
            return (
              <button
                key={tag}
                type="button"
                className={'nb-tag-filter-chip' + (on ? ' nb-tag-filter-chip--on' : '')}
                aria-pressed={on}
                title={tag}
                onClick={() => onToggle(tag)}
              >
                {tag}
              </button>
            )
          })}
        </div>
        {hasSelection && (
          <button type="button" className="nb-tag-filter-clear" onClick={onClear}>
            Clear filter
          </button>
        )}
        <p className="nb-tag-filter-hint">{hint}</p>
      </div>
    </details>
  )
}
