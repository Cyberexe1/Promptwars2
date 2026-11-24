import { formatTimestamp, RISK_GLYPHS } from '../labels';
import { AqiScale } from './AqiScale';
import { OutlookChart } from './OutlookChart';
import type { AirQualityResponse } from '../types';

interface AirQualityPanelProps {
  data: AirQualityResponse;
}

interface Pollutant {
  label: string;
  value: number | null;
  unit: string;
  description: string;
}

/**
 * Current conditions, the pollutants behind them, and the next 24 hours.
 *
 * The severity band is stated in words and repeated as a dot glyph, so the
 * reading never depends on colour alone.
 */
export function AirQualityPanel({ data }: AirQualityPanelProps) {
  const { current, risk, source, stale, outlook } = data;

  const pollutants: Pollutant[] = [
    {
      label: 'PM2.5',
      value: current.pm25,
      unit: 'µg/m³',
      description: 'Fine particles that reach deep into the lungs',
    },
    {
      label: 'PM10',
      value: current.pm10,
      unit: 'µg/m³',
      description: 'Coarser dust and smoke',
    },
    {
      label: 'Nitrogen dioxide',
      value: current.nitrogenDioxide,
      unit: 'µg/m³',
      description: 'Mainly traffic and combustion',
    },
    {
      label: 'Ozone',
      value: current.ozone,
      unit: 'µg/m³',
      description: 'Forms in sunlight, usually lower in winter',
    },
  ];

  return (
    <section
      className="card"
      aria-labelledby="air-quality-heading"
      data-risk={risk.level}
    >
      <div className="card-head">
        <h2 id="air-quality-heading">Air quality in {data.location.name}</h2>
        <p className="hint">Observed {formatTimestamp(current.observedAt)}</p>
      </div>

      {stale && (
        <p className="alert alert-warning" role="status">
          This reading is more than three hours old, so conditions may have
          changed. Treat the guidance below as general precaution.
        </p>
      )}

      <div className="reading">
        <div className="reading-value" data-risk={risk.level}>
          <span className="reading-number">
            {current.usAqi ?? current.europeanAqi ?? '—'}
          </span>
          <span className="reading-scale">
            {current.usAqi !== null
              ? 'US AQI'
              : current.europeanAqi !== null
                ? 'European AQI'
                : 'No index reported'}
          </span>
        </div>

        <div className="reading-band">
          <span className="band-glyph" aria-hidden="true">
            {RISK_GLYPHS[risk.level]}
          </span>
          <strong className="band-label" data-risk={risk.level}>
            {risk.label}
          </strong>
          <p className="band-advice">{risk.advice}</p>
        </div>
      </div>

      <AqiScale aqi={current.usAqi} level={risk.level} />

      {outlook && (
        <>
          <h3 className="section-label">Next 24 hours</h3>
          <OutlookChart outlook={outlook} />
        </>
      )}

      <h3 className="section-label">Measured pollutants</h3>
      <dl className="stat-grid">
        {pollutants.map((pollutant) => (
          <div key={pollutant.label} className="stat">
            <dt>{pollutant.label}</dt>
            <dd>
              {pollutant.value === null ? (
                <span className="stat-missing">Not reported here</span>
              ) : (
                <span className="stat-value">
                  {pollutant.value}
                  <span className="stat-unit"> {pollutant.unit}</span>
                </span>
              )}
              <span className="stat-note">{pollutant.description}</span>
            </dd>
          </div>
        ))}
      </dl>

      <p className="provenance">
        Source:{' '}
        <a href={source.url} target="_blank" rel="noreferrer noopener">
          {source.name}
        </a>
        , retrieved {formatTimestamp(source.retrievedAt)}.
        {current.usAqi !== null && current.europeanAqi !== null && (
          <>
            {' '}
            The European index reads {current.europeanAqi} for the same air; the
            two scales are not interchangeable.
          </>
        )}
      </p>
    </section>
  );
}
