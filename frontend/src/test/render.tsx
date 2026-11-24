import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * Renders a component inside a router.
 *
 * `MemoryRouter` keeps navigation in memory, so tests can start on any route
 * without touching browser history.
 */
export function renderWithRouter(ui: ReactElement, route = '/') {
  return render(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>);
}
