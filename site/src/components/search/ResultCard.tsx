import type { CatalogEntry } from '../../catalog/types.ts';
import { entryKey } from '../../search/browse.ts';
import CopyCommand from '../CopyCommand.tsx';

interface Props {
  entry: CatalogEntry;
  base: string;
}

const MAX_TAGS = 3;

/** One result card (AC-19). Every value from the catalog is rendered as text. */
export default function ResultCard({ entry, base }: Props) {
  const href = `${base}${entryKey(entry)}`;
  return (
    <article class="card" data-testid="result-card" data-id={entry.id} data-type={entry.type}>
      <div class="meta">
        <span class={`badge badge-${entry.type}`} data-testid="type-badge">
          {entry.type}
        </span>
        {entry.type !== 'plugin' && (
          <span data-testid="card-plugin">
            in <strong>{entry.plugin}</strong>
          </span>
        )}
      </div>
      <h3>
        <a href={href}>{entry.name}</a>
      </h3>
      <p class="description clamp-2" title={entry.description}>
        {entry.description}
      </p>
      {entry.tags.length > 0 && (
        <ul class="tags" aria-label="Tags">
          {entry.tags.slice(0, MAX_TAGS).map((tag) => (
            <li class="tag" key={tag}>
              {tag}
            </li>
          ))}
        </ul>
      )}
      <div class="actions">
        <CopyCommand command={entry.install} label="Copy install" context={`for ${entry.plugin}`} />
      </div>
    </article>
  );
}
