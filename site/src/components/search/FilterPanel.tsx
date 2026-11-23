import { en } from '../../i18n/en.ts';
import { FILTER_KEYS, type FacetCounts, type FilterKey } from '../../search/browse.ts';

interface Props {
  counts: FacetCounts;
  onToggle: (key: FilterKey, value: string) => void;
}

/** One fieldset per filter; each option shows how many results have it (AC-23). */
export default function FilterPanel({ counts, onToggle }: Props) {
  return (
    <div className="filters" data-testid="filters">
      <h2 className="visually-hidden">{en.filters.heading}</h2>
      {FILTER_KEYS.map((key) => (
        <fieldset key={key} data-filter={key}>
          <legend>{en.filters.legend[key]}</legend>
          {counts[key].length === 0 ? (
            <p className="empty">{en.filters.none}</p>
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
                    <span className="count" data-testid="facet-count">
                      {en.filters.count(option.count)}
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
