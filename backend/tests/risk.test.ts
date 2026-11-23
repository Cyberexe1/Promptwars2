import { describe, expect, it } from 'vitest';
import {
  assessRisk,
  deriveGuardrails,
  hasSensitiveMember,
  resolveUsAqi,
} from '../src/domain/risk.js';
import type { CurrentAirQuality, HouseholdProfile } from '../src/types.js';

function reading(overrides: Partial<CurrentAirQuality> = {}): CurrentAirQuality {
  return {
    usAqi: 40,
    europeanAqi: 20,
    pm25: 8,
    pm10: 14,
    nitrogenDioxide: 12,
    ozone: 30,
    observedAt: new Date().toISOString(),
    ...overrides,
  };
}

function profile(overrides: Partial<HouseholdProfile> = {}): HouseholdProfile {
  return {
    ageGroups: ['adult'],
    sensitive: false,
    commuteMethod: 'public-transport',
    outdoorMinutes: 60,
    cookingFuel: 'electric',
    purifier: false,
    budget: 'medium',
    ...overrides,
  };
}

describe('resolveUsAqi', () => {
  it('prefers the provider US AQI when present', () => {
    expect(resolveUsAqi(reading({ usAqi: 173, pm25: 5 }))).toBe(173);
  });

  it('falls back to a PM2.5 conversion when US AQI is missing', () => {
    expect(resolveUsAqi(reading({ usAqi: null, pm25: 9.0 }))).toBe(50);
  });

  it('returns null when neither value is available', () => {
    expect(resolveUsAqi(reading({ usAqi: null, pm25: null }))).toBeNull();
  });
});

describe('hasSensitiveMember', () => {
  it('is true for a declared sensitivity', () => {
    expect(hasSensitiveMember(profile({ sensitive: true }))).toBe(true);
  });

  it.each(['child', 'older-adult', 'pregnant'] as const)(
    'is true when the household includes a %s',
    (group) => {
      expect(hasSensitiveMember(profile({ ageGroups: [group] }))).toBe(true);
    },
  );

  it('is false for healthy adults only', () => {
    expect(hasSensitiveMember(profile({ ageGroups: ['adult'] }))).toBe(false);
  });
});

describe('assessRisk', () => {
  it('reports the official band for a household with no sensitivity', () => {
    const risk = assessRisk(reading({ usAqi: 120 }), profile());
    expect(risk.level).toBe('sensitive-unhealthy');
    expect(risk.effectiveLevel).toBe('sensitive-unhealthy');
    expect(risk.escalatedForSensitivity).toBe(false);
  });

  it('applies one stricter band for a sensitive household', () => {
    const risk = assessRisk(reading({ usAqi: 120 }), profile({ sensitive: true }));
    expect(risk.level).toBe('sensitive-unhealthy');
    expect(risk.effectiveLevel).toBe('unhealthy');
    expect(risk.escalatedForSensitivity).toBe(true);
  });

  it('never misreports the official band when escalating', () => {
    const risk = assessRisk(reading({ usAqi: 60 }), profile({ ageGroups: ['child'] }));
    expect(risk.level).toBe('moderate');
    expect(risk.label).toBe('Moderate');
    expect(risk.effectiveLevel).toBe('sensitive-unhealthy');
  });

  it('does not escalate beyond the top band', () => {
    const risk = assessRisk(reading({ usAqi: 420 }), profile({ sensitive: true }));
    expect(risk.level).toBe('hazardous');
    expect(risk.effectiveLevel).toBe('hazardous');
    expect(risk.escalatedForSensitivity).toBe(false);
  });

  it('is precautionary and labelled Unknown when no reading exists', () => {
    const risk = assessRisk(reading({ usAqi: null, pm25: null }), profile());
    expect(risk.label).toBe('Unknown');
    expect(risk.effectiveLevel).toBe('sensitive-unhealthy');
    expect(risk.advice).toMatch(/no live air-quality reading/i);
  });
});

describe('deriveGuardrails', () => {
  it('allows normal activity in clean air', () => {
    const guardrails = deriveGuardrails('good');
    expect(guardrails.allowStrenuousOutdoor).toBe(true);
    expect(guardrails.allowWindowVentilation).toBe(true);
    expect(guardrails.recommendMask).toBe(false);
  });

  it('stops strenuous activity from the sensitive band upward', () => {
    expect(deriveGuardrails('sensitive-unhealthy').allowStrenuousOutdoor).toBe(false);
    expect(deriveGuardrails('sensitive-unhealthy').allowAnyOutdoorExercise).toBe(true);
  });

  it('stops all outdoor exercise from the unhealthy band upward', () => {
    for (const level of ['unhealthy', 'very-unhealthy', 'hazardous'] as const) {
      expect(deriveGuardrails(level).allowAnyOutdoorExercise).toBe(false);
      expect(deriveGuardrails(level).allowStrenuousOutdoor).toBe(false);
    }
  });

  it('advises closing windows and wearing a respirator once air is poor', () => {
    const guardrails = deriveGuardrails('unhealthy');
    expect(guardrails.allowWindowVentilation).toBe(false);
    expect(guardrails.recommendMask).toBe(true);
  });

  it('urges indoor shelter only at the most severe bands', () => {
    expect(deriveGuardrails('unhealthy').urgeIndoorShelter).toBe(false);
    expect(deriveGuardrails('very-unhealthy').urgeIndoorShelter).toBe(true);
  });
});
