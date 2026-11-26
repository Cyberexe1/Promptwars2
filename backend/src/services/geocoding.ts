import { z } from 'zod';
import { config } from '../config.js';
import { fetchJson } from './httpClient.js';
import { upstreamUnavailable } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import type { LocationSuggestion } from '../types.js';

/**
 * City lookup via the Open-Meteo geocoding API, which needs no API key.
 * https://open-meteo.com/en/docs/geocoding-api
 */
const geocodingResponseSchema = z.object({
  results: z
    .array(
      z.object({
        id: z.number(),
        name: z.string(),
        latitude: z.number(),
        longitude: z.number(),
        country: z.string().optional(),
        admin1: z.string().optional(),
      }),
    )
    .optional(),
});

const MAX_RESULTS = 6;

export async function searchLocations(query: string): Promise<LocationSuggestion[]> {
  const url = new URL(config.geocodingApiUrl);
  url.searchParams.set('name', query);
  url.searchParams.set('count', String(MAX_RESULTS));
  url.searchParams.set('language', 'en');
  url.searchParams.set('format', 'json');

  const raw = await fetchJson(url.toString(), {
    timeoutMs: config.upstreamTimeoutMs,
    label: 'The location search service',
  });

  const parsed = geocodingResponseSchema.safeParse(raw);
  if (!parsed.success) {
    // Was `return []`, which the route rendered as a 200 with no results and
    // the interface showed as "no places found for X, try another spelling".
    // A broken provider was indistinguishable from a typo, and nothing was
    // logged either, so the failure was invisible from both ends. The
    // air-quality service treats the same condition as a 503; these now agree.
    logger.warn('geocoding_schema_rejected');
    throw upstreamUnavailable(
      'The location search service returned data in an unexpected format. Please try again shortly.',
    );
  }

  return (parsed.data.results ?? []).map((result) => {
    const suggestion: LocationSuggestion = {
      id: result.id,
      name: result.name,
      country: result.country ?? 'Unknown',
      latitude: result.latitude,
      longitude: result.longitude,
    };
    if (result.admin1) {
      suggestion.admin1 = result.admin1;
    }
    return suggestion;
  });
}
