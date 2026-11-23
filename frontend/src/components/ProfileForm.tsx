import { useId } from 'react';
import {
  AGE_GROUP_LABELS,
  BUDGET_LABELS,
  COMMUTE_LABELS,
  COOKING_FUEL_LABELS,
} from '../labels';
import type {
  AgeGroup,
  Budget,
  CommuteMethod,
  CookingFuel,
  HouseholdProfile,
} from '../types';

interface ProfileFormProps {
  profile: HouseholdProfile;
  onChange: (profile: HouseholdProfile) => void;
  onSubmit: () => void;
  busy: boolean;
  disabled: boolean;
  validationError: string | null;
}

const AGE_GROUPS = Object.keys(AGE_GROUP_LABELS) as AgeGroup[];
const COMMUTES = Object.keys(COMMUTE_LABELS) as CommuteMethod[];
const FUELS = Object.keys(COOKING_FUEL_LABELS) as CookingFuel[];
const BUDGETS = Object.keys(BUDGET_LABELS) as Budget[];

/**
 * Household details form.
 *
 * Every control is a native element with an associated label, grouped in
 * fieldsets so screen readers announce the question with each option. All
 * fields are optional in spirit: sensible defaults mean the user can submit
 * immediately.
 */
export function ProfileForm({
  profile,
  onChange,
  onSubmit,
  busy,
  disabled,
  validationError,
}: ProfileFormProps) {
  const minutesId = useId();
  const sensitiveId = useId();
  const purifierId = useId();
  const errorId = useId();

  function toggleAgeGroup(group: AgeGroup) {
    const next = profile.ageGroups.includes(group)
      ? profile.ageGroups.filter((item) => item !== group)
      : [...profile.ageGroups, group];
    onChange({ ...profile, ageGroups: next });
  }

  return (
    <form
      className="card"
      aria-labelledby="profile-heading"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      noValidate
    >
      <h2 id="profile-heading">
        <span className="step-number" aria-hidden="true">
          2
        </span>
        Tell us about your household
      </h2>
      <p className="hint">
        This shapes the advice. Nothing here is required to be exact, and it is
        kept on your device unless you ask for a plan.
      </p>

      <fieldset>
        <legend>Who lives with you?</legend>
        <p className="hint" id="age-hint">
          Select everyone that applies. Children, older adults, and pregnant
          people are affected more by particle pollution.
        </p>
        <div className="checkbox-group" aria-describedby="age-hint">
          {AGE_GROUPS.map((group) => (
            <label key={group} className="choice">
              <input
                type="checkbox"
                checked={profile.ageGroups.includes(group)}
                onChange={() => toggleAgeGroup(group)}
              />
              <span>{AGE_GROUP_LABELS[group]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="field">
        <label className="choice" htmlFor={sensitiveId}>
          <input
            id={sensitiveId}
            type="checkbox"
            checked={profile.sensitive}
            onChange={(event) =>
              onChange({ ...profile, sensitive: event.target.checked })
            }
          />
          <span>
            Someone here has a diagnosed heart or lung condition, such as asthma
          </span>
        </label>
      </div>

      <fieldset>
        <legend>How do you usually travel?</legend>
        <div className="radio-group">
          {COMMUTES.map((method) => (
            <label key={method} className="choice">
              <input
                type="radio"
                name="commute"
                value={method}
                checked={profile.commuteMethod === method}
                onChange={() => onChange({ ...profile, commuteMethod: method })}
              />
              <span>{COMMUTE_LABELS[method]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="field">
        <label htmlFor={minutesId}>
          Minutes you expect to spend outdoors today
        </label>
        <input
          id={minutesId}
          type="number"
          inputMode="numeric"
          min={0}
          max={480}
          step={15}
          value={profile.outdoorMinutes}
          onChange={(event) =>
            onChange({
              ...profile,
              outdoorMinutes: Number(event.target.value),
            })
          }
        />
        <span className="hint">Anything from 0 to 480 minutes.</span>
      </div>

      <fieldset>
        <legend>What do you cook with?</legend>
        <div className="radio-group">
          {FUELS.map((fuel) => (
            <label key={fuel} className="choice">
              <input
                type="radio"
                name="fuel"
                value={fuel}
                checked={profile.cookingFuel === fuel}
                onChange={() => onChange({ ...profile, cookingFuel: fuel })}
              />
              <span>{COOKING_FUEL_LABELS[fuel]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="field">
        <label className="choice" htmlFor={purifierId}>
          <input
            id={purifierId}
            type="checkbox"
            checked={profile.purifier}
            onChange={(event) =>
              onChange({ ...profile, purifier: event.target.checked })
            }
          />
          <span>We already have an air purifier</span>
        </label>
      </div>

      <fieldset>
        <legend>What can you spend on changes?</legend>
        <div className="radio-group">
          {BUDGETS.map((budget) => (
            <label key={budget} className="choice">
              <input
                type="radio"
                name="budget"
                value={budget}
                checked={profile.budget === budget}
                onChange={() => onChange({ ...profile, budget })}
              />
              <span>{BUDGET_LABELS[budget]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {validationError && (
        <p className="alert alert-error" id={errorId} role="alert">
          {validationError}
        </p>
      )}

      <button
        type="submit"
        className="button button-primary"
        disabled={busy || disabled}
        {...(validationError ? { 'aria-describedby': errorId } : {})}
      >
        {busy ? 'Building your plan…' : 'Build my clean-air plan'}
      </button>

      {disabled && (
        <p className="hint">Choose a location above to enable this.</p>
      )}
    </form>
  );
}
