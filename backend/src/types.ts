/**
 * Domain types shared across the API surface.
 *
 * The frontend mirrors these in `frontend/src/types.ts`. Keep both in sync when
 * the contract changes.
 */

export type AgeGroup = 'child' | 'adult' | 'older-adult' | 'pregnant';

export type CommuteMethod =
  | 'car'
  | 'motorbike'
  | 'public-transport'
  | 'walk'
  | 'cycle'
  | 'work-from-home';

export type CookingFuel = 'gas' | 'electric' | 'biomass';

export type Budget = 'low' | 'medium' | 'high';

export interface HouseholdProfile {
  ageGroups: AgeGroup[];
  /** Diagnosed respiratory or cardiovascular sensitivity in the household. */
  sensitive: boolean;
  commuteMethod: CommuteMethod;
  /** Planned outdoor minutes on a typical day. */
  outdoorMinutes: number;
  cookingFuel: CookingFuel;
  purifier: boolean;
  budget: Budget;
}

export interface LocationInput {
  name: string;
  latitude: number;
  longitude: number;
}

export interface LocationSuggestion extends LocationInput {
  id: number;
  country: string;
  admin1?: string;
}

/**
 * Risk bands follow the US EPA AQI categories. `sensitive-unhealthy` is the
 * EPA "Unhealthy for Sensitive Groups" band.
 */
export type RiskLevel =
  | 'good'
  | 'moderate'
  | 'sensitive-unhealthy'
  | 'unhealthy'
  | 'very-unhealthy'
  | 'hazardous';

export interface CurrentAirQuality {
  /** US EPA AQI. Null when the provider omits the value for this location. */
  usAqi: number | null;
  europeanAqi: number | null;
  pm25: number | null;
  pm10: number | null;
  nitrogenDioxide: number | null;
  ozone: number | null;
  /** ISO 8601 UTC timestamp of the observation. */
  observedAt: string;
}

export interface DataSource {
  name: string;
  url: string;
  /** ISO 8601 UTC timestamp of when this service fetched the reading. */
  retrievedAt: string;
}

export interface RiskAssessment {
  level: RiskLevel;
  label: string;
  advice: string;
  /**
   * Band actually used for recommendations. One step stricter than `level`
   * when the household reported a sensitivity.
   */
  effectiveLevel: RiskLevel;
  escalatedForSensitivity: boolean;
}

/** One hour of the forecast series. */
export interface HourlyReading {
  /** ISO 8601 UTC timestamp for the top of the hour. */
  time: string;
  usAqi: number | null;
}

/**
 * The next 24 hours, used to answer "when is the air cleanest today?".
 *
 * This exists because the plan's central advice is to move outdoor time away
 * from the pollution peak, which is unusable without knowing when the peak is.
 */
export interface Outlook {
  hours: HourlyReading[];
  /** ISO time of the lowest-AQI hour in the usable window, if any. */
  cleanestHour: string | null;
  /** ISO time of the highest-AQI hour in the usable window, if any. */
  worstHour: string | null;
  /**
   * Seconds to add to a UTC time to get local time at the looked-up place.
   *
   * Needed because "go out at 2pm" means 2pm where the air is, not where the
   * browser is. A user checking Delhi from London must not be told to go
   * outside at a London hour.
   */
  utcOffsetSeconds: number;
  /**
   * AQI spread across the usable window, or null when nothing is forecast.
   *
   * Decides whether retiming advice is worth giving at all. In severe smog the
   * series is often flat, and telling someone to shift their walk to a cleaner
   * hour that is no cleaner is worse than saying there is no good window.
   */
  windowSpread: number | null;
}

export interface AirQualityResponse {
  location: LocationInput;
  current: CurrentAirQuality;
  risk: RiskAssessment;
  source: DataSource;
  /** True when the observation is older than the freshness window. */
  stale: boolean;
  /** Absent when the provider returned no usable hourly series. */
  outlook?: Outlook;
}

export type RecommendationCategory = 'routine' | 'indoor' | 'transport' | 'health';

export type CostLevel = 'free' | 'low' | 'medium' | 'high';

export type EffortLevel = 'easy' | 'moderate' | 'hard';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface Recommendation {
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
  /** Cuts pollution at source rather than only shielding the household. */
  reducesEmissions: boolean;
  /** Safe to publish in a shared checklist, and useful to others there. */
  communityBenefit: boolean;
}

export interface RecommendationsResponse {
  summary: string;
  risk: RiskAssessment;
  recommendations: Recommendation[];
  /** `rules` means the deterministic engine produced the final wording. */
  generatedBy: 'rules' | 'bedrock';
  disclaimer: string;
  airQuality: {
    current: CurrentAirQuality;
    source: DataSource;
    stale: boolean;
  };
}
