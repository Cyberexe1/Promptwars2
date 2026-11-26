import { isAtLeast } from '../aqi.js';
import type { CatalogueItem } from './types.js';

/**
 * Health: protecting people and noticing symptoms.
 *
 * Reviewed text, not generated. The language model may reword an entry for a
 * household but cannot add, remove, or reorder these.
 */
export const HEALTH_ITEMS: readonly CatalogueItem[] = [
  {
    id: 'well-fitted-mask',
    category: 'health',
    title: 'Wear a well-fitted respirator outdoors',
    action:
      'Use an N95, KN95, or FFP2 respirator for unavoidable outdoor time, fitted snugly over the nose bridge with no gaps at the cheeks.',
    why: 'These filter fine particles effectively, but only when sealed. Cloth and surgical masks are not designed to filter PM2.5.',
    personalImpact:
      'A well-sealed respirator substantially reduces inhaled particles. Fit drives the result, and a gap at the edge undoes most of the benefit.',
    communityImpact: 'None directly.',
    cost: 'low',
    effort: 'easy',
    confidence: 'high',
    reducesEmissions: false,
    communityBenefit: false,
    priority: 91,
    applies: (context) =>
      context.guardrails.recommendMask && context.profile.outdoorMinutes > 0,
  },
  {
    id: 'watch-for-symptoms',
    category: 'health',
    title: 'Watch for symptoms in the people most at risk',
    action:
      'Check for new cough, wheeze, chest tightness, or breathlessness, keep reliever inhalers filled and to hand, and seek medical care if symptoms worsen.',
    why: 'Smog episodes raise respiratory and cardiac symptoms within days, and sensitive household members often notice effects before the air visibly clears.',
    personalImpact:
      'Early recognition and existing medication plans are what prevent a manageable flare from becoming an emergency.',
    communityImpact: 'None directly.',
    cost: 'free',
    effort: 'easy',
    confidence: 'high',
    reducesEmissions: false,
    communityBenefit: false,
    priority: 93,
    applies: (context) =>
      isAtLeast(context.effectiveLevel, 'sensitive-unhealthy') ||
      context.profile.sensitive,
  },
  {
    id: 'hydrate-and-rinse',
    category: 'health',
    title: 'Rinse off after outdoor time',
    action:
      'Wash your face and hands and rinse your nose with clean water after coming indoors, and change outer clothing if it has been in heavy smoke.',
    why: 'Particles settle on skin, hair, and clothing and keep irritating the eyes and airways after you are back inside.',
    personalImpact:
      'Eases eye and throat irritation. This is a comfort measure and does not reduce what you have already inhaled.',
    communityImpact: 'None directly.',
    cost: 'free',
    effort: 'easy',
    confidence: 'low',
    reducesEmissions: false,
    communityBenefit: false,
    priority: 60,
    applies: (context) =>
      context.profile.outdoorMinutes > 0 &&
      isAtLeast(context.effectiveLevel, 'sensitive-unhealthy'),
  },
] as const;
