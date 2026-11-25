import type { RecommendationsResponse } from './types';

/**
 * Saved plans, kept in the browser's local storage.
 *
 * Deliberate choice: plans are never sent to a server. A plan's summary can
 * reveal that someone in the household is medically sensitive, so keeping it
 * on the device means that detail never reaches a database, a log, or a
 * backup.
 *
 * This is not because the project lacks accounts. It has them, and a signed-in
 * user could perfectly well have their plans stored server-side. The point is
 * that storing them would create a record of a household's health situation,
 * so the account deliberately does not carry them.
 *
 * The trade-off is honest and stated in the interface: plans do not follow the
 * user to another device or browser, and clearing site data removes them.
 */

const STORAGE_KEY = 'smogwise.savedPlans.v1';

/** Oldest entries are dropped beyond this, to stay well inside the quota. */
export const MAX_SAVED_PLANS = 10;

export interface SavedPlan {
  id: string;
  savedAt: string;
  locationName: string;
  plan: RecommendationsResponse;
}

/** Local storage is unavailable in some private-browsing modes. */
function readStore(): SavedPlan[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    // Drop anything that does not match the current shape, so a stale or
    // hand-edited entry cannot break rendering.
    return parsed.filter(isSavedPlan);
  } catch {
    return [];
  }
}

function isSavedPlan(value: unknown): value is SavedPlan {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<SavedPlan>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.savedAt === 'string' &&
    typeof candidate.locationName === 'string' &&
    typeof candidate.plan === 'object' &&
    candidate.plan !== null &&
    Array.isArray((candidate.plan as RecommendationsResponse).recommendations)
  );
}

function writeStore(plans: SavedPlan[]): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(plans));
    return true;
  } catch {
    // Quota exceeded, or storage blocked entirely.
    return false;
  }
}

export function isStorageAvailable(): boolean {
  try {
    const probe = '__smogwise_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

export function listSavedPlans(): SavedPlan[] {
  // Newest first, which is the order the interface shows them in.
  return readStore().sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Returns the stored entry, or null when storage refused the write. */
export function savePlan(
  locationName: string,
  plan: RecommendationsResponse,
): SavedPlan | null {
  const entry: SavedPlan = {
    id: newId(),
    savedAt: new Date().toISOString(),
    locationName,
    plan,
  };

  const next = [entry, ...readStore()].slice(0, MAX_SAVED_PLANS);
  return writeStore(next) ? entry : null;
}

export function deletePlan(id: string): void {
  writeStore(readStore().filter((entry) => entry.id !== id));
}

export function deleteAllPlans(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do: the data was never stored.
  }
}
