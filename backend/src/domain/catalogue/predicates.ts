import type { RecommendationContext } from './types.js';

/**
 * Eligibility checks shared by more than one catalogue entry.
 *
 * Kept apart from the entries so a rule such as "owns a vehicle" is defined
 * once, and so the entry files read as content rather than logic.
 */

export const spendsTimeOutdoors = (context: RecommendationContext): boolean =>
  context.profile.outdoorMinutes > 0;

export const usesOwnVehicle = (context: RecommendationContext): boolean =>
  context.profile.commuteMethod === 'car' ||
  context.profile.commuteMethod === 'motorbike';
