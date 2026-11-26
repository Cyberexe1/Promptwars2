import { describe, expect, it } from 'vitest';
import {
  buildRulesPlan,
  MAX_RECOMMENDATIONS,
  MIN_RECOMMENDATIONS,
  selectRecommendations,
} from '../src/domain/recommend.js';
import { CATALOGUE, findCatalogueItem } from '../src/domain/catalogue.js';
import { deriveGuardrails } from '../src/domain/risk.js';
import { pm25ToUsAqi } from '../src/domain/aqi.js';
import { buildOutlook, describeTiming } from '../src/domain/outlook.js';
import type {
  AgeGroup,
  Budget,
  CommuteMethod,
  CookingFuel,
  CurrentAirQuality,
  HouseholdProfile,
  Outlook,
  RiskLevel,
} from '../src/types.js';

const LOCATION = { name: 'Test City', latitude: 28.6, longitude: 77.2 };

/** Representative AQI value inside each band. */
const AQI_BY_LEVEL: Record<RiskLevel, number> = {
  good: 25,
  moderate: 75,
  'sensitive-unhealthy': 125,
  unhealthy: 175,
  'very-unhealthy': 250,
  hazardous: 350,
};

function reading(usAqi: number): CurrentAirQuality {
  return {
    usAqi,
    europeanAqi: null,
    pm25: 20,
    pm10: 40,
    nitrogenDioxide: 30,
    ozone: 25,
    observedAt: new Date().toISOString(),
  };
}

function profile(overrides: Partial<HouseholdProfile> = {}): HouseholdProfile {
  return {
    ageGroups: ['adult'],
    sensitive: false,
    commuteMethod: 'car',
    outdoorMinutes: 60,
    cookingFuel: 'gas',
    purifier: false,
    budget: 'medium',
    ...overrides,
  };
}

describe('catalogue integrity', () => {
  it('has unique ids', () => {
    const ids = CATALOGUE.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every entry both a personal and a community impact statement', () => {
    for (const item of CATALOGUE) {
      expect(item.personalImpact.length).toBeGreaterThan(0);
      expect(item.communityImpact.length).toBeGreaterThan(0);
    }
  });

  it('never claims a precise percentage reduction', () => {
    for (const item of CATALOGUE) {
      const text = `${item.action} ${item.why} ${item.personalImpact} ${item.communityImpact}`;
      expect(text).not.toMatch(/\d+\s?%/);
    }
  });
});

/**
 * Exhaustive sweep over every household shape at every risk band. This is the
 * guarantee that the rules engine always produces a usable, safe plan rather
 * than an empty or self-contradicting one.
 */
