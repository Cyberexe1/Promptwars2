interface StepIndicatorProps {
  /** 1-based index of the step the user is currently on. */
  current: number;
  /** Steps the user has finished. */
  completed: number[];
}

const STEP_NAMES = ['Location', 'Household', 'Your plan'];

/**
 * Progress through the three dashboard steps.
 *
 * State is carried in text ("done", "current", "to do") as well as styling, and
 * `aria-current="step"` marks the active item, so progress is not conveyed by
 * colour or position alone.
 */
export function StepIndicator({ current, completed }: StepIndicatorProps) {
  return (
    <nav aria-label="Progress" className="stepper">
      <ol>
        {STEP_NAMES.map((name, index) => {
          const number = index + 1;
          const isDone = completed.includes(number);
          const isCurrent = number === current;
          const state = isDone ? 'done' : isCurrent ? 'current' : 'todo';

          return (
            <li
              key={name}
              className="stepper-item"
              data-state={state}
              {...(isCurrent ? { 'aria-current': 'step' as const } : {})}
            >
              <span className="stepper-badge" aria-hidden="true">
                {isDone ? '✓' : number}
              </span>
              <span className="stepper-text">
                <span className="stepper-name">{name}</span>
                <span className="stepper-state">
                  {isDone ? 'Done' : isCurrent ? 'Current step' : 'To do'}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
