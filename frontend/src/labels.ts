import type {
  AgeGroup,
  Budget,
  CommuteMethod,
  ConfidenceLevel,
  CookingFuel,
  CostLevel,
  EffortLevel,
  RecommendationCategory,
  RiskLevel,
} from './types';

/**
 * Human-readable labels for every coded value.
 *
 * Accessibility note: risk is always conveyed as text through these labels.
 * Colour is a secondary cue only, so the interface still works for users with
 * colour vision deficiency or in high-contrast and monochrome modes.
 */

export const RISK_LABELS: Record<RiskLevel, string> = {
  good: 'Good',
  moderate: 'Moderate',
  'sensitive-unhealthy': 'Unhealthy for sensitive groups',
  unhealthy: 'Unhealthy',
  'very-unhealthy': 'Very unhealthy',
  hazardous: 'Hazardous',
};

/** Short glyph shown alongside the text label, never instead of it. */
export const RISK_GLYPHS: Record<RiskLevel, string> = {
  good: '●',
  moderate: '●●',
  'sensitive-unhealthy': '●●●',
  unhealthy: '●●●●',
  'very-unhealthy': '●●●●●',
  hazardous: '●●●●●●',
};

export const AGE_GROUP_LABELS: Record<AgeGroup, string> = {
  child: 'Children under 14',
  adult: 'Adults',
  'older-adult': 'Adults over 65',
  pregnant: 'Someone pregnant',
};

export const COMMUTE_LABELS: Record<CommuteMethod, string> = {
  car: 'Car',
  motorbike: 'Motorbike or scooter',
  'public-transport': 'Bus, metro, or train',
  walk: 'Walking',
  cycle: 'Cycling',
  'work-from-home': 'I stay at home',
};

export const COOKING_FUEL_LABELS: Record<CookingFuel, string> = {
  gas: 'Gas',
  electric: 'Electric or induction',
  biomass: 'Wood, coal, or dung',
};

export const BUDGET_LABELS: Record<Budget, string> = {
  low: 'Little or nothing to spend',
  medium: 'Some room to spend',
  high: 'Comfortable to invest',
};

export const CATEGORY_LABELS: Record<RecommendationCategory, string> = {
  routine: 'Daily routine',
  indoor: 'Indoor air',
  transport: 'Getting around',
  health: 'Health and protection',
};

export const COST_LABELS: Record<CostLevel, string> = {
  free: 'No cost',
  low: 'Low cost',
  medium: 'Moderate cost',
  high: 'Higher cost',
};

export const EFFORT_LABELS: Record<EffortLevel, string> = {
  easy: 'Easy',
  moderate: 'Some effort',
  hard: 'Demanding',
};

export const CONFIDENCE_LABELS: Record<ConfidenceLevel, string> = {
  high: 'Well established',
  medium: 'Reasonably supported',
  low: 'Limited evidence',
};

export const CATEGORY_ORDER: RecommendationCategory[] = [
  'health',
  'routine',
  'indoor',
  'transport',
];

/** Formats an ISO timestamp for display, tolerating an unparseable value. */
export function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return 'an unknown time';
  }
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
