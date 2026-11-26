import { HEALTH_ITEMS } from './catalogue/health.js';
import { INDOOR_ITEMS } from './catalogue/indoor.js';
import { ROUTINE_ITEMS } from './catalogue/routine.js';
import { TRANSPORT_ITEMS } from './catalogue/transport.js';
import type { CatalogueItem } from './catalogue/types.js';

export type { CatalogueItem, RecommendationContext } from './catalogue/types.js';

/**
 * The approved recommendation catalogue.
 *
 * Every suggestion the API can return originates here. The language model may
 * reword an entry for the household's situation, but it cannot invent a new
 * one, so the advice surface stays reviewable and safe.
 *
 * Impact text is written as an explicit estimate. Nothing here claims a
 * measured reduction, because the app has no sensor data to support one.
 *
 * The entries live in `./catalogue/`, one file per category, and are joined
 * here. The order below is part of the behaviour: the selector sorts by
 * priority and the sort is stable, so entries of equal priority are offered in
 * this order.
 */
export const CATALOGUE: readonly CatalogueItem[] = [
  ...ROUTINE_ITEMS,
  ...INDOOR_ITEMS,
  ...TRANSPORT_ITEMS,
  ...HEALTH_ITEMS,
];

export function findCatalogueItem(id: string): CatalogueItem | undefined {
  return CATALOGUE.find((item) => item.id === id);
}
