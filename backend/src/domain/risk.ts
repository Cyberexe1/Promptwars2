import { bandForAqi, escalate, isAtLeast, pm25ToUsAqi } from './aqi.js';
import type {
  AgeGroup,
  CurrentAirQuality,
  HouseholdProfile,
  RiskAssessment,
  RiskLevel,
} from '../types.js';

/** Age groups that the EPA treats as sensitive to particle pollution. */
const SENSITIVE_AGE_GROUPS: readonly AgeGroup[] = [
  'child',
  'older-adult',
  'pregnant',
] as const;

export function hasSensitiveMember(profile: HouseholdProfile): boolean {
  return (
    profile.sensitive ||
    profile.ageGroups.some((group) => SENSITIVE_AGE_GROUPS.includes(group))
  );
}

/**
 * Picks the AQI value to reason about: the provider's US AQI when present,
 * otherwise a PM2.5 conversion. Returns null when neither is available, which
 * callers must treat as "no live reading".
 */
export function resolveUsAqi(current: CurrentAirQuality): number | null {
  if (current.usAqi !== null && Number.isFinite(current.usAqi)) {
    return current.usAqi;
  }
  if (current.pm25 !== null) {
    return pm25ToUsAqi(current.pm25);
  }
  return null;
}

/**
 * Deterministic risk assessment. This is the only place that decides how severe
 * conditions are, so safety never depends on a language model.
 *
 * When a household includes a sensitive member, the effective band is one step
 * stricter than the public band. The published `level` still reports the real
 * measured band so the UI never misstates official air quality.
 */
export function assessRisk(
  current: CurrentAirQuality,
  profile?: HouseholdProfile,
): RiskAssessment {
  const aqi = resolveUsAqi(current);

  if (aqi === null) {
    // No usable reading. Fall back to the precautionary "sensitive" band and
    // say so plainly rather than implying the air is clean.
    return {
      level: 'sensitive-unhealthy',
      label: 'Unknown',
      advice:
        'No live air-quality reading is available for this location right now. Follow general winter-smog precautions and check your local authority.',
      effectiveLevel: 'sensitive-unhealthy',
      escalatedForSensitivity: false,
    };
  }

  const band = bandForAqi(aqi);
  const sensitive = profile ? hasSensitiveMember(profile) : false;
  const shouldEscalate = sensitive && band.level !== 'hazardous';
  const effectiveLevel: RiskLevel = shouldEscalate
    ? escalate(band.level)
    : band.level;

  return {
    level: band.level,
    label: band.label,
    advice: band.advice,
    effectiveLevel,
    escalatedForSensitivity: shouldEscalate && effectiveLevel !== band.level,
  };
}

/**
 * Hard safety constraints derived from the effective risk band. The
 * recommendation engine and the model-output validator both obey these, so no
 * generated text can suggest an activity the rules forbid.
 */
export interface SafetyGuardrails {
  allowStrenuousOutdoor: boolean;
  allowAnyOutdoorExercise: boolean;
  allowWindowVentilation: boolean;
  recommendMask: boolean;
  urgeIndoorShelter: boolean;
}

export function deriveGuardrails(level: RiskLevel): SafetyGuardrails {
  return {
    allowStrenuousOutdoor: !isAtLeast(level, 'sensitive-unhealthy'),
    allowAnyOutdoorExercise: !isAtLeast(level, 'unhealthy'),
    allowWindowVentilation: !isAtLeast(level, 'sensitive-unhealthy'),
    recommendMask: isAtLeast(level, 'sensitive-unhealthy'),
    urgeIndoorShelter: isAtLeast(level, 'very-unhealthy'),
  };
}
