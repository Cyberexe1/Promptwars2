import { describe, expect, it } from 'vitest';
import {
  buildOutlook,
  describeTiming,
  FLAT_FORECAST_SPREAD,
  OUTLOOK_HOURS,
  RECOMMENDATION_WINDOW_HOURS,
  type RawHourly,
} from '../src/domain/outlook.js';

const HOUR_MS = 60 * 60 * 1000;

/** Midday UTC, so hour arithmetic stays readable. */
const NOW_MS = Date.UTC(2026, 10, 23, 12, 30, 0);
const CURRENT_HOUR_MS = Date.UTC(2026, 10, 23, 12, 0, 0);

/**
 * Builds a provider-shaped series starting `pastHours` before the current
 * hour, with one AQI value per hour.
 */
function series(values: (number | null)[], pastHours = 0): RawHourly {
  const start = CURRENT_HOUR_MS - pastHours * HOUR_MS;
  return {
    time: values.map((_, index) => (start + index * HOUR_MS) / 1000),
    usAqi: values,
  };
}

function flat(value: number, count: number): number[] {
  return Array.from({ length: count }, () => value);
}

describe('buildOutlook', () => {
  it('returns nothing when the provider sends no series', () => {
    expect(buildOutlook({ time: [], usAqi: [] }, NOW_MS)).toBeUndefined();
  });

  it('returns nothing when every hour is in the past', () => {
    const raw = series(flat(100, 5), 10);
    expect(buildOutlook(raw, NOW_MS)).toBeUndefined();
  });

  it('starts at the current hour, not at the top of the provider series', () => {
    // Provider sends 6 past hours then the present onward.
    const raw = series(flat(150, 30), 6);
    const outlook = buildOutlook(raw, NOW_MS)!;

    expect(outlook.hours[0]!.time).toBe(new Date(CURRENT_HOUR_MS).toISOString());
  });

  it('drops past hours the user cannot act on', () => {
    const raw = series(flat(150, 30), 6);
    const outlook = buildOutlook(raw, NOW_MS)!;

    for (const hour of outlook.hours) {
      expect(Date.parse(hour.time)).toBeGreaterThanOrEqual(CURRENT_HOUR_MS);
    }
  });

  it('caps the series at the advertised length', () => {
    const outlook = buildOutlook(series(flat(120, 72)), NOW_MS)!;
    expect(outlook.hours).toHaveLength(OUTLOOK_HOURS);
  });

  it('returns a shorter series when the provider has less data', () => {
    const outlook = buildOutlook(series(flat(120, 5)), NOW_MS)!;
    expect(outlook.hours).toHaveLength(5);
  });

  it('names the lowest hour within the recommendation window', () => {
    const values = flat(180, 24);
    values[4] = 60;
    const outlook = buildOutlook(series(values), NOW_MS)!;

    expect(outlook.cleanestHour).toBe(
      new Date(CURRENT_HOUR_MS + 4 * HOUR_MS).toISOString(),
    );
  });

  it('names the highest hour within the recommendation window', () => {
    const values = flat(100, 24);
    values[3] = 260;
    const outlook = buildOutlook(series(values), NOW_MS)!;

    expect(outlook.worstHour).toBe(
      new Date(CURRENT_HOUR_MS + 3 * HOUR_MS).toISOString(),
    );
  });

  it('ignores a clean hour beyond the recommendation window', () => {
    // Advice to go out 20 hours from now is not actionable, and forecast
    // confidence falls with distance.
    const values = flat(180, 24);
    values[RECOMMENDATION_WINDOW_HOURS + 4] = 20;
    const outlook = buildOutlook(series(values), NOW_MS)!;

    expect(outlook.cleanestHour).not.toBe(
      new Date(
        CURRENT_HOUR_MS + (RECOMMENDATION_WINDOW_HOURS + 4) * HOUR_MS,
      ).toISOString(),
    );
    // The clean hour still appears in the chart, just not as the recommendation.
    expect(outlook.hours.some((hour) => hour.usAqi === 20)).toBe(true);
  });

  it('reports no peak when the forecast is flat', () => {
    const outlook = buildOutlook(series(flat(140, 24)), NOW_MS)!;

    // Every hour is equal, so naming a worst hour would be misleading.
    expect(outlook.worstHour).toBeNull();
    expect(outlook.cleanestHour).not.toBeNull();
  });

  it('resolves a tie for cleanest to the earlier, more actionable hour', () => {
    const values = flat(200, 24);
    values[2] = 50;
    values[8] = 50;
    const outlook = buildOutlook(series(values), NOW_MS)!;

    expect(outlook.cleanestHour).toBe(
      new Date(CURRENT_HOUR_MS + 2 * HOUR_MS).toISOString(),
    );
  });

  it('keeps gaps as null rather than guessing a value', () => {
    const values: (number | null)[] = flat(120, 24);
    values[5] = null;
    const outlook = buildOutlook(series(values), NOW_MS)!;

    expect(outlook.hours[5]!.usAqi).toBeNull();
  });

  it('skips gaps when choosing the cleanest hour', () => {
    const values: (number | null)[] = flat(150, 24);
    values[3] = null;
    values[6] = 40;
    const outlook = buildOutlook(series(values), NOW_MS)!;

    expect(outlook.cleanestHour).toBe(
      new Date(CURRENT_HOUR_MS + 6 * HOUR_MS).toISOString(),
    );
  });

  it('names no hour when the whole window is missing values', () => {
    const values: (number | null)[] = Array.from({ length: 24 }, () => null);
    const outlook = buildOutlook(series(values), NOW_MS)!;

    expect(outlook.hours).toHaveLength(OUTLOOK_HOURS);
    expect(outlook.cleanestHour).toBeNull();
    expect(outlook.worstHour).toBeNull();
  });

  it('rounds fractional provider values', () => {
    const outlook = buildOutlook(series([183.4, 120.6]), NOW_MS)!;

    expect(outlook.hours[0]!.usAqi).toBe(183);
    expect(outlook.hours[1]!.usAqi).toBe(121);
  });

  it('emits hours in ascending order with no duplicates', () => {
    const outlook = buildOutlook(series(flat(130, 30), 4), NOW_MS)!;
    const stamps = outlook.hours.map((hour) => Date.parse(hour.time));

    for (let index = 1; index < stamps.length; index += 1) {
      expect(stamps[index]!).toBe(stamps[index - 1]! + HOUR_MS);
    }
  });
});

