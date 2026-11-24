import { describe, expect, it } from 'vitest';
import { markerPercent, SCALE_SEGMENTS } from './aqiScale';

describe('scale segments', () => {
  it('covers the published 0-500 scale with no gaps', () => {
    let lower = 0;
    for (const segment of SCALE_SEGMENTS) {
      expect(segment.upper).toBeGreaterThan(lower);
      lower = segment.upper;
    }
    expect(lower).toBe(500);
  });

  it('lists the bands from least to most severe', () => {
    expect(SCALE_SEGMENTS.map((segment) => segment.level)).toEqual([
      'good',
      'moderate',
      'sensitive-unhealthy',
      'unhealthy',
      'very-unhealthy',
      'hazardous',
    ]);
  });
});

describe('markerPercent', () => {
  it('places the ends of the scale at 0 and 100 percent', () => {
    expect(markerPercent(0)).toBe(0);
    expect(markerPercent(500)).toBeCloseTo(100, 5);
  });

  it('clamps values outside the published scale', () => {
    expect(markerPercent(-50)).toBe(0);
    expect(markerPercent(9999)).toBeCloseTo(100, 5);
  });

  it('increases monotonically across the whole range', () => {
    let previous = -1;
    for (let aqi = 0; aqi <= 500; aqi += 5) {
      const percent = markerPercent(aqi);
      expect(percent).toBeGreaterThan(previous);
      previous = percent;
    }
  });

  it('stays within bounds for every value on the scale', () => {
    for (let aqi = 0; aqi <= 500; aqi += 1) {
      const percent = markerPercent(aqi);
      expect(percent).toBeGreaterThanOrEqual(0);
      expect(percent).toBeLessThanOrEqual(100);
    }
  });

  it('puts a band boundary at the segment edge, not inside the next band', () => {
    // AQI 50 ends the first of six segments, four of weight 1 and two of 1.4.
    const firstSegmentShare = (1 / 6.8) * 100;
    expect(markerPercent(50)).toBeCloseTo(firstSegmentShare, 5);
  });

  it('places a mid-band reading inside its own segment', () => {
    const lower = markerPercent(150);
    const upper = markerPercent(200);
    const middle = markerPercent(175);

    expect(middle).toBeGreaterThan(lower);
    expect(middle).toBeLessThan(upper);
  });
});
