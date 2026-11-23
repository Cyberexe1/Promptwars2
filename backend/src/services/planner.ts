import { getCurrentAirQuality } from './airQuality.js';
import { isBedrockEnabled, personalisePlan } from './bedrock.js';
import { buildRulesPlan, DISCLAIMER } from '../domain/recommend.js';
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
      recommendations: selected.map((item) => ({ ...toRecommendation(item) })),
      usedModel: false,
    };
  }

  const allowedIds = new Set(selected.map((item) => item.id));
  const byId = new Map(
    plan.recommendations
      .filter((entry) => allowedIds.has(entry.id))
      .map((entry) => [entry.id, entry] as const),
  );

  const recommendations = selected.map((item) => {
    const override = byId.get(item.id);
    const base = toRecommendation(item);

    if (!override) {
      return base;
    }

    return {
      ...base,
      action: chooseText(override.action, base.action, guardrails),
      why: chooseText(override.why, base.why, guardrails),
      personalImpact: chooseText(
        override.personalImpact,
        base.personalImpact,
        guardrails,
      ),
      communityImpact: chooseText(
        override.communityImpact,
        base.communityImpact,
        guardrails,
      ),
    };
  });

  return { recommendations, usedModel: byId.size > 0 };
}

function toRecommendation(item: CatalogueItem): Recommendation {
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
