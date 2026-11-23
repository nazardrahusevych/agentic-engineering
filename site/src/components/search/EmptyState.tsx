interface Props {
  hasFilters: boolean;
  onClearFilters: () => void;
  requestUrl: string;
}

/** Shown when nothing matches (AC-16): clear filters when any are set, and request the missing artifact (AC-17). */
export default function EmptyState({ hasFilters, onClearFilters, requestUrl }: Props) {
  return (
    <div class="empty-state" data-testid="empty-state">
      <p>
        <strong>Nothing matches.</strong> Try other words{hasFilters ? ' or fewer filters' : ''}, or ask for it.
      </p>
      <div class="actions">
        {hasFilters && (
          <button type="button" onClick={onClearFilters}>
            Clear filters
          </button>
        )}
        <a class="button secondary" href={requestUrl} target="_blank" rel="noopener noreferrer">
          Request it
        </a>
      </div>
    </div>
  );
}
