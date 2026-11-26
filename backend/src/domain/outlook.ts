import type { HourlyReading, Outlook } from '../types.js';


/**
 * Builds the 24-hour outlook from a provider hourly series.
 *
 * Deterministic and side-effect free, so the "cleanest hour" claim the
 * interface makes is reproducible and testable rather than a model guess.
 */

/** How many hours ahead to show. */
export const OUTLOOK_HOURS = 24;

/**
 * How far ahead to look when naming the cleanest hour.
 *
 * Shorter than the chart on purpose: advice to go outside 22 hours from now is
 * useless, and forecast confidence falls with distance.
 */
export const RECOMMENDATION_WINDOW_HOURS = 12;

export interface RawHourly {
  /** Unix seconds, as returned when timeformat=unixtime. */
  time: number[];
  usAqi: (number | null | undefined)[];
  /** Local offset at the coordinate. Defaults to UTC when absent. */
  utcOffsetSeconds?: number;
}

/**
 * Below this AQI spread the forecast counts as flat.
 *
 * Judgement, not a published figure: a 15-point swing inside the unhealthy
 * band does not change what anyone should do, so advice to shift activity into
 * the "cleanest" hour would be noise presented as guidance. In severe smog the
 * series is often flat across the whole window, which is exactly when the app
 * must not pretend there is a good time to go out.
 */
export const FLAT_FORECAST_SPREAD = 15;

function isUsable(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Trims the provider series to the hours from now onward and normalises it.
 *
 * The provider returns past hours too, which would make the chart show history
 * the user cannot act on.
 */
export function buildOutlook(
  raw: RawHourly,
  nowMs: number = Date.now(),
): Outlook | undefined {
  const { time, usAqi } = raw;

  if (!Array.isArray(time) || time.length === 0) {
    return undefined;
  }

  // Align to the top of the current hour so the first bar is "now".
  const hourMs = 60 * 60 * 1000;
  const currentHourMs = Math.floor(nowMs / hourMs) * hourMs;

  const hours: HourlyReading[] = [];

  for (let index = 0; index < time.length; index += 1) {
    const stamp = time[index];
    if (typeof stamp !== 'number' || !Number.isFinite(stamp)) {
      continue;
    }

    const atMs = stamp * 1000;
    if (atMs < currentHourMs) {
      continue;
    }
    if (hours.length >= OUTLOOK_HOURS) {
      break;
    }

    const value = usAqi[index];
    hours.push({
      time: new Date(atMs).toISOString(),
      usAqi: isUsable(value) ? Math.round(value) : null,
    });
  }

  if (hours.length === 0) {
    return undefined;
  }

  const window = hours
    .slice(0, RECOMMENDATION_WINDOW_HOURS)
    .filter((hour): hour is HourlyReading & { usAqi: number } =>
      isUsable(hour.usAqi),
    );

  const utcOffsetSeconds = raw.utcOffsetSeconds ?? 0;

  if (window.length === 0) {
    return {
      hours,
      cleanestHour: null,
      worstHour: null,
      utcOffsetSeconds,
      windowSpread: null,
    };
  }

  // Ties resolve to the earlier hour, which is the more actionable one.
  const cleanest = window.reduce((best, hour) =>
    hour.usAqi < best.usAqi ? hour : best,
  );
  const worst = window.reduce((peak, hour) =>
    hour.usAqi > peak.usAqi ? hour : peak,
  );

  return {
    hours,
    cleanestHour: cleanest.time,
    // A flat forecast has no meaningful peak, so do not invent one.
    worstHour: worst.usAqi > cleanest.usAqi ? worst.time : null,
    utcOffsetSeconds,
    windowSpread: worst.usAqi - cleanest.usAqi,
  };
}

export interface OutlookTiming {
  /** Local-time label for the cleanest hour, such as "2pm". */
  cleanestLabel: string;
  worstLabel: string | null;
  /** True when no hour in the window is meaningfully cleaner than another. */
  flat: boolean;
}

/** Formats a UTC instant as an hour label in the location's own local time. */
function localHourLabel(isoTime: string, utcOffsetSeconds: number): string {
  const local = new Date(new Date(isoTime).getTime() + utcOffsetSeconds * 1000);
  const hour = local.getUTCHours();
  const suffix = hour < 12 ? 'am' : 'pm';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}${suffix}`;
}

/**
 * Turns an outlook into the timing facts the advice layer needs.
 *
 * Returns undefined when there is nothing trustworthy to say, so callers fall
 * back to the reviewed catalogue wording rather than inventing a time.
 */
export function describeTiming(
  outlook: Outlook | undefined,
): OutlookTiming | undefined {
  if (!outlook?.cleanestHour || outlook.windowSpread === null) {
    return undefined;
  }

  return {
    cleanestLabel: localHourLabel(outlook.cleanestHour, outlook.utcOffsetSeconds),
    worstLabel: outlook.worstHour
      ? localHourLabel(outlook.worstHour, outlook.utcOffsetSeconds)
      : null,
    flat: outlook.windowSpread < FLAT_FORECAST_SPREAD,
  };
}
