import { usesOwnVehicle } from './predicates.js';
import type { CatalogueItem } from './types.js';

/**
 * Transport: how the household gets around.
 *
 * Reviewed text, not generated. The language model may reword an entry for a
 * household but cannot add, remove, or reorder these.
 */
export const TRANSPORT_ITEMS: readonly CatalogueItem[] = [
  {
    id: 'swap-car-trips',
    category: 'transport',
    title: 'Replace one car trip with a lower-emission option',
    action:
      'Pick your most repeated journey this week and take public transport, share the ride, or combine it with another errand.',
    why: 'Short urban trips with a cold engine produce the most pollution per kilometre, and traffic is a primary source of winter urban smog.',
    personalImpact:
      'Cuts your own emissions roughly in proportion to the distance removed. Note that a car cabin in traffic is itself a high-exposure place to sit.',
    communityImpact:
      'Each car trip removed takes its full tailpipe output out of the shared street air, and the benefit scales when neighbours do the same.',
    cost: 'free',
    effort: 'moderate',
    confidence: 'high',
    reducesEmissions: true,
    communityBenefit: true,
    priority: 78,
    applies: usesOwnVehicle,
  },
  {
    id: 'cabin-recirculation',
    category: 'transport',
    title: 'Recirculate cabin air in traffic',
    action:
      'Close the windows and switch the ventilation to recirculate while you are in slow traffic or a tunnel, then air the cabin once you are clear.',
    why: 'Drawing outside air in while queueing pulls in the concentrated exhaust of the vehicles directly ahead.',
    personalImpact:
      'Lowers in-cabin particle levels during the most polluted part of a drive. Switch back periodically so carbon dioxide does not build up.',
    communityImpact: 'None directly.',
    cost: 'free',
    effort: 'easy',
    confidence: 'medium',
    reducesEmissions: false,
    communityBenefit: false,
    priority: 72,
    applies: (context) => context.profile.commuteMethod === 'car',
  },
  {
    id: 'low-traffic-route',
    category: 'transport',
    title: 'Take the back-street route',
    action:
      'Choose a parallel side street or park path instead of the main road, even if it adds a few minutes.',
    why: 'Pollution concentrations drop steeply with distance from heavy traffic, so a road one street over can be substantially cleaner.',
    personalImpact:
      'Keeps the health benefit of walking or cycling while reducing the exposure that comes with it. A slightly longer clean route usually beats a short roadside one.',
    communityImpact: 'None directly.',
    cost: 'free',
    effort: 'easy',
    confidence: 'medium',
    reducesEmissions: false,
    communityBenefit: false,
    priority: 82,
    applies: (context) =>
      context.profile.commuteMethod === 'walk' ||
      context.profile.commuteMethod === 'cycle' ||
      context.profile.commuteMethod === 'motorbike',
  },
  {
    id: 'no-idling',
    category: 'transport',
    title: 'Switch the engine off while waiting',
    action:
      'Turn the engine off for any wait longer than about 30 seconds, including at the school gate and at long signals.',
    why: 'An idling engine emits with no transport benefit at all, usually while people stand close by on the pavement.',
    personalImpact:
      'Reduces the pollution immediately around your own vehicle, where you and your passengers are standing.',
    communityImpact:
      'Idling reduction is one of the simplest street-level improvements a neighbourhood can agree on together.',
    cost: 'free',
    effort: 'easy',
    confidence: 'high',
    reducesEmissions: true,
    communityBenefit: true,
    priority: 68,
    applies: usesOwnVehicle,
  },
] as const;
