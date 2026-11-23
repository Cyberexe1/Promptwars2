import { describe, expect, it } from 'vitest';
import { mergePlan, violatesOutdoorConstraint } from '../src/services/planner.js';
import { extractJsonObject } from '../src/services/bedrock.js';
import { CATALOGUE, findCatalogueItem } from '../src/domain/catalogue.js';
import { deriveGuardrails } from '../src/domain/risk.js';
import type { ModelPlan } from '../src/schemas.js';
import type { CatalogueItem } from '../src/domain/catalogue.js';

function items(...ids: string[]): CatalogueItem[] {
  return ids.map((id) => {
    const item = findCatalogueItem(id);
    if (!item) throw new Error(`Unknown catalogue id in test: ${id}`);
    return item;
  });
}

const CLEAN_AIR = deriveGuardrails('good');
const SMOGGY_AIR = deriveGuardrails('very-unhealthy');

describe('extractJsonObject', () => {
  it('reads a bare JSON object', () => {
    expect(extractJsonObject('{"a":1}')).toBe('{"a":1}');
  });

  it('reads a JSON object inside a fenced code block', () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('reads a JSON object surrounded by prose', () => {
    expect(extractJsonObject('Sure! {"a":1} Hope that helps.')).toBe('{"a":1}');
  });

  it('returns null when there is no object', () => {
    expect(extractJsonObject('no json here')).toBeNull();
    expect(extractJsonObject('')).toBeNull();
  });
});

describe('violatesOutdoorConstraint', () => {
  it('allows exercise wording when the air permits it', () => {
    expect(violatesOutdoorConstraint('Go for a run this morning.', CLEAN_AIR)).toBe(
      false,
    );
  });

  it('rejects encouragement to exercise outdoors when the air does not', () => {
    expect(violatesOutdoorConstraint('Go for a run this morning.', SMOGGY_AIR)).toBe(
      true,
    );
    expect(
      violatesOutdoorConstraint('Keep up your usual cycling routine.', SMOGGY_AIR),
    ).toBe(true);
    expect(
      violatesOutdoorConstraint('An outdoor workout is still fine.', SMOGGY_AIR),
    ).toBe(true);
  });

  it('does not flag safe indoor wording', () => {
    expect(
      violatesOutdoorConstraint(
        'Move your workout indoors and keep the windows closed.',
        SMOGGY_AIR,
      ),
    ).toBe(false);
  });
});

describe('mergePlan', () => {
  const selected = items(
    'pause-outdoor-exercise',
    'keep-windows-closed',
    'well-fitted-mask',
    'watch-for-symptoms',
  );

  it('returns the reviewed catalogue text when there is no model plan', () => {
    const result = mergePlan(selected, null, SMOGGY_AIR);
    expect(result.usedModel).toBe(false);
    expect(result.recommendations).toHaveLength(selected.length);
    expect(result.recommendations[0]!.action).toBe(selected[0]!.action);
  });

  it('applies model wording for known ids', () => {
    const plan: ModelPlan = {
      summary: 'Rewritten summary.',
      recommendations: [
        {
          id: 'keep-windows-closed',
          action: 'Shut the windows on the road-facing side first.',
          why: 'That side carries the most traffic pollution.',
          personalImpact: 'Estimated to cut indoor particle inflow.',
          communityImpact: 'None directly.',
        },
      ],
    };

    const result = mergePlan(selected, plan, SMOGGY_AIR);
    expect(result.usedModel).toBe(true);

    const windows = result.recommendations.find(
      (item) => item.id === 'keep-windows-closed',
    );
    expect(windows?.action).toBe('Shut the windows on the road-facing side first.');
  });

  it('discards model entries whose ids were not selected', () => {
    const plan: ModelPlan = {
      summary: 'Summary.',
      recommendations: [
        {
          id: 'soften-outdoor-exercise',
          action: 'A gentle jog outside is fine.',
          why: 'Invented justification.',
          personalImpact: 'Invented impact.',
          communityImpact: 'None.',
        },
      ],
    };

    const result = mergePlan(selected, plan, SMOGGY_AIR);
    expect(result.usedModel).toBe(false);
    expect(result.recommendations.map((item) => item.id)).toEqual(
      selected.map((item) => item.id),
    );
  });

  it('cannot add a recommendation that the rules engine did not choose', () => {
    const plan: ModelPlan = {
      summary: 'Summary.',
      recommendations: CATALOGUE.map((item) => ({
        id: item.id,
        action: 'Model action.',
        why: 'Model reason.',
        personalImpact: 'Model personal impact.',
        communityImpact: 'Model community impact.',
      })),
    };

    const result = mergePlan(selected, plan, SMOGGY_AIR);
    expect(result.recommendations).toHaveLength(selected.length);
    expect(result.recommendations.map((item) => item.id)).toEqual(
      selected.map((item) => item.id),
    );
  });

  it('falls back to catalogue text for a field that breaks a safety constraint', () => {
    const target = selected[1]!;
    const plan: ModelPlan = {
      summary: 'Summary.',
      recommendations: [
        {
          id: target.id,
          action: 'Go for a run before you close the windows.',
          why: 'Safe replacement reason.',
          personalImpact: 'Safe replacement impact.',
          communityImpact: 'None directly.',
        },
      ],
    };

    const result = mergePlan(selected, plan, SMOGGY_AIR);
    const merged = result.recommendations.find((item) => item.id === target.id)!;

    expect(merged.action).toBe(target.action);
    expect(merged.why).toBe('Safe replacement reason.');
  });

  it('preserves the category, cost, effort, and confidence set in code', () => {
    const target = selected[0]!;
    const plan: ModelPlan = {
      summary: 'Summary.',
      recommendations: [
        {
          id: target.id,
          action: 'Model action.',
          why: 'Model reason.',
          personalImpact: 'Model impact.',
          communityImpact: 'Model community impact.',
        },
      ],
    };

    const merged = mergePlan(selected, plan, SMOGGY_AIR).recommendations.find(
      (item) => item.id === target.id,
    )!;

    expect(merged.category).toBe(target.category);
    expect(merged.cost).toBe(target.cost);
    expect(merged.effort).toBe(target.effort);
    expect(merged.confidence).toBe(target.confidence);
    expect(merged.title).toBe(target.title);
  });
});
