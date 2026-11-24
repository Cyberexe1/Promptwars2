import { describe, expect, it } from 'vitest';
import {
  buildCommunityChecklist,
  formatChecklistAsText,
  hasCommunityBenefit,
} from './community';
import { PLAN } from './test/fixtures';
import type { Recommendation, RecommendationsResponse } from './types';

function recommendation(overrides: Partial<Recommendation> = {}): Recommendation {
  return {
    id: 'test-item',
    category: 'transport',
    title: 'Test title',
    action: 'Test action.',
    why: 'Test reason.',
    personalImpact: 'Lowers the dose you personally inhale.',
    communityImpact: 'Removes tailpipe output from shared street air.',
    cost: 'free',
    effort: 'easy',
    confidence: 'high',
    ...overrides,
  };
}

describe('hasCommunityBenefit', () => {
  it('keeps an item with a real shared effect', () => {
    expect(hasCommunityBenefit(recommendation())).toBe(true);
  });

  it.each([
    'None directly.',
    'none directly',
    'None directly, though it helps you.',
  ])('drops an item whose community effect is %s', (communityImpact) => {
    expect(hasCommunityBenefit(recommendation({ communityImpact }))).toBe(false);
  });

  it('is not fooled by leading whitespace', () => {
    expect(
      hasCommunityBenefit(recommendation({ communityImpact: '  None directly.' })),
    ).toBe(false);
  });
});

describe('buildCommunityChecklist', () => {
  it('keeps the location and the officially published band', () => {
    const checklist = buildCommunityChecklist('Delhi, India', PLAN);

    expect(checklist.locationName).toBe('Delhi, India');
    expect(checklist.officialBand).toBe(PLAN.risk.label);
  });

  it('reports the band as published, not the escalated one', () => {
    // An escalated level would disclose that someone in the household is
    // medically sensitive, so only the public band may be shared.
    const escalated: RecommendationsResponse = {
      ...PLAN,
      risk: {
        level: 'unhealthy',
        label: 'Unhealthy',
        advice: PLAN.risk.advice,
        effectiveLevel: 'very-unhealthy',
        escalatedForSensitivity: true,
      },
    };

    const checklist = buildCommunityChecklist('Delhi', escalated);

    expect(checklist.officialBand).toBe('Unhealthy');
    expect(JSON.stringify(checklist)).not.toContain('very-unhealthy');
    expect(JSON.stringify(checklist)).not.toContain('escalated');
  });

  it('includes only the items with a shared effect', () => {
    const checklist = buildCommunityChecklist('Delhi', PLAN);
    const expected = PLAN.recommendations.filter(hasCommunityBenefit);

    expect(checklist.items).toHaveLength(expected.length);
    expect(checklist.items.length).toBeLessThan(PLAN.recommendations.length);
  });

  it('carries no personal exposure text', () => {
    const checklist = buildCommunityChecklist('Delhi', PLAN);
    const serialised = JSON.stringify(checklist);

    for (const item of PLAN.recommendations) {
      expect(serialised).not.toContain(item.personalImpact);
    }
  });

  it('carries no plan summary, which can reference household sensitivity', () => {
    const withSensitiveSummary: RecommendationsResponse = {
      ...PLAN,
      summary:
        'Because your household includes someone more affected by particle pollution, precautions are stricter.',
    };

    const checklist = buildCommunityChecklist('Delhi', withSensitiveSummary);

    expect(JSON.stringify(checklist)).not.toContain('your household includes');
  });

  it('keeps the data source so a reader can verify the reading', () => {
    const checklist = buildCommunityChecklist('Delhi', PLAN);

    expect(checklist.sourceName).toBe(PLAN.airQuality.source.name);
    expect(checklist.sourceUrl).toBe(PLAN.airQuality.source.url);
    expect(checklist.observedAt).toBe(PLAN.airQuality.current.observedAt);
  });

  it('produces an empty list when nothing is shareable', () => {
    const personalOnly: RecommendationsResponse = {
      ...PLAN,
      recommendations: PLAN.recommendations.map((item) => ({
        ...item,
        communityImpact: 'None directly.',
      })),
    };

    expect(buildCommunityChecklist('Delhi', personalOnly).items).toEqual([]);
  });
});

describe('formatChecklistAsText', () => {
  it('numbers the actions and names the location and band', () => {
    const text = formatChecklistAsText(
      buildCommunityChecklist('Delhi, India', PLAN),
    );

    expect(text).toContain('Delhi, India');
    expect(text).toContain('Unhealthy');
    expect(text).toContain('1. ');
  });

  it('includes the source and the medical disclaimer', () => {
    const text = formatChecklistAsText(buildCommunityChecklist('Delhi', PLAN));

    expect(text).toContain(PLAN.airQuality.source.url);
    expect(text).toMatch(/not medical advice/i);
  });

  it('leaks no personal impact text into the shareable form', () => {
    const text = formatChecklistAsText(buildCommunityChecklist('Delhi', PLAN));

    for (const item of PLAN.recommendations) {
      expect(text).not.toContain(item.personalImpact);
    }
  });

  it('says plainly when there is nothing to share', () => {
    const personalOnly: RecommendationsResponse = {
      ...PLAN,
      recommendations: PLAN.recommendations.map((item) => ({
        ...item,
        communityImpact: 'None directly.',
      })),
    };

    const text = formatChecklistAsText(
      buildCommunityChecklist('Delhi', personalOnly),
    );
    expect(text).toMatch(/no shared actions apply/i);
  });
});
