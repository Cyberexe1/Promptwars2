import { isAtLeast } from './aqi.js';
import type { SafetyGuardrails } from './risk.js';
import type {
  ConfidenceLevel,
  CostLevel,
  EffortLevel,
  HouseholdProfile,
  RecommendationCategory,
  RiskLevel,
} from '../types.js';

/**
 * The approved recommendation catalogue.
 *
 * Every suggestion the API can return originates here. The language model may
 * reword an entry for the household's situation, but it cannot invent a new
 * one, so the advice surface stays reviewable and safe.
 *
 * Impact text is written as an explicit estimate. Nothing here claims a
 * measured reduction, because the app has no sensor data to support one.
 */

export interface RecommendationContext {
  profile: HouseholdProfile;
  /** Band used for decisions, already escalated for sensitive households. */
  effectiveLevel: RiskLevel;
  guardrails: SafetyGuardrails;
}

export interface CatalogueItem {
  id: string;
  category: RecommendationCategory;
  title: string;
  action: string;
  why: string;
  personalImpact: string;
  communityImpact: string;
  cost: CostLevel;
  effort: EffortLevel;
  confidence: ConfidenceLevel;
  /**
   * Cuts pollution at its source rather than only shielding the household
   * from it. Closing a window protects you; not burning waste means there is
   * less smoke for anyone to breathe.
   *
   * The brief this project answers asks for low-emission routines and
   * sustainable alternatives, so the selector reserves a slot for one of
   * these. Without that reservation they rank below every protective item and
   * never appear at exactly the readings that bring people to the app.
   */
  reducesEmissions: boolean;
  /**
   * Safe and useful to publish in a shared community checklist, because the
   * action helps people beyond the household and discloses nothing about it.
   *
   * A field, not a phrase: this was previously inferred by matching
   * `communityImpact` against /^none directly/i, and that text is one of the
   * four fields the language model is allowed to reword. A reword from
   * "None directly." to "No direct effect on the area." silently promoted a
   * private item into a shared checklist.
   */
  communityBenefit: boolean;
  /** Higher values are offered first when more items qualify than fit. */
  priority: number;
  applies: (context: RecommendationContext) => boolean;
}

const spendsTimeOutdoors = (context: RecommendationContext): boolean =>
  context.profile.outdoorMinutes > 0;

const usesOwnVehicle = (context: RecommendationContext): boolean =>
  context.profile.commuteMethod === 'car' ||
  context.profile.commuteMethod === 'motorbike';

