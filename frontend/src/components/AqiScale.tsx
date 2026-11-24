import { markerPercent, SCALE_SEGMENTS } from '../aqiScale';
import { RISK_LABELS } from '../labels';
import type { RiskLevel } from '../types';

interface AqiScaleProps {
  /** US AQI value, or null when no index is available. */
  aqi: number | null;
  level: RiskLevel;
}

/**
 * Where a reading sits across the six AQI bands.
 *
 * This is a visual aid only. It is hidden from assistive technology because
 * the band name, the numeric value, and the health advice are all presented as
 * real text beside it, so nothing here is the sole carrier of meaning.
 */
export function AqiScale({ aqi, level }: AqiScaleProps) {
  if (aqi === null) {
    return null;
  }

  return (
    <div className="aqi-scale" aria-hidden="true">
      <div className="aqi-scale-track">
        {SCALE_SEGMENTS.map((segment) => (
          <span
            key={segment.level}
            className="aqi-scale-segment"
            data-risk={segment.level}
            style={{ flexGrow: segment.weight }}
            title={RISK_LABELS[segment.level]}
          />
        ))}
        <span
          className="aqi-scale-marker"
          data-risk={level}
          style={{ left: `${markerPercent(aqi)}%` }}
        />
      </div>
      <div className="aqi-scale-ends">
        <span>0</span>
        <span>Good</span>
        <span>Hazardous</span>
        <span>500</span>
      </div>
    </div>
  );
}
