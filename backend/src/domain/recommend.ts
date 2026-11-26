import { CATALOGUE, type CatalogueItem, type RecommendationContext } from './catalogue.js';
import { assessRisk, deriveGuardrails, resolveUsAqi } from './risk.js';
import { describeTiming, type OutlookTiming } from './outlook.js';
import type {
  CurrentAirQuality,
  HouseholdProfile,
  LocationInput,
  Outlook,
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
  /**
   * The 24-hour forecast, when the provider supplied one.
   *
   * Optional, and the plan is complete without it. Supplying it replaces the
   * generic timing wording with the hour the forecast actually names, and
   * withdraws retiming advice entirely when no hour is cleaner.
   */
  outlook?: Outlook;
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
    // Code-owned, like category and cost: the model may reword the prose
    // fields but cannot change what an action is.
    reducesEmissions: item.reducesEmissions,
    communityBenefit: item.communityBenefit,
  };
}

/**
 * Chooses which catalogue entries to show.
 *
 * Eligible items are ranked by priority, then spread across categories so the
 * plan covers more than one kind of action before it doubles up on any single
 * category. The last slot is reserved for an action that reduces emissions.
 *
 * Why the reservation exists. Protective advice carries the highest priorities,
 * correctly: when the air is dangerous, "do not run outside" matters more than
 * "do not burn waste". But priority order alone meant that at an unhealthy
 * reading a household received six protective items and nothing that reduced
 * pollution, while at a clean reading the emission advice surfaced freely. The
 * app gave its sustainability guidance precisely when it was least needed. Two
 * always-applicable emission entries exist, so this slot can always be filled.
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

  // Second pass: fill remaining slots with the next highest priorities, but
  // stop one short so the reserved slot survives. Only the fill pass is held
  // back; the category pass above is never displaced, so no safety-critical
  // item can be crowded out by the reservation.
  const needsEmissionSlot = !chosen.some((item) => item.reducesEmissions);
  const fillLimit = needsEmissionSlot
    ? MAX_RECOMMENDATIONS - 1
    : MAX_RECOMMENDATIONS;

  for (const item of eligible) {
    if (chosen.length >= fillLimit) break;
    if (chosen.includes(item)) continue;
    chosen.push(item);
  }

  if (needsEmissionSlot) {
    const emissionItem = eligible.find(
      (item) => item.reducesEmissions && !chosen.includes(item),
    );
    if (emissionItem) {
      chosen.push(emissionItem);
    } else {
      // Nothing eligible reduces emissions. Spend the held-back slot normally
      // rather than returning a shorter plan than the household deserves.
      for (const item of eligible) {
        if (chosen.length >= MAX_RECOMMENDATIONS) break;
        if (chosen.includes(item)) continue;
        chosen.push(item);
      }
    }
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
export function buildRulesPlan({
  location,
  profile,
  current,
  outlook,
}: PlanInputs): RulesPlan {
  const risk = assessRisk(current, profile);
  const guardrails = deriveGuardrails(risk.effectiveLevel);
  const context: RecommendationContext = {
    profile,
    effectiveLevel: risk.effectiveLevel,
    guardrails,
  };

  const timing = describeTiming(outlook);
  const selected = selectRecommendations(context).map((item) =>
    retimeWithForecast(item, timing),
  );

  return {
    summary: buildSummary(location, profile, current, risk),
    risk,
    selected,
    recommendations: selected.map(toRecommendation),
  };
}

/**
 * Replaces generic timing wording with what the forecast actually says.
 *
 * Two catalogue entries tell the household to do something "in the early
 * afternoon". That was a fixed string written before the hourly forecast
 * existed, and the app has been computing and displaying the real cleanest
 * hour while still printing the guess in the advice. Worse, on a flat series,
 * which is the normal shape of severe smog, no hour is cleaner and the advice
 * was simply wrong.
 *
 * Still the rules engine's output: the substitution is computed here, not
 * asked of the model.
 */
function retimeWithForecast(
  item: CatalogueItem,
  timing: OutlookTiming | undefined,
): CatalogueItem {
  if (!timing) {
    return item;
  }

  if (item.id === 'shift-outdoor-activity') {
    if (timing.flat) {
      return {
        ...item,
        title: 'No cleaner hour ahead, so keep outdoor time short',
        action:
          'The next 12 hours are forecast at a similar level, so there is no cleaner window to move walks and errands into. Keep outdoor time as short as you can instead, and check again later in case the forecast improves.',
        why: 'Shifting activity only helps when some hours are genuinely cleaner than others. When the whole window sits at one level, cutting time spent outside is what reduces how much you breathe in.',
      };
    }

    const avoiding = timing.worstLabel
      ? `, and away from about ${timing.worstLabel}, the forecast peak`
      : '';
    return {
      ...item,
      action: `Shift walks, play, and errands towards ${timing.cleanestLabel}, the cleanest hour forecast in the next 12${avoiding}.`,
      why: `Winter smog rises and falls through the day as cold air traps traffic and burning emissions near the ground. For your location the next 12 hours are forecast cleanest around ${timing.cleanestLabel}.`,
    };
  }

  if (item.id === 'ventilate-at-cleanest-hours' && !timing.flat) {
    return {
      ...item,
      action: `Open windows wide for 5 to 10 minutes around ${timing.cleanestLabel}, the cleanest hour forecast today, then close them again.`,
    };
  }

  return item;
}
