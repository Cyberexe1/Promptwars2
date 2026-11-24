import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, fetchAirQuality, fetchRecommendations } from '../api';
import { AirQualityPanel } from '../components/AirQualityPanel';
import { LocationPicker } from '../components/LocationPicker';
import { ProfileForm } from '../components/ProfileForm';
import { RecommendationList } from '../components/RecommendationList';
import { StepIndicator } from '../components/StepIndicator';
import { DEFAULT_PROFILE } from '../defaults';
import type {
  AirQualityResponse,
  HouseholdProfile,
  LocationInput,
  RecommendationsResponse,
} from '../types';

/** A fetch result tagged with the location it describes. */
interface Resolved<T> {
  location: LocationInput;
  data: T | null;
  error: string | null;
}

function sameLocation(a: LocationInput | null, b: LocationInput | null): boolean {
  if (!a || !b) return false;
  return a.latitude === b.latitude && a.longitude === b.longitude;
}

function messageFor(cause: unknown, fallback: string): string {
  return cause instanceof ApiError ? cause.message : fallback;
}

export function DashboardPage() {
  const [location, setLocation] = useState<LocationInput | null>(null);
  const [profile, setProfile] = useState<HouseholdProfile>(DEFAULT_PROFILE);

  // Results carry their location so a change of location invalidates them
  // during render, rather than through a cascade of state resets.
  const [reading, setReading] = useState<Resolved<AirQualityResponse> | null>(null);
  const [plan, setPlan] = useState<Resolved<RecommendationsResponse> | null>(null);

  const [loadingPlan, setLoadingPlan] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [online, setOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  const planRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function update() {
      setOnline(navigator.onLine);
    }
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  // Load the current reading whenever the chosen location changes.
  useEffect(() => {
    if (!location) return;

    const controller = new AbortController();

    fetchAirQuality(location, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setReading({ location, data, error: null });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setReading({
          location,
          data: null,
          error: messageFor(cause, 'The air-quality reading could not be loaded.'),
        });
      });

    return () => controller.abort();
  }, [location]);

  const currentReading = sameLocation(reading?.location ?? null, location)
    ? reading
    : null;
  const currentPlan = sameLocation(plan?.location ?? null, location) ? plan : null;
  const loadingReading = location !== null && currentReading === null;

  const handleSubmit = useCallback(() => {
    if (!location) {
      setValidationError('Choose a location first.');
      return;
    }
    if (profile.ageGroups.length === 0) {
      setValidationError('Select at least one person who lives with you.');
      return;
    }
    if (
      !Number.isFinite(profile.outdoorMinutes) ||
      profile.outdoorMinutes < 0 ||
      profile.outdoorMinutes > 480
    ) {
      setValidationError('Outdoor minutes must be between 0 and 480.');
      return;
    }

    setValidationError(null);
    setLoadingPlan(true);

    fetchRecommendations(location, profile)
      .then((data) => {
        setPlan({ location, data, error: null });
        // Move focus to the result so keyboard and screen-reader users land on
        // the new content instead of hunting for it.
        requestAnimationFrame(() => planRef.current?.focus());
      })
      .catch((cause: unknown) => {
        setPlan({
          location,
          data: null,
          error: messageFor(
            cause,
            'Your plan could not be generated. Please try again.',
          ),
        });
      })
      .finally(() => setLoadingPlan(false));
  }, [location, profile]);

  // Step 1 is done once a reading loads; step 2 once a plan is generated.
  const completed: number[] = [];
  if (currentReading?.data) completed.push(1);
  if (currentPlan?.data) completed.push(2);

  const currentStep = currentPlan?.data ? 3 : currentReading?.data ? 2 : 1;

  return (
    <div className="shell dashboard">
      <header className="dashboard-head">
        <p className="eyebrow">Dashboard</p>
        <h1>Build today&rsquo;s clean-air plan</h1>
        <p className="lede">
          Pick a location for a live reading, then add a few details about your
          household to get steps you can act on today.
        </p>
      </header>

      <StepIndicator current={currentStep} completed={completed} />

      {!online && (
        <p className="alert alert-warning" role="status">
          You are offline. Reconnect to load a live air-quality reading.
        </p>
      )}

      <LocationPicker selected={location} onSelect={setLocation} />

      {loadingReading && (
        <section className="card" aria-busy="true">
          <p className="sr-only" role="status">
            Loading the current reading for {location?.name}.
          </p>
          <div className="skeleton skeleton-title" />
          <div className="skeleton skeleton-number" />
          <div className="skeleton skeleton-line" />
          <div className="skeleton skeleton-line short" />
        </section>
      )}

      {currentReading?.error && (
        <p className="alert alert-error" role="alert">
          {currentReading.error}
        </p>
      )}

      {currentReading?.data && <AirQualityPanel data={currentReading.data} />}

      <ProfileForm
        profile={profile}
        onChange={setProfile}
        onSubmit={handleSubmit}
        busy={loadingPlan}
        disabled={!location}
        validationError={validationError}
      />

      <div
        ref={planRef}
        tabIndex={-1}
        aria-live="polite"
        aria-busy={loadingPlan}
        className="plan-region"
      >
        {loadingPlan && (
          <section className="card" aria-busy="true">
            <p className="sr-only" role="status">
              Building a plan for your household.
            </p>
            <div className="skeleton skeleton-title" />
            <div className="skeleton skeleton-line" />
            <div className="skeleton skeleton-line" />
            <div className="skeleton skeleton-line short" />
          </section>
        )}

        {!loadingPlan && currentPlan?.error && (
          <p className="alert alert-error" role="alert">
            {currentPlan.error}
          </p>
        )}

        {!loadingPlan && currentPlan?.data && (
          <RecommendationList plan={currentPlan.data} />
        )}
      </div>
    </div>
  );
}