export const CATALOGUE: readonly CatalogueItem[] = [
  // ----- Daily routine -------------------------------------------------
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

  // ----- Indoor air ----------------------------------------------------
  {
    id: 'ventilate-at-cleanest-hours',
    category: 'indoor',
    title: 'Air out the house at the cleanest time of day',
    action:
      'Open windows wide for 5 to 10 minutes in the early afternoon, then close them again.',
    why: 'Homes need fresh air to clear carbon dioxide, damp, and cooking fumes. A short, well-timed burst exchanges stale air without letting the smog peak settle indoors.',
    personalImpact:
      'Keeps indoor humidity and cooking pollutants down while limiting how much outdoor particulate you let in, compared with leaving windows open all day.',
    communityImpact: 'None directly.',
    cost: 'free',
    effort: 'easy',
    confidence: 'medium',
    reducesEmissions: false,
    communityBenefit: false,
    priority: 75,
    applies: (context) => context.guardrails.allowWindowVentilation,
  },
  {
    id: 'keep-windows-closed',
    category: 'indoor',
    title: 'Keep windows closed and seal the obvious gaps',
    action:
      'Close windows and doors, and block draughts under external doors with a rolled towel or draught strip.',
    why: 'Outdoor particles follow air leaks indoors. While outdoor levels are high, reducing that inflow is the cheapest way to keep indoor air better than the street.',
    personalImpact:
      'Indoor particle levels usually sit below outdoor levels in a closed home, so this protects the hours you spend inside, which is most of the day.',
    communityImpact: 'None directly.',
    cost: 'free',
    effort: 'easy',
    confidence: 'high',
    reducesEmissions: false,
    communityBenefit: false,
    priority: 92,
    applies: (context) => !context.guardrails.allowWindowVentilation,
  },
  {
    id: 'kitchen-exhaust',
    category: 'indoor',
    title: 'Always run the kitchen exhaust while cooking',
    action:
      'Switch the extractor hood on before you start cooking, use the back burners, and leave it running for 10 minutes afterwards.',
    why: 'Gas flames and frying generate fine particles and nitrogen dioxide indoors. Without extraction, cooking can make indoor air worse than the smoggy air outside.',
    personalImpact:
      'A vented hood removes a large share of cooking emissions at the source, before they spread through the home.',
    communityImpact: 'None directly.',
    cost: 'free',
    effort: 'easy',
    confidence: 'high',
    reducesEmissions: false,
    communityBenefit: false,
    priority: 85,
    applies: (context) =>
      context.profile.cookingFuel === 'gas' ||
      context.profile.cookingFuel === 'biomass',
  },
  {
    id: 'move-off-biomass',
    category: 'indoor',
    title: 'Replace biomass cooking where you can',
    action:
      'Use an electric induction plate or pressure cooker for the meals that take longest, and keep solid fuel for occasional use only.',
    why: 'Burning wood, dung, or coal indoors is among the largest sources of personal particle exposure worldwide, typically far exceeding outdoor smog.',
    personalImpact:
      'Cuts the dominant exposure for whoever does the cooking, and for small children who stay nearby.',
    communityImpact:
      'Household solid-fuel burning is a major contributor to regional winter particulate levels.',
    cost: 'medium',
    effort: 'moderate',
    confidence: 'high',
    reducesEmissions: true,
    communityBenefit: true,
    priority: 94,
    applies: (context) => context.profile.cookingFuel === 'biomass',
  },
  {
    id: 'purifier-maintenance',
    category: 'indoor',
    title: 'Get real output from the purifier you own',
    action:
      'Run it on a high setting in the room you occupy most, keep doors to that room closed, and check the filter now rather than at the end of winter.',
    why: 'A purifier only cleans the room it is in, and a loaded filter moves much less air than a fresh one. Placement and airflow matter more than the rated specification.',
    personalImpact:
      'Concentrating a working purifier in one occupied room gives a much larger drop in particle levels there than spreading it thinly across the home.',
    communityImpact: 'None directly.',
    cost: 'low',
    effort: 'easy',
    confidence: 'medium',
    // Ranked high because it converts equipment the household already owns
    // into actual protection, which beats most advice that needs new effort.
    reducesEmissions: false,
    communityBenefit: false,
    priority: 90,
    applies: (context) =>
      context.profile.purifier && isAtLeast(context.effectiveLevel, 'moderate'),
  },
  {
    id: 'single-clean-room',
    category: 'indoor',
    title: 'Create one clean-air room',
    action:
      'Pick the bedroom used for sleeping, keep its door and windows closed, avoid burning anything in it, and put whatever filtration you have in that room.',
    why: 'Protecting every room is expensive. Protecting the room where the household sleeps covers the longest continuous stretch of indoor time.',
    personalImpact:
      'Covers roughly a third of the day for each person using that room, which is the most cost-effective slice of exposure to address.',
    communityImpact: 'None directly.',
    cost: 'free',
    effort: 'easy',
    confidence: 'medium',
    reducesEmissions: false,
    communityBenefit: false,
    priority: 89,
    applies: (context) =>
      !context.profile.purifier &&
      isAtLeast(context.effectiveLevel, 'sensitive-unhealthy'),
  },
  {
    id: 'reduce-indoor-smoke',
    category: 'indoor',
    title: 'Stop adding smoke indoors',
    action:
      'Skip incense, candles, and mosquito coils while the smog lasts, and keep all tobacco smoking outside the home.',
    why: 'These are direct indoor particle sources. Adding them while outdoor air is already poor stacks one exposure on top of another.',
    personalImpact:
      'Removes avoidable indoor sources that can briefly push a room well above the outdoor level.',
    communityImpact: 'None directly.',
    cost: 'free',
    effort: 'easy',
    confidence: 'high',
    reducesEmissions: true,
    communityBenefit: false,
    priority: 80,
    applies: () => true,
  },
  {
    id: 'low-cost-filter-box',
    category: 'indoor',
    title: 'Build a low-cost filter box',
    action:
      'Strap a HEPA or high-grade furnace filter to the intake side of a box fan and run it in your clean-air room, replacing the filter when it visibly greys.',
    why: 'A fan and filter move and clean air using the same principle as a commercial purifier at a fraction of the price.',
    personalImpact:
      'Gives real particle removal in one room when a commercial purifier is out of reach. Effectiveness depends on filter grade and fan airflow.',
    communityImpact: 'None directly.',
    cost: 'low',
    effort: 'moderate',
    confidence: 'medium',
    reducesEmissions: false,
    communityBenefit: false,
    priority: 90,
    applies: (context) =>
      !context.profile.purifier &&
      context.profile.budget === 'low' &&
      isAtLeast(context.effectiveLevel, 'sensitive-unhealthy'),
  },
  {
    id: 'buy-room-purifier',
    category: 'indoor',
    title: 'Buy one purifier for the room you sleep in',
    action:
      'Choose a HEPA purifier rated for the floor area of your bedroom rather than a larger model for the whole home, and run it with the door shut overnight.',
    why: 'Filtration works on the air in one enclosed space. A unit matched to a single room changes that air several times an hour, while the same money spread across a whole floor changes it too slowly to matter.',
    personalImpact:
      'Cuts particle levels in the room where you spend the longest unbroken stretch of time. Rated room area and a clean filter matter more than the brand.',
    communityImpact: 'None directly.',
    cost: 'medium',
    effort: 'easy',
    confidence: 'high',
    reducesEmissions: false,
    communityBenefit: false,
    priority: 90,
    applies: (context) =>
      !context.profile.purifier &&
      context.profile.budget === 'medium' &&
      isAtLeast(context.effectiveLevel, 'sensitive-unhealthy'),
  },
  {
    id: 'induction-instead-of-gas',
    category: 'indoor',
    title: 'Move cooking from gas to induction',
    action:
      'Replace gas burners with an induction hob, or start with a single portable induction plate for the cooking you do most often.',
    why: 'Burning gas indoors produces nitrogen dioxide and fine particles in the room where your family eats. Induction heats the pan electrically and produces neither.',
    personalImpact:
      'Removes a combustion source from inside the home rather than filtering what it produces. The benefit is largest in small or poorly ventilated kitchens.',
    communityImpact:
      'Shifts household energy use away from burning fuel indoors, which lowers both local combustion emissions and the gas demand behind them.',
    cost: 'high',
    effort: 'moderate',
    confidence: 'high',
    reducesEmissions: true,
    communityBenefit: true,
    priority: 81,
    applies: (context) =>
      context.profile.cookingFuel === 'gas' && context.profile.budget === 'high',
  },
  {
    id: 'filtered-fresh-air',
    category: 'indoor',
    title: 'Add filtered ventilation so you can stop choosing',
    action:
      'Fit a filtered air inlet, a ventilation unit with a particle filter, or a window unit that filters incoming air, so the home can take in fresh air without taking in the smog.',
    why: 'Sealing windows keeps particles out but traps carbon dioxide, damp, and cooking fumes in. Filtered ventilation removes the trade-off between fresh air and clean air.',
    personalImpact:
      'Lets the home stay ventilated through a smog episode instead of alternating between stale indoor air and outdoor particles. Needs the filter changed on schedule to keep working.',
    communityImpact: 'None directly.',
    cost: 'high',
    effort: 'hard',
    confidence: 'medium',
    reducesEmissions: false,
    communityBenefit: false,
    priority: 74,
    applies: (context) =>
      context.profile.budget === 'high' &&
      isAtLeast(context.effectiveLevel, 'sensitive-unhealthy'),
  },

  // ----- Transport -----------------------------------------------------
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

  // ----- Health --------------------------------------------------------
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

export function findCatalogueItem(id: string): CatalogueItem | undefined {
  return CATALOGUE.find((item) => item.id === id);
}
