import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { renderWithRouter } from './test/render';
import { stubApi } from './test/server';

/** Routing and shell behaviour. Page content is covered per route. */
describe('routing', () => {
  it('shows the landing page at the root', () => {
    stubApi();
    renderWithRouter(<App />, '/');

    expect(
      screen.getByRole('heading', { level: 1, name: /what today.s air means/i }),
    ).toBeInTheDocument();
  });

  it('shows the dashboard at /dashboard', () => {
    stubApi();
    renderWithRouter(<App />, '/dashboard');

    expect(
      screen.getByRole('heading', { level: 1, name: /clean-air plan/i }),
    ).toBeInTheDocument();
  });

  it('navigates from the landing call to action to the dashboard', async () => {
    stubApi();
    const user = userEvent.setup();
    renderWithRouter(<App />, '/');

    await user.click(screen.getByRole('link', { name: /check my air now/i }));

    expect(
      await screen.findByRole('heading', { level: 1, name: /clean-air plan/i }),
    ).toBeInTheDocument();
  });

  it('navigates back home from the header', async () => {
    stubApi();
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
    renderWithRouter(<App />, '/dashboard');

    await user.tab();
    expect(screen.getByRole('link', { name: /skip to main content/i })).toHaveFocus();
  });

  it('marks the active route in the navigation', () => {
    stubApi();
    renderWithRouter(<App />, '/dashboard');

    // The footer links to the same routes, so these queries are scoped to the
    // main navigation.
    const nav = screen.getByRole('navigation', { name: 'Main' });
    const active = within(nav).getByRole('link', { name: 'Dashboard' });

    expect(active).toHaveAttribute('aria-current', 'page');
    expect(
      within(nav).getByRole('link', { name: 'Home' }),
    ).not.toHaveAttribute('aria-current');
  });

  it('offers the call to action only where it is not redundant', () => {
    stubApi();
    const { unmount } = renderWithRouter(<App />, '/');
    const header = screen.getByRole('banner');

    expect(
      within(header).getByRole('link', { name: /check my air/i }),
    ).toBeInTheDocument();
    unmount();

    stubApi();
    renderWithRouter(<App />, '/dashboard');
    expect(
      within(screen.getByRole('banner')).queryByRole('link', {
        name: /check my air/i,
      }),
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
