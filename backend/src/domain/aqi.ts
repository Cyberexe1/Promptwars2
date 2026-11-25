import type { RiskLevel } from '../types.js';

/**
 * US EPA Air Quality Index bands and the PM2.5 conversion used as a fallback.
 *
 * Breakpoints follow the EPA revision effective 6 May 2024, which lowered the
 * top of the "Good" band from 12.0 to 9.0 ug/m3.
 * Sources:
 *   https://aqs.epa.gov/aqsweb/documents/codetables/aqi_breakpoints.html
 *   https://www.epa.gov/system/files/documents/2024-02/pm-naaqs-air-quality-index-fact-sheet.pdf
 */

export interface AqiBand {
  level: RiskLevel;
  label: string;
  aqiLow: number;
  aqiHigh: number;
  advice: string;
}

export const AQI_BANDS: readonly AqiBand[] = [
  {
    level: 'good',
    label: 'Good',
    aqiLow: 0,
    aqiHigh: 50,
    advice:
      'Air quality is satisfactory. Normal outdoor activity is fine for everyone today.',
  },
  {
    level: 'moderate',
    label: 'Moderate',
    aqiLow: 51,
    aqiHigh: 100,
    advice:
      'Air quality is acceptable for most people. Anyone unusually sensitive to particles may prefer lighter outdoor effort.',
  },
  {
    level: 'sensitive-unhealthy',
    label: 'Unhealthy for sensitive groups',
    aqiLow: 101,
    aqiHigh: 150,
    advice:
      'Children, older adults, pregnant people, and anyone with heart or lung conditions should shorten and soften outdoor activity.',
  },
  {
    level: 'unhealthy',
    label: 'Unhealthy',
    aqiLow: 151,
    aqiHigh: 200,
    advice:
      'Everyone should reduce time outdoors and avoid strenuous outdoor exercise. Sensitive groups should stay indoors where possible.',
  },
  {
    level: 'very-unhealthy',
    label: 'Very unhealthy',
    aqiLow: 201,
    aqiHigh: 300,
    advice:
      'Treat this as a health alert. Avoid outdoor exertion entirely and keep indoor air as clean as you can.',
  },
  {
    level: 'hazardous',
    label: 'Hazardous',
    aqiLow: 301,
    aqiHigh: 500,
    advice:
      'Emergency conditions. Stay indoors with windows closed, filter indoor air, and follow local health-authority instructions.',
  },
] as const;

/** Severity order, lowest to highest. Used for comparisons and escalation. */
export const RISK_ORDER: readonly RiskLevel[] = [
  'good',
  'moderate',
  'sensitive-unhealthy',
  'unhealthy',
  'very-unhealthy',
  'hazardous',
] as const;

export function riskRank(level: RiskLevel): number {
  return RISK_ORDER.indexOf(level);
}

export function isAtLeast(level: RiskLevel, threshold: RiskLevel): boolean {
  return riskRank(level) >= riskRank(threshold);
}

/** Moves a risk level one band stricter, stopping at the top band. */
export function escalate(level: RiskLevel): RiskLevel {
  const next = RISK_ORDER[Math.min(riskRank(level) + 1, RISK_ORDER.length - 1)];
  return next ?? level;
}

export function bandForAqi(aqi: number): AqiBand {
  const clamped = Math.max(0, Math.round(aqi));
  const match = AQI_BANDS.find((band) => clamped <= band.aqiHigh);
  // Values above 500 remain in the most severe band.
  return match ?? AQI_BANDS[AQI_BANDS.length - 1]!;
}

interface Pm25Breakpoint {
  concentrationLow: number;
  concentrationHigh: number;
  aqiLow: number;
  aqiHigh: number;
}

/** EPA 24-hour PM2.5 breakpoints, effective 6 May 2024. */
const PM25_BREAKPOINTS: readonly Pm25Breakpoint[] = [
  { concentrationLow: 0.0, concentrationHigh: 9.0, aqiLow: 0, aqiHigh: 50 },
  { concentrationLow: 9.1, concentrationHigh: 35.4, aqiLow: 51, aqiHigh: 100 },
  { concentrationLow: 35.5, concentrationHigh: 55.4, aqiLow: 101, aqiHigh: 150 },
  { concentrationLow: 55.5, concentrationHigh: 125.4, aqiLow: 151, aqiHigh: 200 },
  { concentrationLow: 125.5, concentrationHigh: 225.4, aqiLow: 201, aqiHigh: 300 },
  { concentrationLow: 225.5, concentrationHigh: 325.4, aqiLow: 301, aqiHigh: 500 },
] as const;

/**
 * Converts a PM2.5 concentration (ug/m3) to a US AQI value using the EPA
 * piecewise-linear formula. Used only when the provider omits `us_aqi`.
 */
export function pm25ToUsAqi(concentration: number): number | null {
  if (!Number.isFinite(concentration) || concentration < 0) {
    return null;
  }

  // EPA truncates PM2.5 to one decimal place before applying the formula.
  const value = Math.floor(concentration * 10) / 10;

  for (const breakpoint of PM25_BREAKPOINTS) {
    if (value <= breakpoint.concentrationHigh) {
      const { concentrationLow, concentrationHigh, aqiLow, aqiHigh } = breakpoint;
      const slope = (aqiHigh - aqiLow) / (concentrationHigh - concentrationLow);
      return Math.round(slope * (value - concentrationLow) + aqiLow);
    }
  }

  // Above the published scale. Report the ceiling rather than extrapolating.
  return 500;
}
