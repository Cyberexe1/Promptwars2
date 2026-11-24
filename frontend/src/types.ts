/**
 * API contract types.
 *
 * These mirror `backend/src/types.ts`. Keep both in sync when the contract
 * changes.
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
  sensitive: boolean;
  commuteMethod: CommuteMethod;
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

export type RiskLevel =
  | 'good'
  | 'moderate'
  | 'sensitive-unhealthy'
  | 'unhealthy'
  | 'very-unhealthy'
  | 'hazardous';

export interface CurrentAirQuality {
  usAqi: number | null;
  europeanAqi: number | null;
  pm25: number | null;
  pm10: number | null;
  nitrogenDioxide: number | null;
  ozone: number | null;
  observedAt: string;
}

export interface DataSource {
  name: string;
  url: string;
  retrievedAt: string;
}

export interface RiskAssessment {
  level: RiskLevel;
  label: string;
  advice: string;
  effectiveLevel: RiskLevel;
  escalatedForSensitivity: boolean;
}

/** One hour of the forecast series. */
export interface HourlyReading {
  time: string;
  usAqi: number | null;
}

/** The next 24 hours, used to answer "when is the air cleanest today?". */
export interface Outlook {
  hours: HourlyReading[];
  cleanestHour: string | null;
  worstHour: string | null;
}

export interface AirQualityResponse {
  location: LocationInput;
  current: CurrentAirQuality;
  risk: RiskAssessment;
  source: DataSource;
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
}

export interface RecommendationsResponse {
  summary: string;
  risk: RiskAssessment;
  recommendations: Recommendation[];
  generatedBy: 'rules' | 'bedrock';
  disclaimer: string;
  airQuality: {
    current: CurrentAirQuality;
    source: DataSource;
    stale: boolean;
  };
}
