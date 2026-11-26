/**
 * Copy for the landing page.
 *
 * Kept apart from the component so a wording change does not touch markup, and
 * so the page itself reads as layout. Plain data: nothing here runs.
 */

/** A heading with a sentence under it. Steps and audiences share this shape. */
export interface TitledText {
  title: string;
  body: string;
}

export const STEPS: TitledText[] = [
  {
    title: 'Pick your area',
    body: 'Search for your city or share your location once. Coordinates are rounded before use and never stored.',
  },
  {
    title: 'We read the air',
    body: 'Current PM2.5, PM10, nitrogen dioxide, and ozone are fetched live, then graded against the US EPA Air Quality Index.',
  },
  {
    title: 'Tell us your day',
    body: 'Who lives with you, how you travel, what you cook with, and what you can spend. Everything has a sensible default.',
  },
  {
    title: 'Get a plan you can act on',
    body: 'Four to six specific steps for today, each with the reason behind it and the effect you can expect.',
  },
];

export interface Feature {
  title: string;
  body: string;
  items: string[];
}

export const FEATURES: Feature[] = [
  {
    title: 'Low-emission daily routines',
    body: 'Timing and intensity advice that fits around school, work, and errands rather than telling you to stay inside for a month.',
    items: [
      'Shift outdoor time away from the smog peak',
      'Soften or pause exercise as the band worsens',
      'Protect the school run',
    ],
  },
  {
    title: 'Indoor air that is actually better',
    body: 'Most of your day is spent indoors, where cooking and ventilation choices often matter more than the street outside.',
    items: [
      'When to open windows, and when not to',
      'Kitchen extraction and cleaner cooking',
      'One clean-air room, or a low-cost filter box',
    ],
  },
  {
    title: 'Sustainable alternatives',
    body: 'Swaps that cut what you emit as well as what you breathe, sized to what you can realistically change.',
    items: [
      'Replace a repeated car trip',
      'Lower-exposure walking and cycling routes',
      'No idling, no waste burning',
    ],
  },
  {
    title: 'Built for communities',
    body: 'Street-level air is shaped by shared sources, so some actions only work when neighbours act together.',
    items: [
      'A shared step for your street or building',
      'No-idling zones at the school gate',
      'Advice that excludes private household details',
    ],
  },
];

export const AUDIENCES: TitledText[] = [
  {
    title: 'Families with young children',
    body: 'Children breathe more air for their body size and their lungs are still developing, so the same reading means more exposure for them.',
  },
  {
    title: 'People with asthma or heart conditions',
    body: 'Declare a sensitivity and every threshold tightens by one band, so precautions start before the official warning does.',
  },
  {
    title: 'Neighbourhood and school groups',
    body: 'Shareable steps that reduce the sources on a street, without passing on anyone’s household or health details.',
  },
];
