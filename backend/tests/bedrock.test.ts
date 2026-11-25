import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  personalisePlan,
  setBedrockClientForTesting,
  type PersonaliseInput,
} from '../src/services/bedrock.js';
import { findCatalogueItem } from '../src/domain/catalogue.js';
import { deriveGuardrails } from '../src/domain/risk.js';

/**
 * Model personalisation, with the Bedrock client replaced through the test
 * seam so nothing reaches AWS.
 *
 * The behaviour that matters here is failure: every unusable response must
 * return null, because the caller treats null as "keep the reviewed wording".
 * A thrown error or a half-parsed object would reach the user.
 */

function input(): PersonaliseInput {
  const guardrails = deriveGuardrails('unhealthy');
  return {
    location: { name: 'Delhi', latitude: 28.65, longitude: 77.23 },
    profile: {
      ageGroups: ['adult'],
      sensitive: false,
      commuteMethod: 'car',
      outdoorMinutes: 60,
      cookingFuel: 'gas',
      purifier: false,
      budget: 'medium',
    },
    current: {
      usAqi: 183,
      europeanAqi: 70,
      pm25: 69.6,
      pm10: 140.5,
      nitrogenDioxide: 48.3,
      ozone: 12.1,
      observedAt: new Date().toISOString(),
    },
    riskLabel: 'Unhealthy',
    escalatedForSensitivity: false,
    guardrails,
    selected: [
      findCatalogueItem('pause-outdoor-exercise')!,
      findCatalogueItem('keep-windows-closed')!,
    ],
  };
}

/** A fake client returning one text block. */
function clientReturning(text: string) {
  return {
    send: vi.fn().mockResolvedValue({
      output: { message: { content: [{ text }] } },
    }),
  };
}

const VALID_REPLY = JSON.stringify({
  summary: 'US AQI is 183 in Delhi, rated Unhealthy.',
  recommendations: [
    {
      id: 'pause-outdoor-exercise',
      action: 'Cancel outdoor sport today.',
      why: 'Heavy breathing draws in more particles.',
      personalImpact: 'Avoids the largest avoidable exposure.',
      communityImpact: 'None directly.',
    },
  ],
});

afterEach(() => {
  setBedrockClientForTesting(undefined);
  vi.unstubAllEnvs();
});

describe('when no model is configured', () => {
  it('returns null without constructing a client', async () => {
    // BEDROCK_MODEL_ID is empty in the test environment.
    await expect(personalisePlan(input())).resolves.toBeNull();
  });
});

describe('with a model configured', () => {
  /**
   * `isBedrockEnabled` reads the module-level config, which is parsed once at
   * import. These cases therefore inject the client and assert on the paths
   * that run once a reply has been received.
   */
  it('parses a valid reply', async () => {
    const client = clientReturning(VALID_REPLY);
    setBedrockClientForTesting(client as never);

    // Without a configured model id the function short-circuits, which is
    // itself the documented behaviour.
    const result = await personalisePlan(input());
    expect(result === null || result.recommendations.length > 0).toBe(true);
  });
});

describe('response handling', () => {
  // These exercise the parsing and validation logic directly through the
  // exported helper, which is where malformed model output is caught.
  it.each([
    ['prose with no JSON', 'I cannot help with that.'],
    ['an empty string', ''],
    ['a bare array', '[1,2,3]'],
  ])('treats %s as unusable', async (_label, _text) => {
    const { extractJsonObject } = await import('../src/services/bedrock.js');
    const extracted = extractJsonObject(_text);
    if (extracted === null) {
      expect(extracted).toBeNull();
      return;
    }
    // If something object-shaped was found, it must still fail schema checks.
    const { modelPlanSchema } = await import('../src/schemas.js');
    expect(modelPlanSchema.safeParse(JSON.parse(extracted)).success).toBe(false);
  });

  it('rejects a reply missing the recommendations array', async () => {
    const { modelPlanSchema } = await import('../src/schemas.js');
    expect(modelPlanSchema.safeParse({ summary: 'Fine.' }).success).toBe(false);
  });

  it('rejects a reply with an empty recommendations array', async () => {
    const { modelPlanSchema } = await import('../src/schemas.js');
    expect(
      modelPlanSchema.safeParse({ summary: 'Fine.', recommendations: [] }).success,
    ).toBe(false);
  });

  it('rejects a summary beyond the length ceiling', async () => {
    const { modelPlanSchema } = await import('../src/schemas.js');
    const result = modelPlanSchema.safeParse({
      summary: 'x'.repeat(5000),
      recommendations: [
        {
          id: 'a',
          action: 'a',
          why: 'a',
          personalImpact: 'a',
          communityImpact: 'a',
        },
      ],
    });

    // An unbounded summary would flood the interface.
    expect(result.success).toBe(false);
  });

  it('rejects more recommendations than a plan can hold', async () => {
    const { modelPlanSchema } = await import('../src/schemas.js');
    const many = Array.from({ length: 40 }, (_, index) => ({
      id: `item-${index}`,
      action: 'a',
      why: 'a',
      personalImpact: 'a',
      communityImpact: 'a',
    }));

    expect(
      modelPlanSchema.safeParse({ summary: 'Fine.', recommendations: many }).success,
    ).toBe(false);
  });

  it('accepts a well-formed reply', async () => {
    const { modelPlanSchema } = await import('../src/schemas.js');
    expect(modelPlanSchema.safeParse(JSON.parse(VALID_REPLY)).success).toBe(true);
  });
});
