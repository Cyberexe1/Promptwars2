import { describe, expect, it } from 'vitest';
import {
  AQI_BANDS,
  bandForAqi,
  escalate,
  isAtLeast,
  pm25ToUsAqi,
  riskRank,
} from '../src/domain/aqi.js';

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
  ])('maps AQI %i to the %s band', (aqi, expected) => {
    expect(bandForAqi(aqi).level).toBe(expected);
  });

  it('keeps values above the published scale in the most severe band', () => {
    expect(bandForAqi(900).level).toBe('hazardous');
  });

  it('treats negative input as the lowest band rather than throwing', () => {
    expect(bandForAqi(-10).level).toBe('good');
  });

  it('covers the full 0-500 range with no gaps between bands', () => {
    for (let index = 1; index < AQI_BANDS.length; index += 1) {
      const previous = AQI_BANDS[index - 1]!;
      const current = AQI_BANDS[index]!;
      expect(current.aqiLow).toBe(previous.aqiHigh + 1);
    }
  });
});

describe('pm25ToUsAqi', () => {
  // Breakpoints per the EPA revision effective 6 May 2024.
  it('places the top of the Good band at 9.0 ug/m3', () => {
    expect(pm25ToUsAqi(9.0)).toBe(50);
  });

  it('starts the Moderate band just above 9.0 ug/m3', () => {
    expect(bandForAqi(pm25ToUsAqi(9.1)!).level).toBe('moderate');
  });

  it.each([
    [35.4, 100],
    [55.4, 150],
    [125.4, 200],
    [225.4, 300],
  ])('maps the %f ug/m3 breakpoint to AQI %i', (concentration, expected) => {
    expect(pm25ToUsAqi(concentration)).toBe(expected);
  });

  it('reports zero concentration as zero', () => {
    expect(pm25ToUsAqi(0)).toBe(0);
  });

  it('caps at 500 above the published scale', () => {
    expect(pm25ToUsAqi(1000)).toBe(500);
  });

  it('rejects invalid input', () => {
    expect(pm25ToUsAqi(-1)).toBeNull();
    expect(pm25ToUsAqi(Number.NaN)).toBeNull();
  });

  it('increases monotonically across the scale', () => {
    let previous = -1;
    for (let pm = 0; pm <= 300; pm += 0.5) {
      const aqi = pm25ToUsAqi(pm)!;
      expect(aqi).toBeGreaterThanOrEqual(previous);
      previous = aqi;
    }
  });
});

describe('severity helpers', () => {
  it('orders bands from good to hazardous', () => {
    expect(riskRank('good')).toBeLessThan(riskRank('moderate'));
    expect(riskRank('unhealthy')).toBeLessThan(riskRank('hazardous'));
  });

  it('compares against a threshold inclusively', () => {
    expect(isAtLeast('unhealthy', 'unhealthy')).toBe(true);
    expect(isAtLeast('moderate', 'unhealthy')).toBe(false);
  });

  it('escalates one band and stops at the top', () => {
    expect(escalate('good')).toBe('moderate');
    expect(escalate('unhealthy')).toBe('very-unhealthy');
    expect(escalate('hazardous')).toBe('hazardous');
  });
});
