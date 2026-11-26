import type { SafetyGuardrails } from '../risk.js';
import type {
  ConfidenceLevel,
  CostLevel,
  EffortLevel,
  HouseholdProfile,
  RecommendationCategory,
  RiskLevel,
} from '../../types.js';

export interface RecommendationContext {
  profile: HouseholdProfile;
  /** Band used for decisions, already escalated for sensitive households. */
  effectiveLevel: RiskLevel;
  guardrails: SafetyGuardrails;
}

export interface CatalogueItem {
  id: string;
  category: RecommendationCategory;
  title: string;
  action: string;
  why: string;
  personalImpact: string;
  communityImpact: string;
  cost: CostLevel;
  effort: EffortLevel;
  confidence: ConfidenceLevel;
  /**
   * Cuts pollution at its source rather than only shielding the household
   * from it. Closing a window protects you; not burning waste means there is
   * less smoke for anyone to breathe.
   *
   * The brief this project answers asks for low-emission routines and
   * sustainable alternatives, so the selector reserves a slot for one of
   * these. Without that reservation they rank below every protective item and
   * never appear at exactly the readings that bring people to the app.
   */
  reducesEmissions: boolean;
  /**
   * Safe and useful to publish in a shared community checklist, because the
   * action helps people beyond the household and discloses nothing about it.
   *
   * A field, not a phrase: this was previously inferred by matching
   * `communityImpact` against /^none directly/i, and that text is one of the
   * four fields the language model is allowed to reword. A reword from
   * "None directly." to "No direct effect on the area." silently promoted a
   * private item into a shared checklist.
   */
  communityBenefit: boolean;
  /** Higher values are offered first when more items qualify than fit. */
  priority: number;
  applies: (context: RecommendationContext) => boolean;
}
