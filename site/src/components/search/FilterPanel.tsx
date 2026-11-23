import { FILTER_KEYS, type FacetCounts, type FilterKey } from '../../search/browse.ts';

interface Props {
  counts: FacetCounts;
  onToggle: (key: FilterKey, value: string) => void;
}

const LEGENDS: Record<FilterKey, string> = {
  type: 'Type',
  plugin: 'Plugin',
  category: 'Category',
  tag: 'Tag',
};

/** One fieldset per filter; each option shows how many results have it (AC-23). */
export default function FilterPanel({ counts, onToggle }: Props) {
  return (
    <div class="filters" data-testid="filters">
      <h2 class="visually-hidden">Filters</h2>
      {FILTER_KEYS.map((key) => (
        <fieldset key={key} data-filter={key}>
          <legend>{LEGENDS[key]}</legend>
          {counts[key].length === 0 ? (
            <p class="empty">None</p>
          ) : (
            <ul>
              {counts[key].map((option) => (
                <li key={option.value}>
                  <label>
                    <input
                      type="checkbox"
                      name={key}
                      value={option.value}
                      checked={option.selected}
                      onChange={() => onToggle(key, option.value)}
                    />
                    <span>{option.value}</span>
                    <span class="count" data-testid="facet-count">
                      ({option.count})
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </fieldset>
      ))}
    </div>
  );
}
