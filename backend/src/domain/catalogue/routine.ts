import { isAtLeast } from '../aqi.js';
import { spendsTimeOutdoors } from './predicates.js';
import type { CatalogueItem } from './types.js';

/**
 * Daily routine: when and how the household moves through its day.
 *
 * Reviewed text, not generated. The language model may reword an entry for a
 * household but cannot add, remove, or reorder these.
 */
export const ROUTINE_ITEMS: readonly CatalogueItem[] = [
  {
    id: 'shift-outdoor-activity',
    category: 'routine',
    title: 'Move outdoor time away from the smog peak',
    action:
      'Shift walks, play, and errands to the early afternoon instead of early morning or the evening rush.',
    why: 'Winter smog is usually worst overnight and at dawn, when cold air traps traffic and burning emissions near the ground, and again during the evening commute.',
    personalImpact:
      'Your inhaled dose falls roughly in proportion to how much of your outdoor time moves out of the peak hours. This is an estimate based on typical daily pollution patterns, not a measurement of your exposure.',
    communityImpact:
      'None directly, though spreading activity across the day eases demand on roads at peak times.',
    cost: 'free',
    effort: 'easy',
    confidence: 'high',
    reducesEmissions: false,
    communityBenefit: false,
    priority: 90,
    applies: (context) =>
      spendsTimeOutdoors(context) &&
      isAtLeast(context.effectiveLevel, 'moderate') &&
      // Once everyone is told to stop outdoor exercise, suggesting a better
      // time for walks and play would contradict that advice. From this band
      // upward the plan moves people indoors instead.
      context.guardrails.allowAnyOutdoorExercise,
  },
  {
    id: 'soften-outdoor-exercise',
    category: 'routine',
    title: 'Keep outdoor exercise gentle today',
    action:
      'Swap running or cycling for a relaxed walk, and move hard training indoors.',
    why: 'Heavy breathing during exercise draws far more air, and therefore far more particles, deep into the lungs than resting breathing does.',
    personalImpact:
      'Lowers the volume of polluted air you breathe during activity. The reduction tracks your breathing rate, so easing effort matters as much as shortening the session.',
    communityImpact: 'None directly.',
    cost: 'free',
    effort: 'easy',
    confidence: 'high',
    reducesEmissions: false,
    communityBenefit: false,
    priority: 88,
    applies: (context) =>
      spendsTimeOutdoors(context) &&
      !context.guardrails.allowStrenuousOutdoor &&
      context.guardrails.allowAnyOutdoorExercise,
  },
  {
    id: 'pause-outdoor-exercise',
    category: 'routine',
    title: 'Pause outdoor exercise until the air improves',
    action:
      'Cancel outdoor workouts and sports today. Use indoor movement such as bodyweight exercise, stretching, or stairs instead.',
    why: 'At this level, health agencies advise everyone to avoid outdoor exertion because the particle load is high enough to affect healthy lungs, not only sensitive ones.',
    personalImpact:
      'Avoids the single largest avoidable exposure in a typical day, since exercise can multiply the air you breathe several times over.',
    communityImpact: 'None directly.',
    cost: 'free',
    effort: 'moderate',
    confidence: 'high',
    reducesEmissions: false,
    communityBenefit: false,
    priority: 97,
    applies: (context) => !context.guardrails.allowAnyOutdoorExercise,
  },
  {
    id: 'school-commute-timing',
    category: 'routine',
    title: 'Protect the school run',
    action:
      'Walk children on the side of the street away from traffic, avoid idling queues at the gate, and keep waiting time outdoors short.',
    why: 'Children breathe more air relative to their body size than adults and their lungs are still developing, so the school commute is a disproportionate share of their daily dose.',
    personalImpact:
      'Pollution falls off sharply within a few metres of traffic, so route and waiting choices can meaningfully cut a child\u2019s exposure on the same journey.',
    communityImpact:
      'Fewer idling engines at the school gate lowers pollution for every family waiting there.',
    cost: 'free',
    effort: 'easy',
    confidence: 'medium',
    reducesEmissions: false,
    communityBenefit: true,
    priority: 86,
    applies: (context) =>
      context.profile.ageGroups.includes('child') &&
      isAtLeast(context.effectiveLevel, 'moderate'),
  },
  {
    id: 'check-before-you-go',
    category: 'routine',
    title: 'Check the air before you commit to outdoor plans',
    action:
      'Look at the current reading in the morning and again before any evening outing, and decide timing from that rather than from how the sky looks.',
    why: 'Fine particles are largely invisible, and winter levels can swing several bands within a single day as temperature and wind change.',
    personalImpact:
      'Turns every other action in this plan into a decision you make at the right moment instead of a fixed habit.',
    communityImpact:
      'Households that track readings tend to pass warnings on, which helps neighbours who are not watching.',
    cost: 'free',
    effort: 'easy',
    confidence: 'high',
    reducesEmissions: false,
    communityBenefit: true,
    priority: 55,
    applies: () => true,
  },
  {
    id: 'community-clean-air-group',
    category: 'routine',
    title: 'Act with your street, school, or building',
    action:
      'Share the day\u2019s reading in your residents\u2019 or parents\u2019 group and agree on one shared step, such as a no-idling zone at the gate, reporting uncovered construction dust, or a shared school run.',
    why: 'Local air is shaped by nearby sources. A single household can change its own exposure, but reducing the pollution on a street needs several households acting together.',
    personalImpact:
      'Indirect. Your own exposure improves only as the shared sources near you are reduced.',
    communityImpact:
      'This is where collective action does more than individual action, because traffic, burning, and dust affect everyone on the street at once.',
    cost: 'free',
    effort: 'moderate',
    confidence: 'medium',
    reducesEmissions: false,
    communityBenefit: true,
    priority: 58,
    applies: () => true,
  },
  {
    id: 'no-waste-burning',
    category: 'routine',
    title: 'Keep waste and leaves out of the fire',
    action:
      'Do not burn rubbish, leaves, or garden waste, and ask neighbours to compost or use municipal collection instead.',
    why: 'Open burning of mixed waste releases fine particles and toxic compounds directly at street level, with no stack height to disperse them.',
    personalImpact:
      'Removes a nearby source that can dominate the air you breathe at home, often far above the city-wide average.',
    communityImpact:
      'Open burning is a significant contributor to winter smog in many cities, so avoiding it cuts neighbourhood pollution directly.',
    cost: 'free',
    effort: 'easy',
    confidence: 'high',
    reducesEmissions: true,
    communityBenefit: true,
    priority: 70,
    applies: () => true,
  },
] as const;
