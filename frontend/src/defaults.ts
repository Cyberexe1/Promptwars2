import type { HouseholdProfile } from './types';

/**
 * Starting household profile.
 *
 * Chosen so the user can submit immediately without answering anything: a
 * single adult, no declared sensitivity, and the most common urban defaults.
 * Kept out of the component file so the form module exports only components.
 */
export const DEFAULT_PROFILE: HouseholdProfile = {
  ageGroups: ['adult'],
  sensitive: false,
  commuteMethod: 'public-transport',
  outdoorMinutes: 60,
  cookingFuel: 'gas',
  purifier: false,
  budget: 'medium',
};
