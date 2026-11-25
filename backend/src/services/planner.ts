import { getCurrentAirQuality } from './airQuality.js';
import { isBedrockEnabled, personalisePlan } from './bedrock.js';
import { buildRulesPlan, DISCLAIMER, toRecommendation } from '../domain/recommend.js';
import { deriveGuardrails, type SafetyGuardrails } from '../domain/risk.js';
import type { ModelPlan } from '../schemas.js';
import type { CatalogueItem } from '../domain/catalogue.js';
import type {
  Recommendation,
  RecommendationsResponse,
} from '../types.js';
import type { RecommendationsRequest } from '../schemas.js';

/**
 * Phrases that would contradict a "no outdoor exertion" constraint. This is a
 * defence-in-depth text check, not the primary safeguard: the recommendation
 * set itself is chosen by the rules engine, so the model cannot add advice.
 * A field that trips this check is replaced with the reviewed catalogue text.
 */
const OUTDOOR_EXERTION_PATTERNS: readonly RegExp[] = [
  /\bgo (?:for a )?(?:run|jog|cycle|ride)\b/i,
  /\b(?:outdoor|outside)\s+(?:run|jog|workout|exercise|training|sport)/i,
  /\b(?:run|jog|cycle|exercise|train|work out)\s+(?:outdoors|outside)\b/i,
  /\bkeep (?:up )?your (?:usual )?(?:run|jogging|cycling|training)\b/i,
] as const;

export function violatesOutdoorConstraint(
  text: string,
  guardrails: SafetyGuardrails,
): boolean {
  if (guardrails.allowAnyOutdoorExercise) {
    return false;
  }
  return OUTDOOR_EXERTION_PATTERNS.some((pattern) => pattern.test(text));
}

/** Uses the model's text only when it is present and passes the safety check. */
function chooseText(
  candidate: string | undefined,
  fallback: string,
  guardrails: SafetyGuardrails,
): string {
  if (!candidate) {
    return fallback;
  }
  if (violatesOutdoorConstraint(candidate, guardrails)) {
    return fallback;
  }
  return candidate;
}

/**
 * Merges model wording onto the rules-selected items.
 *
 * The returned list always has exactly the ids the rules engine chose, in the
 * same order. Model entries with unknown ids are discarded.
 */
export function mergePlan(
  selected: CatalogueItem[],
  plan: ModelPlan | null,
  guardrails: SafetyGuardrails,
): { recommendations: Recommendation[]; usedModel: boolean } {
  if (!plan) {
    return {
      recommendations: selected.map(toRecommendation),
      usedModel: false,
    };
  }

  const allowedIds = new Set(selected.map((item) => item.id));
  const byId = new Map(
    plan.recommendations
      .filter((entry) => allowedIds.has(entry.id))
      .map((entry) => [entry.id, entry] as const),
  );

  // Counts fields the model actually contributed, not entries it echoed back.
  // A response can name every id correctly and still have every field rejected
  // by chooseText, in which case the user reads catalogue prose and the
  // provenance must say so.
  let acceptedFields = 0;
  const take = (
    candidate: string | undefined,
    fallback: string,
  ): string => {
    const chosen = chooseText(candidate, fallback, guardrails);
    if (chosen !== fallback) {
      acceptedFields += 1;
    }
    return chosen;
  };

  const recommendations = selected.map((item) => {
    const override = byId.get(item.id);
    const base = toRecommendation(item);

    if (!override) {
      return base;
    }

    return {
      ...base,
      action: take(override.action, base.action),
      why: take(override.why, base.why),
      personalImpact: take(override.personalImpact, base.personalImpact),
      communityImpact: take(override.communityImpact, base.communityImpact),
    };
  });

  return { recommendations, usedModel: acceptedFields > 0 };
}

/**
 * Full recommendation flow: live reading, deterministic assessment, optional
 * model personalisation, then a response that always carries its provenance.
 */
export async function createPlan(
  request: RecommendationsRequest,
): Promise<RecommendationsResponse> {
  const { location, profile } = request;
  const reading = await getCurrentAirQuality(location.latitude, location.longitude);

  const rules = buildRulesPlan({
    location,
    profile,
    current: reading.current,
  });
  const guardrails = deriveGuardrails(rules.risk.effectiveLevel);

  let modelPlan: ModelPlan | null = null;
  if (isBedrockEnabled()) {
    modelPlan = await personalisePlan({
      location,
      profile,
      current: reading.current,
      riskLabel: rules.risk.label,
      escalatedForSensitivity: rules.risk.escalatedForSensitivity,
      guardrails,
      selected: rules.selected,
    });
  }

  const merged = mergePlan(rules.selected, modelPlan, guardrails);

  const summary =
    modelPlan && merged.usedModel
      ? chooseText(modelPlan.summary, rules.summary, guardrails)
      : rules.summary;

  return {
    summary,
    risk: rules.risk,
    recommendations: merged.recommendations,
    generatedBy: merged.usedModel ? 'bedrock' : 'rules',
    disclaimer: DISCLAIMER,
    airQuality: {
      current: reading.current,
      source: reading.source,
      stale: reading.stale,
    },
  };
}