describe('describeTiming', () => {
  it('names the cleanest hour in local time at the location, not UTC', () => {
    // 12:00 UTC is 17:30 in Delhi. A user in London checking Delhi must be
    // told a Delhi hour.
    const delhiOffset = 5.5 * 3600;
    const raw = { ...series([180, 150, 190, 200, 185, 175]), utcOffsetSeconds: delhiOffset };
    const timing = describeTiming(buildOutlook(raw, NOW_MS))!;

    // Cleanest is index 1, i.e. 13:00 UTC, i.e. 18:30 local -> "6pm".
    expect(timing.cleanestLabel).toBe('6pm');
    expect(timing.flat).toBe(false);
  });

  it('defaults to UTC labelling when the provider omits an offset', () => {
    const timing = describeTiming(buildOutlook(series([180, 150, 190]), NOW_MS))!;
    expect(timing.cleanestLabel).toBe('1pm');
  });

  it('reports a flat forecast as flat, so no cleaner hour is implied', () => {
    // The shape of severe smog: every hour within a few points.
    const raw = { ...series([184, 186, 183, 190, 188, 185]), utcOffsetSeconds: 0 };
    const outlook = buildOutlook(raw, NOW_MS)!;

    expect(outlook.windowSpread).toBe(7);
    expect(describeTiming(outlook)!.flat).toBe(true);
  });

  it('treats a spread at the threshold as not flat', () => {
    const raw = { ...series([100, 100 + FLAT_FORECAST_SPREAD]), utcOffsetSeconds: 0 };
    expect(describeTiming(buildOutlook(raw, NOW_MS))!.flat).toBe(false);
  });

  it('gives nothing to say when no hour carries a reading', () => {
    expect(describeTiming(buildOutlook(series([null, null]), NOW_MS))).toBeUndefined();
    expect(describeTiming(undefined)).toBeUndefined();
  });

  it('carries the provider offset onto the outlook for the client to use', () => {
    const raw = { ...series([120, 130]), utcOffsetSeconds: -18000 };
    expect(buildOutlook(raw, NOW_MS)!.utcOffsetSeconds).toBe(-18000);
  });
});
