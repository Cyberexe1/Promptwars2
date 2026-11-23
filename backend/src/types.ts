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

export interface AirQualityResponse {
  location: LocationInput;
  current: CurrentAirQuality;
  risk: RiskAssessment;
  source: DataSource;
  /** True when the observation is older than the freshness window. */
  stale: boolean;
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
