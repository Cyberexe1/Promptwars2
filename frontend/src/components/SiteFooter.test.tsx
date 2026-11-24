import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import App from '../App';
import { renderWithRouter } from '../test/render';
import { stubApi } from '../test/server';

function footer() {
  return screen.getByRole('contentinfo');
}

describe('SiteFooter', () => {
  it('groups links under named column headings', () => {
    stubApi();
    renderWithRouter(<App />, '/');

    for (const title of [/^product$/i, /^documentation$/i, /^data sources$/i]) {
      expect(
        within(footer()).getByRole('heading', { name: title }),
      ).toBeInTheDocument();
    }
  });

  it('carries the medical disclaimer', () => {
    stubApi();
    renderWithRouter(<App />, '/');

    expect(within(footer()).getByText(/not medical advice/i)).toBeInTheDocument();
  });

  it('shows a copyright line with the current year', () => {
    stubApi();
    renderWithRouter(<App />, '/');

    expect(
      within(footer()).getByText(new RegExp(String(new Date().getFullYear()))),
    ).toBeInTheDocument();
  });

  it('has no placeholder or dead links', () => {
    stubApi();
    renderWithRouter(<App />, '/');

    for (const link of within(footer()).getAllByRole('link')) {
      const href = link.getAttribute('href');
      expect(href).toBeTruthy();
      expect(href).not.toBe('#');
      expect(href).not.toMatch(/example\.com|placeholder|todo/i);
    }
  });

  it('points every external link at a real documented source', () => {
    stubApi();
    renderWithRouter(<App />, '/');

    const external = within(footer())
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href')?.startsWith('http'));

    expect(external.length).toBeGreaterThan(0);
    for (const link of external) {
      expect(link.getAttribute('href')).toMatch(
        /github\.com|open-meteo\.com|epa\.gov/,
      );
      // Opening a new tab without noreferrer leaks the referring page.
      expect(link).toHaveAttribute('rel', expect.stringContaining('noreferrer'));
    }
  });

  it('links internal routes through the router, not a full page load', () => {
    stubApi();
    renderWithRouter(<App />, '/');

    const internal = within(footer())
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href')?.startsWith('/'));

    expect(internal.map((link) => link.getAttribute('href'))).toEqual(
      expect.arrayContaining(['/', '/dashboard', '/privacy']),
    );
  });

  it('appears on every route', () => {
    for (const route of ['/', '/dashboard', '/privacy', '/missing']) {
      stubApi();
      const { unmount } = renderWithRouter(<App />, route);
      expect(screen.getByRole('contentinfo')).toBeInTheDocument();
      unmount();
    }
  });
});
