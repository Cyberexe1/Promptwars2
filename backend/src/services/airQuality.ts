import { z } from 'zod';
import { config } from '../config.js';
import { fetchJson } from './httpClient.js';
import { upstreamUnavailable } from '../utils/errors.js';
import type { CurrentAirQuality, DataSource } from '../types.js';

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
});

/** Readings older than this are flagged to the user as stale. */
export const FRESHNESS_WINDOW_MS = 3 * 60 * 60 * 1000;

export const AIR_QUALITY_SOURCE_NAME = 'Open-Meteo Air Quality API';
export const AIR_QUALITY_SOURCE_URL = 'https://open-meteo.com/en/docs/air-quality-api';

export interface AirQualityReading {
  current: CurrentAirQuality;
  source: DataSource;
  stale: boolean;
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

export async function getCurrentAirQuality(
  latitude: number,
  longitude: number,
): Promise<AirQualityReading> {
  const url = new URL(config.airQualityApiUrl);
  url.searchParams.set('latitude', String(latitude));
  url.searchParams.set('longitude', String(longitude));
  url.searchParams.set('current', CURRENT_VARIABLES.join(','));
  url.searchParams.set('timeformat', 'unixtime');

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

  return {
    current,
    source: {
      name: AIR_QUALITY_SOURCE_NAME,
      url: AIR_QUALITY_SOURCE_URL,
      retrievedAt: new Date().toISOString(),
    },
    stale: isStale(observedAt),
  };
}
