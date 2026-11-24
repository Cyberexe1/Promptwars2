import type { RiskLevel } from './types';

/**
 * Geometry for the AQI scale bar.
 *
 * The six EPA bands do not cover equal AQI ranges, so each segment carries a
 * width weight. The top two bands span 100 and 200 AQI points respectively but
 * are given only a modest extra width, which keeps the lower bands, where most
 * real readings fall, readable.
 */
export interface ScaleSegment {
  level: RiskLevel;
  weight: number;
  upper: number;
}

export const SCALE_SEGMENTS: readonly ScaleSegment[] = [
  { level: 'good', weight: 1, upper: 50 },
  { level: 'moderate', weight: 1, upper: 100 },
  { level: 'sensitive-unhealthy', weight: 1, upper: 150 },
  { level: 'unhealthy', weight: 1, upper: 200 },
  { level: 'very-unhealthy', weight: 1.4, upper: 300 },
  { level: 'hazardous', weight: 1.4, upper: 500 },
] as const;

const TOTAL_WEIGHT = SCALE_SEGMENTS.reduce(
  (sum, segment) => sum + segment.weight,
  0,
);

/**
 * Position of a reading along the bar, as a percentage from 0 to 100.
 * Values outside 0–500 are clamped to the ends of the published scale.
 */
export function markerPercent(aqi: number): number {
  const clamped = Math.min(Math.max(aqi, 0), 500);
  let consumed = 0;
  let lower = 0;

  for (const segment of SCALE_SEGMENTS) {
    if (clamped <= segment.upper) {
      const within = (clamped - lower) / (segment.upper - lower);
      return ((consumed + within * segment.weight) / TOTAL_WEIGHT) * 100;
    }
    consumed += segment.weight;
    lower = segment.upper;
  }

  return 100;
}
