import { useId, useState } from 'react';
import { formatTimestamp } from '../labels';
import { deleteAllPlans, deletePlan, type SavedPlan } from '../storage';

interface SavedPlansProps {
  plans: SavedPlan[];
  onChange: () => void;
}

/**
 * Saved plans, with deletion under the user's control.
 *
 * Deletion is immediate and complete: the entry is removed from local storage
 * rather than flagged, because there is no server copy to reconcile with.
 * A confirmation step guards "delete all", which is not individually
 * reversible.
 */
export function SavedPlans({ plans, onChange }: SavedPlansProps) {
  const headingId = useId();
  const [confirmingClearAll, setConfirmingClearAll] = useState(false);

  if (plans.length === 0) {
    return null;
  }

  function remove(id: string) {
    deletePlan(id);
    onChange();
  }

  function removeAll() {
    deleteAllPlans();
    setConfirmingClearAll(false);
    onChange();
  }

  return (
    <section className="card" aria-labelledby={headingId}>
      <h2 id={headingId}>Your saved plans</h2>

      <p className="hint">
        Kept in this browser only. They never reach a server, so they will not
        appear on another device, and clearing your browser data removes them.
      </p>

      <ul className="saved-list">
        {plans.map((entry) => {
          const aqi = entry.plan.airQuality.current.usAqi;
          return (
            <li key={entry.id} className="saved-item">
              <div className="saved-text">
                <p className="saved-place">{entry.locationName}</p>
                <p className="hint">
                  {aqi === null ? 'No index reported' : `US AQI ${aqi}`} &middot;{' '}
                  {entry.plan.risk.label} &middot; saved{' '}
                  {formatTimestamp(entry.savedAt)}
                </p>
              </div>
              <button
                type="button"
                className="button button-danger"
                onClick={() => remove(entry.id)}
              >
                Delete
                <span className="sr-only">
                  {' '}
                  the plan for {entry.locationName} saved{' '}
                  {formatTimestamp(entry.savedAt)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {confirmingClearAll ? (
        <div className="confirm-row" role="group" aria-label="Confirm deletion">
          <p className="confirm-text">
            Delete all {plans.length} saved plans? This cannot be undone.
          </p>
          <div className="button-row">
            <button type="button" className="button button-danger" onClick={removeAll}>
              Yes, delete everything
            </button>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setConfirmingClearAll(false)}
            >
              Keep them
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="button button-secondary"
          onClick={() => setConfirmingClearAll(true)}
        >
          Delete all saved plans
        </button>
      )}
    </section>
  );
}
