import { Button } from '@capra/core'

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
              <Button
                key={tag}
                type="button"
                size="xs"
                variant={on ? 'primary' : 'secondary'}
                appearance={on ? 'default' : 'neutral'}
                aria-pressed={on}
                onClick={() => onToggle(tag)}
              >
                {tag}
              </Button>
            )
          })}
        </div>
        {hasSelection && (
          <Button type="button" size="xs" variant="tertiary" onClick={onClear}>
            Clear filter
          </Button>
        )}
        <p className="nb-tag-filter-hint">{hint}</p>
      </div>
    </details>
  )
}