describe('selectRecommendations across every profile and band', () => {
  const ageGroupSets: AgeGroup[][] = [
    ['adult'],
    ['child'],
    ['older-adult'],
    ['pregnant'],
    ['child', 'adult', 'older-adult', 'pregnant'],
  ];
  const commutes: CommuteMethod[] = [
    'car',
    'motorbike',
    'public-transport',
    'walk',
    'cycle',
    'work-from-home',
  ];
  const fuels: CookingFuel[] = ['gas', 'electric', 'biomass'];
  const budgets: Budget[] = ['low', 'medium', 'high'];
  const levels = Object.keys(AQI_BY_LEVEL) as RiskLevel[];

  const cases = levels.flatMap((level) =>
    ageGroupSets.flatMap((ageGroups) =>
      commutes.flatMap((commuteMethod) =>
        fuels.flatMap((cookingFuel) =>
          budgets.flatMap((budget) =>
            [true, false].flatMap((purifier) =>
              [0, 90].flatMap((outdoorMinutes) =>
                [true, false].map((sensitive) => ({
                  level,
                  profile: profile({
                    ageGroups,
                    commuteMethod,
                    cookingFuel,
                    budget,
                    purifier,
                    outdoorMinutes,
                    sensitive,
                  }),
                })),
              ),
            ),
          ),
        ),
      ),
    ),
  );

  it('covers a broad matrix of households', () => {
    expect(cases.length).toBeGreaterThan(1000);
  });

  it('always returns between the minimum and maximum number of items', () => {
    for (const testCase of cases) {
      const plan = buildRulesPlan({
        location: LOCATION,
        profile: testCase.profile,
        current: reading(AQI_BY_LEVEL[testCase.level]),
      });

      expect(plan.recommendations.length).toBeGreaterThanOrEqual(
        MIN_RECOMMENDATIONS,
      );
      expect(plan.recommendations.length).toBeLessThanOrEqual(MAX_RECOMMENDATIONS);
    }
  });

  it('never repeats a recommendation within a plan', () => {
    for (const testCase of cases) {
      const plan = buildRulesPlan({
        location: LOCATION,
        profile: testCase.profile,
        current: reading(AQI_BY_LEVEL[testCase.level]),
      });
      const ids = plan.recommendations.map((item) => item.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('never suggests both opening and closing windows', () => {
    for (const testCase of cases) {
      const plan = buildRulesPlan({
        location: LOCATION,
        profile: testCase.profile,
        current: reading(AQI_BY_LEVEL[testCase.level]),
      });
      const ids = plan.recommendations.map((item) => item.id);
      const conflicting =
        ids.includes('ventilate-at-cleanest-hours') &&
        ids.includes('keep-windows-closed');
      expect(conflicting).toBe(false);
    }
  });

  it('never suggests a better time to be outdoors once exercise must stop', () => {
    const severe = cases.filter((testCase) =>
      ['unhealthy', 'very-unhealthy', 'hazardous'].includes(testCase.level),
    );

    for (const testCase of severe) {
      const plan = buildRulesPlan({
        location: LOCATION,
        profile: testCase.profile,
        current: reading(AQI_BY_LEVEL[testCase.level]),
      });
      const ids = plan.recommendations.map((item) => item.id);
      expect(ids).not.toContain('shift-outdoor-activity');
      expect(ids).not.toContain('soften-outdoor-exercise');
    }
  });

  // The brief this project answers asks for low-emission routines and
  // sustainable alternatives, not only protection. Priority order alone used
  // to bury every emission action below every protective one, so a household
  // at an unhealthy reading got six ways to avoid the air and no way to
  // improve it. These two tests are what stop that returning.
  it('always includes at least one action that reduces emissions', () => {
    for (const testCase of cases) {
      const plan = buildRulesPlan({
        location: LOCATION,
        profile: testCase.profile,
        current: reading(AQI_BY_LEVEL[testCase.level]),
      });

      const emissionActions = plan.recommendations.filter(
        (item) => item.reducesEmissions,
      );

      expect(
        emissionActions.length,
        `no emission-reducing action for ${testCase.level} / ${JSON.stringify(testCase.profile)}`,
      ).toBeGreaterThan(0);
    }
  });

  it('still includes one at the worst readings, where protection dominates', () => {
    const severe = cases.filter((testCase) =>
      ['unhealthy', 'very-unhealthy', 'hazardous'].includes(testCase.level),
    );
    expect(severe.length).toBeGreaterThan(0);

    for (const testCase of severe) {
      const plan = buildRulesPlan({
        location: LOCATION,
        profile: testCase.profile,
        current: reading(AQI_BY_LEVEL[testCase.level]),
      });
      expect(
        plan.recommendations.some((item) => item.reducesEmissions),
      ).toBe(true);
    }
  });
});

describe('timing advice follows the forecast', () => {
  const OUTDOOR_PROFILE = {
    ageGroups: ['adult'] as AgeGroup[],
    sensitive: false,
    commuteMethod: 'walk' as CommuteMethod,
    outdoorMinutes: 60,
    cookingFuel: 'gas' as CookingFuel,
    purifier: false,
    budget: 'medium' as Budget,
  };

  function planWithOutlook(aqi: number, outlook: Outlook | undefined) {
    return buildRulesPlan({
      location: LOCATION,
      profile: OUTDOOR_PROFILE,
      current: reading(aqi),
      ...(outlook ? { outlook } : {}),
    });
  }

  function outlookFrom(values: number[], utcOffsetSeconds = 0): Outlook {
    const hourMs = 60 * 60 * 1000;
    const base = Math.floor(Date.now() / hourMs) * hourMs;
    return buildOutlook(
      {
        time: values.map((_, i) => (base + i * hourMs) / 1000),
        usAqi: values,
        utcOffsetSeconds,
      },
      base,
    )!;
  }

  it('names the forecast cleanest hour instead of a fixed time of day', () => {
    const plan = planWithOutlook(80, outlookFrom([90, 88, 40, 95, 92, 91]));
    const shift = plan.recommendations.find(
      (item) => item.id === 'shift-outdoor-activity',
    );

    expect(shift).toBeDefined();
    expect(shift!.action).not.toMatch(/early afternoon/i);
    expect(shift!.action).toMatch(/cleanest hour forecast/i);
  });

  it('withdraws the advice when no hour ahead is cleaner', () => {
    // A flat series is the usual shape of severe smog, and the old fixed
    // wording told people to go out at a time that was no better.
    const plan = planWithOutlook(80, outlookFrom([184, 186, 183, 190, 188]));
    const shift = plan.recommendations.find(
      (item) => item.id === 'shift-outdoor-activity',
    );

    expect(shift).toBeDefined();
    expect(shift!.action).toMatch(/no cleaner window/i);
    expect(shift!.action).not.toMatch(/\d(am|pm)/i);
  });

  it('keeps the reviewed wording when there is no forecast at all', () => {
    const plan = planWithOutlook(80, undefined);
    const shift = plan.recommendations.find(
      (item) => item.id === 'shift-outdoor-activity',
    );

    expect(shift!.action).toMatch(/early afternoon/i);
  });

  it('never invents an hour the forecast did not name', () => {
    const outlook = outlookFrom([90, 88, 40, 95], 0);
    const timing = describeTiming(outlook)!;
    const allowed = new Set(
      [timing.cleanestLabel, timing.worstLabel]
        .filter((label): label is string => label !== null)
        .map((label) => label.toLowerCase()),
    );

    const plan = planWithOutlook(80, outlook);
    for (const item of plan.recommendations) {
      for (const hour of item.action.match(/\d{1,2}(am|pm)/gi) ?? []) {
        expect(allowed).toContain(hour.toLowerCase());
      }
    }
  });
});

describe('budget changes the plan', () => {
  // `budget` was read in exactly one place in the whole domain layer, to offer
  // a low-cost filter build. `medium` and `high` produced byte-identical
  // plans, so a user toggling that choice saw nothing happen.
  function idsForBudget(budget: Budget): string[] {
    return buildRulesPlan({
      location: LOCATION,
      profile: {
        ageGroups: ['child', 'adult'],
        sensitive: false,
        commuteMethod: 'public-transport',
        outdoorMinutes: 60,
        cookingFuel: 'gas',
        purifier: false,
        budget,
      },
      current: reading(160),
    }).recommendations.map((item) => item.id);
  }

  it('gives a different plan at each budget level', () => {
    const low = idsForBudget('low');
    const medium = idsForBudget('medium');
    const high = idsForBudget('high');

    expect(low).not.toEqual(medium);
    expect(medium).not.toEqual(high);
    expect(low).not.toEqual(high);
  });

  it('matches the spending advice to what the household can spend', () => {
    expect(idsForBudget('low')).toContain('low-cost-filter-box');
    expect(idsForBudget('medium')).toContain('buy-room-purifier');
    expect(idsForBudget('high')).toContain('induction-instead-of-gas');
  });

  it('never advises buying a purifier to someone who has one', () => {
    for (const budget of ['low', 'medium', 'high'] as Budget[]) {
      const ids = buildRulesPlan({
        location: LOCATION,
        profile: {
          ageGroups: ['adult'],
          sensitive: false,
          commuteMethod: 'walk',
          outdoorMinutes: 30,
          cookingFuel: 'gas',
          purifier: true,
          budget,
        },
        current: reading(160),
      }).recommendations.map((item) => item.id);

      expect(ids).not.toContain('buy-room-purifier');
      expect(ids).not.toContain('low-cost-filter-box');
    }
  });
});

describe('catalogue flags', () => {
  it('marks exactly the entries that cut pollution at source', () => {
    const emission = CATALOGUE.filter((item) => item.reducesEmissions).map(
      (item) => item.id,
    );
    // Pinned deliberately. Adding an entry here is a claim that the action
    // reduces what is emitted, not merely what the household breathes, and
    // that claim should be made on purpose rather than by habit.
    expect(emission.sort()).toEqual(
      [
        'induction-instead-of-gas',
        'move-off-biomass',
        'no-idling',
        'no-waste-burning',
        'reduce-indoor-smoke',
        'swap-car-trips',
      ].sort(),
    );
  });

  it('keeps at least two emission actions applicable to every household', () => {
    // The reserved slot can only be honoured if something always qualifies.
    const alwaysApplicable = CATALOGUE.filter(
      (item) =>
        item.reducesEmissions &&
        item.applies({
          profile: {
            ageGroups: ['adult'],
            sensitive: false,
            commuteMethod: 'work-from-home',
            outdoorMinutes: 0,
            cookingFuel: 'electric',
            purifier: true,
            budget: 'high',
          },
          effectiveLevel: 'hazardous',
          guardrails: deriveGuardrails('hazardous'),
        }),
    );
    expect(alwaysApplicable.length).toBeGreaterThanOrEqual(2);
  });

  it('never marks an item community-shareable without a shared effect', () => {
    for (const item of CATALOGUE) {
      if (item.communityBenefit) {
        expect(item.communityImpact.toLowerCase()).not.toMatch(
          /^none directly\.?$/,
        );
      }
    }
  });
});

describe('safety-critical selections', () => {
  it('tells everyone to stop outdoor exercise once the air is unhealthy', () => {
    const plan = buildRulesPlan({
      location: LOCATION,
      profile: profile(),
      current: reading(AQI_BY_LEVEL.unhealthy),
    });
    expect(plan.recommendations.map((item) => item.id)).toContain(
      'pause-outdoor-exercise',
    );
  });

  it('reaches that same advice earlier for a sensitive household', () => {
    // AQI 125 is officially "unhealthy for sensitive groups". A sensitive
    // household is escalated to "unhealthy", where exercise stops.
    const plan = buildRulesPlan({
      location: LOCATION,
      profile: profile({ sensitive: true }),
      current: reading(125),
    });
    expect(plan.risk.level).toBe('sensitive-unhealthy');
    expect(plan.risk.effectiveLevel).toBe('unhealthy');
    expect(plan.recommendations.map((item) => item.id)).toContain(
      'pause-outdoor-exercise',
    );
  });

  it('does not stop a healthy adult exercising at the same reading', () => {
    const plan = buildRulesPlan({
      location: LOCATION,
      profile: profile(),
      current: reading(125),
    });
    const ids = plan.recommendations.map((item) => item.id);

    expect(ids).not.toContain('pause-outdoor-exercise');
    // The plan should still address their outdoor time, through timing or
    // intensity. Which of the two is shown is a ranking decision.
    expect(
      ids.some((id) =>
        ['shift-outdoor-activity', 'soften-outdoor-exercise'].includes(id),
      ),
    ).toBe(true);
  });

  it('makes softer exercise eligible exactly where strenuous effort stops', () => {
    const soften = findCatalogueItem('soften-outdoor-exercise')!;
    const context = (level: RiskLevel) => ({
      profile: profile(),
      effectiveLevel: level,
      guardrails: deriveGuardrails(level),
    });

    expect(soften.applies(context('moderate'))).toBe(false);
    expect(soften.applies(context('sensitive-unhealthy'))).toBe(true);
    expect(soften.applies(context('unhealthy'))).toBe(false);
  });

  it('only recommends a respirator when the band warrants one', () => {
    const clean = buildRulesPlan({
      location: LOCATION,
      profile: profile(),
      current: reading(AQI_BY_LEVEL.good),
    });
    expect(clean.recommendations.map((item) => item.id)).not.toContain(
      'well-fitted-mask',
    );

    const smoggy = buildRulesPlan({
      location: LOCATION,
      profile: profile(),
      current: reading(AQI_BY_LEVEL.unhealthy),
    });
    expect(smoggy.recommendations.map((item) => item.id)).toContain(
      'well-fitted-mask',
    );
  });

  it('prioritises replacing biomass cooking', () => {
    const plan = buildRulesPlan({
      location: LOCATION,
      profile: profile({ cookingFuel: 'biomass' }),
      current: reading(AQI_BY_LEVEL.moderate),
    });
    expect(plan.recommendations.map((item) => item.id)).toContain('move-off-biomass');
  });

  it('offers a low-cost filter only to a low budget without a purifier', () => {
    const filterBox = findCatalogueItem('low-cost-filter-box')!;
    const guardrails = deriveGuardrails('unhealthy');

    expect(
      filterBox.applies({
        profile: profile({ budget: 'low', purifier: false }),
        effectiveLevel: 'unhealthy',
        guardrails,
      }),
    ).toBe(true);

    for (const profileOverride of [
      { budget: 'low' as const, purifier: true },
      { budget: 'high' as const, purifier: false },
    ]) {
      expect(
        filterBox.applies({
          profile: profile(profileOverride),
          effectiveLevel: 'unhealthy',
          guardrails,
        }),
      ).toBe(false);
    }
  });

  it('never suggests buying filtration to someone who already has a purifier', () => {
    const plan = buildRulesPlan({
      location: LOCATION,
      profile: profile({ budget: 'low', purifier: true }),
      current: reading(AQI_BY_LEVEL.unhealthy),
    });
    const ids = plan.recommendations.map((item) => item.id);

    expect(ids).not.toContain('low-cost-filter-box');
    expect(ids).toContain('purifier-maintenance');
  });

  it('keeps every selected item consistent with the derived guardrails', () => {
    for (const level of Object.keys(AQI_BY_LEVEL) as RiskLevel[]) {
      const guardrails = deriveGuardrails(level);
      const selected = selectRecommendations({
        profile: profile(),
        effectiveLevel: level,
        guardrails,
      });

      if (!guardrails.allowWindowVentilation) {
        expect(selected.map((item) => item.id)).not.toContain(
          'ventilate-at-cleanest-hours',
        );
      }
      if (!guardrails.allowAnyOutdoorExercise) {
        expect(selected.map((item) => item.id)).not.toContain(
          'soften-outdoor-exercise',
        );
      }
    }
  });
});

describe('buildRulesPlan summary', () => {
  it('names the location and the official band', () => {
    const plan = buildRulesPlan({
      location: LOCATION,
      profile: profile(),
      current: reading(175),
    });
    expect(plan.summary).toContain('Test City');
    expect(plan.summary).toContain('175');
    expect(plan.summary).toContain('unhealthy');
  });

  it('explains when precautions were raised for a sensitive household', () => {
    const plan = buildRulesPlan({
      location: LOCATION,
      profile: profile({ sensitive: true }),
      current: reading(125),
    });
    expect(plan.summary).toMatch(/stricter level of precaution/i);
  });

  it('says so when the reading is derived from PM2.5', () => {
    const current = reading(0);
    const plan = buildRulesPlan({
      location: LOCATION,
      profile: profile(),
      current: { ...current, usAqi: null, pm25: 60 },
    });
    expect(plan.summary).toContain('estimated from PM2.5');
    expect(plan.summary).toContain(String(pm25ToUsAqi(60)));
  });

  it('states plainly when there is no live reading', () => {
    const current = reading(0);
    const plan = buildRulesPlan({
      location: LOCATION,
      profile: profile(),
      current: { ...current, usAqi: null, pm25: null },
    });
    expect(plan.summary).toMatch(/no live reading/i);
  });

  it('notes when the household plans no outdoor time', () => {
    const plan = buildRulesPlan({
      location: LOCATION,
      profile: profile({ outdoorMinutes: 0 }),
      current: reading(125),
    });
    expect(plan.summary).toMatch(/no planned outdoor time/i);
  });
});
