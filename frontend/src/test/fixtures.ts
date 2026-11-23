import type {
  AirQualityResponse,
  LocationSuggestion,
  RecommendationsResponse,
} from '../types';

/** Shared API fixtures. Values mirror a real Delhi winter reading. */

export const DELHI_SUGGESTION: LocationSuggestion = {
  id: 1261481,
  name: 'Delhi',
  country: 'India',
  admin1: 'Delhi',
  latitude: 28.65195,
  longitude: 77.23149,
};

export const OBSERVED_AT = '2026-11-23T15:00:00.000Z';

export const AIR_QUALITY: AirQualityResponse = {
  location: { name: 'Delhi, Delhi, India', latitude: 28.65195, longitude: 77.23149 },
  current: {
    usAqi: 183,
    europeanAqi: 70,
    pm25: 69.6,
    pm10: 140.5,
    nitrogenDioxide: 48.3,
    ozone: 12.1,
    observedAt: OBSERVED_AT,
  },
  risk: {
    level: 'unhealthy',
    label: 'Unhealthy',
    advice:
      'Everyone should reduce time outdoors and avoid strenuous outdoor exercise.',
    effectiveLevel: 'unhealthy',
    escalatedForSensitivity: false,
  },
  source: {
    name: 'Open-Meteo Air Quality API',
    url: 'https://open-meteo.com/en/docs/air-quality-api',
    retrievedAt: OBSERVED_AT,
  },
  stale: false,
};

export const PLAN: RecommendationsResponse = {
  summary: 'US AQI is 183 in Delhi, rated unhealthy.',
  risk: AIR_QUALITY.risk,
  recommendations: [
    {
      id: 'pause-outdoor-exercise',
      category: 'routine',
      title: 'Pause outdoor exercise until the air improves',
      action: 'Cancel outdoor workouts and sports today.',
      why: 'Health agencies advise everyone to avoid outdoor exertion at this level.',
      personalImpact: 'Avoids the largest avoidable exposure in a typical day.',
      communityImpact: 'None directly.',
      cost: 'free',
      effort: 'moderate',
      confidence: 'high',
    },
    {
      id: 'keep-windows-closed',
      category: 'indoor',
      title: 'Keep windows closed and seal the obvious gaps',
      action: 'Close windows and block draughts under external doors.',
      why: 'Outdoor particles follow air leaks indoors.',
      personalImpact: 'Protects the hours you spend inside.',
      communityImpact: 'None directly.',
      cost: 'free',
      effort: 'easy',
      confidence: 'high',
    },
    {
      id: 'well-fitted-mask',
      category: 'health',
      title: 'Wear a well-fitted respirator outdoors',
      action: 'Use an N95 or FFP2 respirator for unavoidable outdoor time.',
      why: 'These filter fine particles effectively, but only when sealed.',
      personalImpact: 'Substantially reduces inhaled particles when well sealed.',
      communityImpact: 'None directly.',
      cost: 'low',
      effort: 'easy',
      confidence: 'high',
    },
    {
      id: 'swap-car-trips',
      category: 'transport',
      title: 'Replace one car trip with a lower-emission option',
      action: 'Take public transport for your most repeated journey.',
      why: 'Short urban trips with a cold engine pollute most per kilometre.',
      personalImpact: 'Cuts your own emissions in proportion to distance removed.',
      communityImpact: 'Removes tailpipe output from shared street air.',
      cost: 'free',
      effort: 'moderate',
      confidence: 'high',
    },
  ],
  generatedBy: 'rules',
  disclaimer:
    'SmogWise gives general environmental-health guidance, not medical advice.',
  airQuality: {
    current: AIR_QUALITY.current,
    source: AIR_QUALITY.source,
    stale: false,
  },
};
