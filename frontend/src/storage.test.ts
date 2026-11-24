import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteAllPlans,
  deletePlan,
  isStorageAvailable,
  listSavedPlans,
  MAX_SAVED_PLANS,
  savePlan,
} from './storage';
import { PLAN } from './test/fixtures';

beforeEach(() => {
  window.localStorage.clear();
});

describe('isStorageAvailable', () => {
  it('is true in a normal browser', () => {
    expect(isStorageAvailable()).toBe(true);
  });

  it('is false when the browser blocks storage', () => {
    // jsdom defines these on Storage.prototype, so the instance is not where
    // the call is resolved.
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(isStorageAvailable()).toBe(false);
  });

  it('leaves no probe value behind', () => {
    isStorageAvailable();
    expect(window.localStorage.length).toBe(0);
  });
});

describe('savePlan and listSavedPlans', () => {
  it('starts empty', () => {
    expect(listSavedPlans()).toEqual([]);
  });

  it('stores a plan with its location and a timestamp', () => {
    const entry = savePlan('Delhi, India', PLAN);

    expect(entry).not.toBeNull();
    expect(entry!.locationName).toBe('Delhi, India');
    expect(Number.isNaN(Date.parse(entry!.savedAt))).toBe(false);

    const listed = listSavedPlans();
    expect(listed).toHaveLength(1);
    expect(listed[0]!.plan.recommendations).toHaveLength(
      PLAN.recommendations.length,
    );
  });

  it('gives each saved plan a distinct id', () => {
    savePlan('Delhi', PLAN);
    savePlan('Delhi', PLAN);

    const ids = listSavedPlans().map((entry) => entry.id);
    expect(new Set(ids).size).toBe(2);
  });

  it('returns the newest plan first', () => {
    const older = savePlan('Older city', PLAN)!;
    // Timestamps are compared as strings, so force a later value.
    vi.setSystemTime(new Date(Date.parse(older.savedAt) + 60_000));
    savePlan('Newer city', PLAN);

    expect(listSavedPlans()[0]!.locationName).toBe('Newer city');
    vi.useRealTimers();
  });

  it('keeps only the most recent plans', () => {
    for (let index = 0; index < MAX_SAVED_PLANS + 5; index += 1) {
      savePlan(`City ${index}`, PLAN);
    }
    expect(listSavedPlans()).toHaveLength(MAX_SAVED_PLANS);
  });

  it('reports failure rather than throwing when the quota is exceeded', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });

    expect(savePlan('Delhi', PLAN)).toBeNull();
  });
});

describe('deletion', () => {
  it('removes one plan and leaves the rest', () => {
    const first = savePlan('Keep me', PLAN)!;
    const second = savePlan('Delete me', PLAN)!;

    deletePlan(second.id);

    const remaining = listSavedPlans();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.id).toBe(first.id);
  });

  it('ignores an unknown id without disturbing storage', () => {
    savePlan('Delhi', PLAN);
    deletePlan('no-such-id');
    expect(listSavedPlans()).toHaveLength(1);
  });

  it('removes every plan and the storage key itself', () => {
    savePlan('A', PLAN);
    savePlan('B', PLAN);

    deleteAllPlans();

    expect(listSavedPlans()).toEqual([]);
    // Deletion is complete, not a flag on a retained record.
    expect(window.localStorage.length).toBe(0);
  });
});

describe('resilience to damaged storage', () => {
  it('treats unparseable content as empty', () => {
    window.localStorage.setItem('smogwise.savedPlans.v1', '{not json');
    expect(listSavedPlans()).toEqual([]);
  });

  it('treats a non-array value as empty', () => {
    window.localStorage.setItem('smogwise.savedPlans.v1', '{"a":1}');
    expect(listSavedPlans()).toEqual([]);
  });

  it('drops entries that no longer match the expected shape', () => {
    const good = savePlan('Good', PLAN)!;
    const raw = JSON.parse(
      window.localStorage.getItem('smogwise.savedPlans.v1')!,
    ) as unknown[];

    raw.push({ id: 'broken', savedAt: '2026-01-01' });
    window.localStorage.setItem('smogwise.savedPlans.v1', JSON.stringify(raw));

    const listed = listSavedPlans();
    expect(listed).toHaveLength(1);
    expect(listed[0]!.id).toBe(good.id);
  });
});
