import { getCurrentAirQuality } from './airQuality.js';
import { isBedrockEnabled, personalisePlan } from './bedrock.js';
import { buildRulesPlan, DISCLAIMER, toRecommendation } from '../domain/recommend.js';
import { describeTiming } from '../domain/outlook.js';
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

/**
 * Decides whether the model's text for one field is used.
 *
 * `accepted` means the model supplied text and it passed the safety check. It
 * does not mean the text differs from the catalogue. A model told to keep the
 * meaning of reviewed advice will often return it unchanged, and that is the
 * model's output being used, not the rules engine's.
 */
function acceptModelText(
  candidate: string | undefined,
  fallback: string,
  guardrails: SafetyGuardrails,
): { text: string; accepted: boolean } {
  if (!candidate || violatesOutdoorConstraint(candidate, guardrails)) {
    return { text: fallback, accepted: false };
  }
  return { text: candidate, accepted: true };
}

/** Uses the model's text only when it is present and passes the safety check. */
function chooseText(
  candidate: string | undefined,
  fallback: string,
  guardrails: SafetyGuardrails,
): string {
  return acceptModelText(candidate, fallback, guardrails).text;
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

  // Counts fields whose model text passed the safety check, not entries the
  // model merely named. A response can list every id correctly and still have
  // every field rejected, in which case the user reads catalogue prose and the
  // provenance must say so.
  //
  // What it must not count is "text that differs from the catalogue". An
  // earlier version did, on the reasoning that unchanged text means the rules
  // engine wrote it. But the model is instructed to keep the meaning of
  // reviewed advice, so it often returns the wording verbatim, and that
  // version labelled those plans `rules` and, because the personalised summary
  // is only used when this is true, threw the summary away too. Caught on the
  // live site, where seven of eight plans had silently stopped using Bedrock.
  let acceptedFields = 0;
  const take = (
    candidate: string | undefined,
    fallback: string,
  ): string => {
    const { text, accepted } = acceptModelText(candidate, fallback, guardrails);
    if (accepted) {
      acceptedFields += 1;
    }
    return text;
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
    ...(reading.outlook ? { outlook: reading.outlook } : {}),
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
      // The forecast shape is the one piece of context that needs
      // interpreting rather than looking up, so the model is told about it.
      // It still cannot change which advice appears or what time is named:
      // the retimed wording is already in `selected`.
      ...(describeTiming(reading.outlook)
        ? { timing: describeTiming(reading.outlook)! }
        : {}),
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
