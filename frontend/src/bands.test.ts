import { describe, expect, it } from 'vitest';
import { bandForAqi } from './bands';

/**
 * These boundaries must stay identical to `backend/src/domain/aqi.ts`.
 * The client derives bands only for the hourly forecast series, so a drift
 * here would colour the chart differently from the headline reading.
 */
describe('bandForAqi', () => {
  it.each([
    [0, 'good'],
    [50, 'good'],
    [51, 'moderate'],
    [100, 'moderate'],
    [101, 'sensitive-unhealthy'],
    [150, 'sensitive-unhealthy'],
    [151, 'unhealthy'],
    [200, 'unhealthy'],
    [201, 'very-unhealthy'],
    [300, 'very-unhealthy'],
    [301, 'hazardous'],
    [500, 'hazardous'],
  ])('maps AQI %i to %s', (aqi, expected) => {
    expect(bandForAqi(aqi)).toBe(expected);
  });

  it('keeps values above the published scale in the most severe band', () => {
    expect(bandForAqi(900)).toBe('hazardous');
  });

  it('treats negative input as the lowest band rather than throwing', () => {
    expect(bandForAqi(-20)).toBe('good');
  });

  it('rounds fractional values to the nearest whole index', () => {
    expect(bandForAqi(50.4)).toBe('good');
    expect(bandForAqi(50.6)).toBe('moderate');
  });

  it('never skips a band as the value climbs', () => {
    const order = [
      'good',
      'moderate',
      'sensitive-unhealthy',
      'unhealthy',
      'very-unhealthy',
      'hazardous',
    ];

    let previous = 0;
    for (let aqi = 0; aqi <= 500; aqi += 1) {
      const index = order.indexOf(bandForAqi(aqi));
      expect(index).toBeGreaterThanOrEqual(previous);
      expect(index - previous).toBeLessThanOrEqual(1);
      previous = index;
    }
  });
});
