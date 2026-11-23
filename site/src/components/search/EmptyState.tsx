import { en } from '../../i18n/en.ts';

interface Props {
  hasFilters: boolean;
  /** The marketplace has no artifacts at all (edge case: empty marketplace). */
  catalogEmpty: boolean;
  onClearFilters: () => void;
  requestUrl: string;
}

/** Shown when nothing matches (AC-16): clear filters when any are set, and request the missing artifact (AC-17). */
export default function EmptyState({ hasFilters, catalogEmpty, onClearFilters, requestUrl }: Props) {
  return (
    <div className="empty-state" data-testid="empty-state">
      {catalogEmpty ? (
        <p>
          <strong>{en.empty.catalogEmptyTitle}</strong> {en.empty.catalogEmptyText}
        </p>
      ) : (
        <p>
          <strong>{en.empty.noMatchTitle}</strong> {en.empty.noMatchText(hasFilters)}
        </p>
      )}
      <div className="actions">
        {hasFilters && (
          <button type="button" onClick={onClearFilters}>
            {en.empty.clearFilters}
          </button>
        )}
        <a className="button secondary" href={requestUrl} target="_blank" rel="noopener noreferrer">
          {en.empty.requestIt}
        </a>
      </div>
    </div>
  );
}
