import { CATALOGUE, type CatalogueItem, type RecommendationContext } from './catalogue.js';
import { assessRisk, deriveGuardrails, resolveUsAqi } from './risk.js';
import type {
  CurrentAirQuality,
  HouseholdProfile,
  LocationInput,
  Recommendation,
  RiskAssessment,
} from '../types.js';

export const MIN_RECOMMENDATIONS = 4;
export const MAX_RECOMMENDATIONS = 6;

export const DISCLAIMER =
  'SmogWise gives general environmental-health guidance, not medical advice. Impact figures are estimates, not measurements of your personal exposure. If anyone has symptoms or an existing heart or lung condition, follow your local health authority and speak to a clinician.';

export interface PlanInputs {
  location: LocationInput;
  profile: HouseholdProfile;
  current: CurrentAirQuality;
}

export interface RulesPlan {
  summary: string;
  risk: RiskAssessment;
  /** Catalogue entries chosen for this household, in display order. */
  selected: CatalogueItem[];
  recommendations: Recommendation[];
}

/**
 * Projects a catalogue entry onto the wire shape, dropping the `applies`
 * predicate and `priority`, which are selection concerns the client never sees.
 *
 * Exported because the planner needs the same projection as its baseline
 * before model wording is merged on top. Two copies drifted apart once.
 */
export function toRecommendation(item: CatalogueItem): Recommendation {
  return {
    id: item.id,
    category: item.category,
    title: item.title,
    action: item.action,
    why: item.why,
    personalImpact: item.personalImpact,
    communityImpact: item.communityImpact,
    cost: item.cost,
    effort: item.effort,
    confidence: item.confidence,
  };
}

/**
 * Chooses which catalogue entries to show.
 *
 * Eligible items are ranked by priority, then spread across categories so the
 * plan covers more than one kind of action before it doubles up on any single
 * category.
 */
export function selectRecommendations(
  context: RecommendationContext,
): CatalogueItem[] {
  const eligible = CATALOGUE.filter((item) => item.applies(context)).sort(
    (a, b) => b.priority - a.priority,
  );

  const chosen: CatalogueItem[] = [];
  const usedCategories = new Set<string>();

  // First pass: the highest-priority item from each distinct category.
  for (const item of eligible) {
    if (chosen.length >= MAX_RECOMMENDATIONS) break;
    if (usedCategories.has(item.category)) continue;
    chosen.push(item);
    usedCategories.add(item.category);
  }

  // Second pass: fill remaining slots with the next highest priorities.
  for (const item of eligible) {
    if (chosen.length >= MAX_RECOMMENDATIONS) break;
    if (chosen.includes(item)) continue;
    chosen.push(item);
  }

  // Keep the final list in priority order rather than selection order.
  return chosen.sort((a, b) => b.priority - a.priority);
}

function describeAqi(current: CurrentAirQuality): string {
  const aqi = resolveUsAqi(current);
  if (aqi === null) {
    return 'There is no live reading for your area right now';
  }
  const measured = current.usAqi !== null ? 'US AQI' : 'US AQI estimated from PM2.5';
  return `${measured} is ${aqi}`;
}

export function buildSummary(
  location: LocationInput,
  profile: HouseholdProfile,
  current: CurrentAirQuality,
  risk: RiskAssessment,
): string {
  const parts: string[] = [];

  parts.push(`${describeAqi(current)} in ${location.name}, rated ${risk.label.toLowerCase()}.`);

  if (risk.escalatedForSensitivity) {
    parts.push(
      'Because your household includes someone more affected by particle pollution, this plan applies the next stricter level of precaution.',
    );
  }

  parts.push(risk.advice);

  if (profile.outdoorMinutes === 0) {
    parts.push(
      'You reported no planned outdoor time, so the plan focuses on indoor air.',
    );
  }

  return parts.join(' ');
}

/**
 * The deterministic plan. This runs on every request, with or without Bedrock,
 * and is the fallback whenever the model is unavailable or returns something
 * that fails validation.
 */
export function buildRulesPlan({ location, profile, current }: PlanInputs): RulesPlan {
  const risk = assessRisk(current, profile);
  const guardrails = deriveGuardrails(risk.effectiveLevel);
  const context: RecommendationContext = {
    profile,
    effectiveLevel: risk.effectiveLevel,
    guardrails,
  };

  const selected = selectRecommendations(context);

  return {
    summary: buildSummary(location, profile, current, risk),
    risk,
    selected,
    recommendations: selected.map(toRecommendation),
  };
}
