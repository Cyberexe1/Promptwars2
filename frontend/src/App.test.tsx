import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { renderWithRouter } from './test/render';
import { stubApi } from './test/server';

/**
 * Routing and shell behaviour. Page content is covered per route, and
 * session-dependent navigation is covered in `routes/LoginPage.test.tsx`.
 */
describe('routing', () => {
  it('shows the landing page at the root', () => {
    stubApi();
    renderWithRouter(<App />, '/');

    expect(
      screen.getByRole('heading', { level: 1, name: /what today.s air means/i }),
    ).toBeInTheDocument();
  });

  it('shows the dashboard at /dashboard for a signed-in visitor', async () => {
    stubApi({ signedIn: true });
    renderWithRouter(<App />, '/dashboard');

    expect(
      await screen.findByRole('heading', { level: 1, name: /clean-air plan/i }),
    ).toBeInTheDocument();
  });

  it('shows the privacy page at /privacy', () => {
    stubApi();
    renderWithRouter(<App />, '/privacy');

    expect(
      screen.getByRole('heading', { level: 1, name: /what smogwise does/i }),
    ).toBeInTheDocument();
  });

  it('sends a signed-out visitor from the landing call to action to sign-in', async () => {
    stubApi();
    const user = userEvent.setup();
    renderWithRouter(<App />, '/');

    await user.click(screen.getByRole('link', { name: /check my air now/i }));

    // The guard redirects rather than showing a dashboard they cannot use.
    expect(
      await screen.findByRole('heading', { level: 1, name: /sign in to smogwise/i }),
    ).toBeInTheDocument();
  });

  it('takes a signed-in visitor straight from the call to action to the dashboard', async () => {
    stubApi({ signedIn: true });
    const user = userEvent.setup();
    renderWithRouter(<App />, '/');

    await user.click(screen.getByRole('link', { name: /check my air now/i }));

    expect(
      await screen.findByRole('heading', { level: 1, name: /clean-air plan/i }),
    ).toBeInTheDocument();
  });

  it('navigates back home from the header', async () => {
    stubApi({ signedIn: true });
    const user = userEvent.setup();
    renderWithRouter(<App />, '/dashboard');

    // Scoped to the banner: the footer carries its own brand link.
    const header = screen.getByRole('banner');
    await user.click(
      within(header).getByRole('link', { name: /smogwise home/i }),
    );

    expect(
      await screen.findByRole('heading', { level: 1, name: /what today.s air means/i }),
    ).toBeInTheDocument();
  });

  it('shows a helpful page for an unknown route', () => {
    stubApi();
    renderWithRouter(<App />, '/no-such-page');

    expect(
      screen.getByRole('heading', { level: 1, name: /does not exist/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /go to the dashboard/i }),
    ).toBeInTheDocument();
  });
});

describe('shell', () => {
  it('puts the skip link first in the tab order on every route', async () => {
    stubApi();
    const user = userEvent.setup();
    renderWithRouter(<App />, '/');

    await user.tab();
    expect(screen.getByRole('link', { name: /skip to main content/i })).toHaveFocus();
  });

  it('marks the active route in the navigation', async () => {
    stubApi({ signedIn: true });
    renderWithRouter(<App />, '/dashboard');

    // The footer links to the same routes, so these queries are scoped to the
    // main navigation.
    const nav = screen.getByRole('navigation', { name: 'Main' });
    const active = await within(nav).findByRole('link', { name: 'Dashboard' });

    expect(active).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Home' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('hides the sign-in action on the sign-in page itself', async () => {
    stubApi();
    renderWithRouter(<App />, '/login');
    await screen.findByLabelText(/email address/i);

    expect(
      within(screen.getByRole('banner')).queryByRole('link', { name: /log in/i }),
    ).not.toBeInTheDocument();
  });

  it('exposes a single main landmark that the skip link targets', () => {
    stubApi();
    renderWithRouter(<App />, '/');

    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', 'main');
    expect(screen.getByRole('link', { name: /skip to main content/i })).toHaveAttribute(
      'href',
      '#main',
    );
  });

  it('shows the data sources and licence context in the footer', () => {
    stubApi();
    renderWithRouter(<App />, '/');

    const footer = screen.getByRole('contentinfo');
    expect(footer).toHaveTextContent(/open-meteo/i);
    expect(footer).toHaveTextContent(/us epa air quality index/i);
  });
});
