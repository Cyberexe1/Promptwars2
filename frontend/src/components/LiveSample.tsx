import { useEffect, useState } from 'react';
import { fetchAirQuality } from '../api';
import { formatTimestamp } from '../labels';
import { AqiScale } from './AqiScale';
import type { AirQualityResponse } from '../types';

/** A well-known winter-smog city, used to show a real reading on the landing page. */
const SAMPLE_LOCATION = {
  name: 'Delhi, India',
  latitude: 28.652,
  longitude: 77.231,
};

type State =
  | { status: 'loading' }
  | { status: 'ready'; data: AirQualityResponse }
  | { status: 'unavailable' };

/**
 * A live reading for one example city.
 *
 * Purpose is credibility: the landing page shows a real current number rather
 * than a mock-up. If the call fails the card degrades to a short note instead
 * of an alarming error, because nothing on this page depends on it.
 */
export function LiveSample() {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();

    fetchAirQuality(SAMPLE_LOCATION, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setState({ status: 'ready', data });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setState({ status: 'unavailable' });
      });

    return () => controller.abort();
  }, []);

  if (state.status === 'loading') {
    return (
      <aside className="sample-card" aria-label="Example live reading">
        <p className="sample-label">Live example</p>
        <div className="skeleton skeleton-number" />
        <div className="skeleton skeleton-line" />
        <div className="skeleton skeleton-line short" />
        <p className="sr-only" role="status">
          Loading an example air-quality reading.
        </p>
      </aside>
    );
  }

  if (state.status === 'unavailable') {
    return (
      <aside className="sample-card" aria-label="Example live reading">
        <p className="sample-label">Live example</p>
        <p className="sample-fallback">
          The example reading could not be loaded right now. The dashboard will
          still fetch your own location on demand.
        </p>
      </aside>
    );
  }

  const { current, risk, source } = state.data;

  return (
    <aside className="sample-card" aria-label="Example live reading">
      <p className="sample-label">Live example, fetched just now</p>

      <p className="sample-place">{SAMPLE_LOCATION.name}</p>

      <p className="sample-reading">
        <span className="sample-number">{current.usAqi ?? '—'}</span>
        <span className="sample-scale">US AQI</span>
      </p>

      <p className="sample-band" data-risk={risk.level}>
        {risk.label}
      </p>

      <AqiScale aqi={current.usAqi} level={risk.level} />

      <p className="sample-meta">
        PM2.5 {current.pm25 ?? '—'} µg/m³ · observed{' '}
        {formatTimestamp(current.observedAt)} ·{' '}
        <a href={source.url} target="_blank" rel="noreferrer noopener">
          {source.name}
        </a>
      </p>
    </aside>
  );
}
