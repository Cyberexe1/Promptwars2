import { useEffect, useId, useRef, useState } from 'react';
import { ApiError, searchLocations } from '../api';
import type { LocationInput, LocationSuggestion } from '../types';

interface LocationPickerProps {
  selected: LocationInput | null;
  onSelect: (location: LocationInput) => void;
}

const DEBOUNCE_MS = 350;
const MIN_QUERY_LENGTH = 2;

/** A completed search, tagged with the query it answered. */
interface SearchOutcome {
  query: string;
  results: LocationSuggestion[];
}

interface SearchFailure {
  query: string;
  message: string;
}

function describe(suggestion: LocationSuggestion): string {
  return [suggestion.name, suggestion.admin1, suggestion.country]
    .filter(Boolean)
    .join(', ');
}

/**
 * City search plus an optional browser-geolocation shortcut.
 *
 * Results are stored tagged with the query that produced them, so what is
 * displayed is derived during render rather than reset through the effect.
 * That keeps stale results from a previous query off the screen without
 * cascading state updates.
 *
 * Geolocation is never requested automatically: the user presses the button,
 * which keeps the permission prompt tied to a deliberate action. Coordinates
 * are rounded before use and are not stored.
 */
export function LocationPicker({ selected, onSelect }: LocationPickerProps) {
  const inputId = useId();
  const statusId = useId();

  const [query, setQuery] = useState('');
  const [outcome, setOutcome] = useState<SearchOutcome | null>(null);
  const [failure, setFailure] = useState<SearchFailure | null>(null);
  const [geolocationError, setGeolocationError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const latestRequest = useRef(0);

  const trimmed = query.trim();
  const searchable = trimmed.length >= MIN_QUERY_LENGTH;

  useEffect(() => {
    const term = query.trim();
    if (term.length < MIN_QUERY_LENGTH) {
      return;
    }

    const controller = new AbortController();
    const requestId = latestRequest.current + 1;
    latestRequest.current = requestId;

    // Debounced so typing a city name does not fire a request per keystroke.
    const timer = setTimeout(() => {
      searchLocations(term, controller.signal)
        .then((results) => {
          // Ignore responses from superseded requests.
          if (latestRequest.current !== requestId) return;
          setOutcome({ query: term, results });
          setFailure(null);
        })
        .catch((cause: unknown) => {
          if (controller.signal.aborted) return;
          if (latestRequest.current !== requestId) return;
          setFailure({
            query: term,
            message:
              cause instanceof ApiError
                ? cause.message
                : 'City search is unavailable right now.',
          });
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  // Everything below is derived from the current query, so the view can never
  // show results belonging to an earlier search term.
  const answered = outcome?.query === trimmed;
  const failed = failure?.query === trimmed;
  const results = answered ? outcome.results : [];
  const searching = searchable && !answered && !failed;
  const showEmptyState = answered && results.length === 0;

  function useMyLocation() {
    if (!('geolocation' in navigator)) {
      setGeolocationError(
        'This browser cannot share your location. Please search instead.',
      );
      return;
    }

    setLocating(true);
    setGeolocationError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        onSelect({
          name: 'Current location',
          // Rounded to roughly a few hundred metres: enough for an
          // air-quality lookup, not enough to identify a home address.
          latitude: Number(position.coords.latitude.toFixed(3)),
          longitude: Number(position.coords.longitude.toFixed(3)),
        });
      },
      () => {
        setLocating(false);
        setGeolocationError(
          'Location permission was not granted. Search for your city instead.',
        );
      },
      { timeout: 10000, maximumAge: 300000 },
    );
  }

  const errorMessage = geolocationError ?? (failed ? failure.message : null);

  return (
    <section className="card" aria-labelledby="location-heading">
      <h2 id="location-heading">
        <span className="step-number" aria-hidden="true">
          1
        </span>
        Choose your location
      </h2>
      <p className="hint">
        We use this only to fetch the current air quality. Coordinates are
        rounded and never stored.
      </p>

      <div className="field">
        <label htmlFor={inputId}>Search for a city or town</label>
        <input
          id={inputId}
          type="search"
          value={query}
          autoComplete="off"
          placeholder="For example, Delhi or Krakow"
          aria-describedby={statusId}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <button
        type="button"
        className="button button-secondary"
        onClick={useMyLocation}
        disabled={locating}
      >
        {locating ? 'Finding your location…' : 'Use my current location'}
      </button>

      <p id={statusId} className="status" role="status" aria-live="polite">
        {searching && 'Searching for matching places…'}
        {showEmptyState && `No places found for “${trimmed}”. Try another spelling.`}
        {selected && !searching && `Selected location: ${selected.name}.`}
      </p>

      {errorMessage && (
        <p className="alert alert-error" role="alert">
          {errorMessage}
        </p>
      )}

      {results.length > 0 && (
        <ul className="result-list">
          {results.map((suggestion) => {
            const label = describe(suggestion);
            const isSelected =
              selected?.latitude === suggestion.latitude &&
              selected?.longitude === suggestion.longitude;

            return (
              <li key={suggestion.id}>
                <button
                  type="button"
                  className="result-button"
                  aria-pressed={isSelected}
                  onClick={() =>
                    onSelect({
                      name: label,
                      latitude: suggestion.latitude,
                      longitude: suggestion.longitude,
                    })
                  }
                >
                  <span>{label}</span>
                  {isSelected && <span className="result-tick">Selected</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
