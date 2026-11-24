import type { RiskLevel } from './types';

/**
 * Maps a US AQI value to its EPA band.
 *
 * The backend already does this for the current reading and sends the band
 * with it. This exists for the hourly forecast series, where sending a band
 * per hour would triple the payload for information the client can derive.
 *
 * Boundaries mirror `backend/src/domain/aqi.ts`; a test asserts they agree.
 */
const UPPER_BOUNDS: readonly { readonly limit: number; readonly level: RiskLevel }[] = [
  { limit: 50, level: 'good' },
  { limit: 100, level: 'moderate' },
  { limit: 150, level: 'sensitive-unhealthy' },
  { limit: 200, level: 'unhealthy' },
  { limit: 300, level: 'very-unhealthy' },
] as const;

export function bandForAqi(aqi: number): RiskLevel {
  const value = Math.max(0, Math.round(aqi));
  for (const bound of UPPER_BOUNDS) {
    if (value <= bound.limit) {
      return bound.level;
    }
  }
  return 'hazardous';
}
