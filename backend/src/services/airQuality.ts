import { z } from 'zod';
import { config } from '../config.js';
import { fetchJson } from './httpClient.js';
import { cacheKeyFor, getAirQualityCache } from './cache.js';
import { buildOutlook } from '../domain/outlook.js';
import { upstreamUnavailable } from '../utils/errors.js';
import type { CurrentAirQuality, DataSource, Outlook } from '../types.js';

/**
 * Current air quality via the Open-Meteo Air Quality API, which needs no API key.
 * https://open-meteo.com/en/docs/air-quality-api
 *
 * Times are requested as unix timestamps so there is no ambiguity about local
 * offsets, then normalised to ISO 8601 UTC for the API contract.
 */

const CURRENT_VARIABLES = [
  'us_aqi',
  'european_aqi',
  'pm2_5',
  'pm10',
  'nitrogen_dioxide',
  'ozone',
] as const;

/** A pollutant reading is either a number or absent for this location. */
const measurement = z.number().nullable().optional();

const airQualityResponseSchema = z.object({
  current: z.object({
    time: z.number(),
    us_aqi: measurement,
    european_aqi: measurement,
    pm2_5: measurement,
    pm10: measurement,
    nitrogen_dioxide: measurement,
    ozone: measurement,
  }),
  // Optional: the outlook is an enhancement, so a provider that omits the
  // hourly series must still yield a usable current reading.
  hourly: z
    .object({
      time: z.array(z.number()),
      us_aqi: z.array(measurement).optional(),
    })
    .optional(),
  // Supplied because the request asks for timezone=auto. Optional and
  // defaulted so a provider that omits it yields UTC labelling rather than an
  // error: a slightly wrong hour label is a smaller failure than no reading.
  utc_offset_seconds: z.number().optional(),
});

/** Readings older than this are flagged to the user as stale. */
export const FRESHNESS_WINDOW_MS = 3 * 60 * 60 * 1000;

export const AIR_QUALITY_SOURCE_NAME = 'Open-Meteo Air Quality API';
export const AIR_QUALITY_SOURCE_URL = 'https://open-meteo.com/en/docs/air-quality-api';

export interface AirQualityReading {
  current: CurrentAirQuality;
  source: DataSource;
  stale: boolean;
  outlook?: Outlook;
}

function normalise(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function isStale(observedAt: string, now: number = Date.now()): boolean {
  const observed = Date.parse(observedAt);
  if (Number.isNaN(observed)) {
    return true;
  }
  return now - observed > FRESHNESS_WINDOW_MS;
}

/**
 * Current air quality for a coordinate.
 *
 * Served from the shared cache when a recent reading for the same grid cell
 * exists. `source.retrievedAt` always reports when the data was actually
 * fetched upstream, so a cached response states its own age honestly rather
 * than presenting itself as fresh.
 */
export async function getCurrentAirQuality(
  latitude: number,
  longitude: number,
): Promise<AirQualityReading> {
  const cache = getAirQualityCache();
  const cacheKey = cacheKeyFor(latitude, longitude);

  if (config.aqiCacheTtlSeconds > 0) {
    const cached = await cache.get(cacheKey);
    if (cached) {
      return {
        current: cached.current,
        source: cached.source,
        // Staleness depends on the current time, so it is recomputed on every
        // read rather than stored.
        stale: isStale(cached.current.observedAt),
        ...(cached.outlook ? { outlook: cached.outlook } : {}),
      };
    }
  }

  const url = new URL(config.airQualityApiUrl);
  url.searchParams.set('latitude', String(latitude));
  url.searchParams.set('longitude', String(longitude));
  url.searchParams.set('current', CURRENT_VARIABLES.join(','));
  // Hourly AQI powers the "cleanest hour today" outlook. Two forecast days
  // cover a full 24 hours regardless of the local time of the request.
  url.searchParams.set('hourly', 'us_aqi');
  url.searchParams.set('forecast_days', '2');
  url.searchParams.set('timeformat', 'unixtime');
  // Yields utc_offset_seconds for the coordinate, so "the cleanest hour" can
  // be named in local time at the place being looked up. Timestamps stay as
  // UTC epoch seconds under timeformat=unixtime.
  url.searchParams.set('timezone', 'auto');

  const raw = await fetchJson(url.toString(), {
    timeoutMs: config.upstreamTimeoutMs,
    label: 'The air-quality service',
  });

  const parsed = airQualityResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw upstreamUnavailable(
      'The air-quality service returned data in an unexpected format. Please try again shortly.',
    );
  }

  const reading = parsed.data.current;
  const observedAt = new Date(reading.time * 1000).toISOString();

  const current: CurrentAirQuality = {
    usAqi: normalise(reading.us_aqi),
    europeanAqi: normalise(reading.european_aqi),
    pm25: normalise(reading.pm2_5),
    pm10: normalise(reading.pm10),
    nitrogenDioxide: normalise(reading.nitrogen_dioxide),
    ozone: normalise(reading.ozone),
    observedAt,
  };

  const source: DataSource = {
    name: AIR_QUALITY_SOURCE_NAME,
    url: AIR_QUALITY_SOURCE_URL,
    retrievedAt: new Date().toISOString(),
  };

  const hourly = parsed.data.hourly;
  const outlook = hourly
    ? buildOutlook({
        time: hourly.time,
        usAqi: hourly.us_aqi ?? [],
        ...(parsed.data.utc_offset_seconds !== undefined
          ? { utcOffsetSeconds: parsed.data.utc_offset_seconds }
          : {}),
      })
    : undefined;

  if (config.aqiCacheTtlSeconds > 0) {
    // Not awaited, so a slow cache write cannot delay the response. Both
    // implementations already swallow their own errors, so the `void` is about
    // latency only and is not what makes a failed write harmless.
    void cache.put(cacheKey, { current, source, ...(outlook ? { outlook } : {}) });
  }

  return {
    current,
    source,
    stale: isStale(observedAt),
    ...(outlook ? { outlook } : {}),
  };
}
