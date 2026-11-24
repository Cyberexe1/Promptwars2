import type { Recommendation, RecommendationsResponse } from './types';

/**
 * Builds a shareable community checklist from a personal plan.
 *
 * The rule is subtractive. A plan is written for one household and its summary
 * can disclose that someone there is medically sensitive, so nothing from the
 * personal layer is carried across. What remains is the location, the public
 * air-quality band, and the actions that genuinely change the air on a shared
 * street.
 *
 * Excluded on purpose:
 *   - the plan summary, which may reference household sensitivity
 *   - `personalImpact`, which describes one household's exposure
 *   - `effectiveLevel`, which is escalated for sensitive households and so
 *     implies a health detail
 *   - any recommendation whose community effect is "none directly"
 */

/** Marks an item as having no shared benefit, so it is personal-only. */
const NO_COMMUNITY_EFFECT = /^none directly/i;

export interface CommunityItem {
  id: string;
  title: string;
  action: string;
  communityImpact: string;
}

export interface CommunityChecklist {
  locationName: string;
  /** The officially published band, never the escalated one. */
  officialBand: string;
  observedAt: string;
  sourceName: string;
  sourceUrl: string;
  items: CommunityItem[];
}

export function hasCommunityBenefit(recommendation: Recommendation): boolean {
  return !NO_COMMUNITY_EFFECT.test(recommendation.communityImpact.trim());
}

export function buildCommunityChecklist(
  locationName: string,
  plan: RecommendationsResponse,
): CommunityChecklist {
  return {
    locationName,
    officialBand: plan.risk.label,
    observedAt: plan.airQuality.current.observedAt,
    sourceName: plan.airQuality.source.name,
    sourceUrl: plan.airQuality.source.url,
    items: plan.recommendations.filter(hasCommunityBenefit).map((item) => ({
      id: item.id,
      title: item.title,
      action: item.action,
      communityImpact: item.communityImpact,
    })),
  };
}

/** Plain-text form, for pasting into a residents' or parents' group chat. */
export function formatChecklistAsText(checklist: CommunityChecklist): string {
  const lines: string[] = [
    `Clean-air actions for ${checklist.locationName}`,
    `Air quality today: ${checklist.officialBand}`,
    '',
  ];

  if (checklist.items.length === 0) {
    lines.push(
      'No shared actions apply today. Keep an eye on the reading and check again if conditions worsen.',
    );
  } else {
    checklist.items.forEach((item, index) => {
      lines.push(`${index + 1}. ${item.title}`);
      lines.push(`   ${item.action}`);
      lines.push(`   Why it helps the area: ${item.communityImpact}`);
      lines.push('');
    });
  }

  lines.push(`Source: ${checklist.sourceName} (${checklist.sourceUrl})`);
  lines.push('General environmental-health guidance, not medical advice.');

  return lines.join('\n');
}
