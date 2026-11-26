import { isAtLeast } from '../aqi.js';
import type { CatalogueItem } from './types.js';

/**
 * Indoor air: ventilation, filtration, and what is burned at home.
 *
 * Reviewed text, not generated. The language model may reword an entry for a
 * household but cannot add, remove, or reorder these.
 */
export const INDOOR_ITEMS: readonly CatalogueItem[] = [
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
] as const;
