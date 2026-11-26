import { bandForAqi } from '../bands';
import type { Outlook } from '../types';

interface OutlookChartProps {
  outlook: Outlook;
}

/**
 * Hour label in local time at the place being looked up, e.g. "14:00".
 *
 * Not the browser's timezone. Someone in London checking Delhi needs Delhi
 * hours: a chart that labels the cleanest hour "09:00" when it is 14:30 there
 * is not just unhelpful, it contradicts the advice text, which the backend
 * writes using the location's own offset.
 */
function hourLabel(iso: string, utcOffsetSeconds: number): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  const shifted = new Date(date.getTime() + utcOffsetSeconds * 1000);
  const hours = String(shifted.getUTCHours()).padStart(2, '0');
  const minutes = String(shifted.getUTCMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Scale ceiling: the next multiple of 50 above the worst value, held between
 * 100 and 500. Deliberately not the enclosing AQI band top, which would jump
 * the axis to 300 for a peak of 210 and flatten the whole series.
 */
function ceilingFor(values: number[]): number {
  const peak = Math.max(...values, 50);
  return Math.min(Math.max(Math.ceil(peak / 50) * 50, 100), 500);
}

/**
 * The next 24 hours of air quality.
 *
 * This exists because the plan's central advice is to move outdoor time away
 * from the pollution peak, which is not actionable without knowing when the
 * peak is.
 *
 * Accessibility: the bars are decorative. The cleanest and worst hours are
 * stated in text above the chart, and the full hour-by-hour series is
 * available to screen readers as a real table.
 */
export function OutlookChart({ outlook }: OutlookChartProps) {
  const values = outlook.hours
    .map((hour) => hour.usAqi)
    .filter((value): value is number => value !== null);

  if (values.length === 0) {
    return null;
  }

  const ceiling = ceilingFor(values);
  const firstHour = outlook.hours[0];
  const lastHour = outlook.hours[outlook.hours.length - 1];
  // Defaulted, so a response from an older deployment still renders rather
  // than labelling every hour NaN.
  const offset = outlook.utcOffsetSeconds ?? 0;

  return (
    <div className="outlook">
      {(outlook.cleanestHour || outlook.worstHour) && (
        <div className="outlook-highlight">
          {outlook.cleanestHour && (
            <p className="outlook-fact">
              <span className="outlook-fact-label">Cleanest hour ahead</span>
              <span className="outlook-fact-value">
                {hourLabel(outlook.cleanestHour, offset)}
              </span>
            </p>
          )}
          {outlook.worstHour && (
            <p className="outlook-fact">
              <span className="outlook-fact-label">Worst hour ahead</span>
              <span className="outlook-fact-value">
                {hourLabel(outlook.worstHour, offset)}
              </span>
            </p>
          )}
        </div>
      )}

      <div className="chart" aria-hidden="true">
        {outlook.hours.map((hour) => {
          const marker =
            hour.time === outlook.cleanestHour
              ? 'cleanest'
              : hour.time === outlook.worstHour
                ? 'worst'
                : undefined;

          if (hour.usAqi === null) {
            return (
              <span key={hour.time} className="chart-column">
                <span className="chart-gap" />
              </span>
            );
          }

          return (
            <span
              key={hour.time}
              className="chart-column"
              data-risk={bandForAqi(hour.usAqi)}
              {...(marker ? { 'data-marker': marker } : {})}
              title={`${hourLabel(hour.time, offset)} — US AQI ${hour.usAqi}`}
            >
              <span
                className="chart-bar"
                style={{
                  height: `${Math.max((hour.usAqi / ceiling) * 100, 2)}%`,
                }}
              />
            </span>
          );
        })}
      </div>

      <div className="chart-axis" aria-hidden="true">
        <span>{firstHour ? hourLabel(firstHour.time, offset) : ''}</span>
        <span>{lastHour ? hourLabel(lastHour.time, offset) : ''}</span>
      </div>

      <p className="chart-legend">
        <span>Each bar is one hour, coloured by its US AQI band.</span>
        <span>Scale tops out at {ceiling}.</span>
      </p>

      {/* The real data, for anyone who cannot use the bars. */}
      <table className="sr-only">
        <caption>Forecast US Air Quality Index for the next 24 hours</caption>
        <thead>
          <tr>
            <th scope="col">Hour</th>
            <th scope="col">US AQI</th>
          </tr>
        </thead>
        <tbody>
          {outlook.hours.map((hour) => (
            <tr key={hour.time}>
              <th scope="row">{hourLabel(hour.time, offset)}</th>
              <td>{hour.usAqi === null ? 'Not reported' : hour.usAqi}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
