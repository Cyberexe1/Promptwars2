import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import App from '../App';
import { renderWithRouter } from '../test/render';
import { stubApi } from '../test/server';

describe('privacy page', () => {
  it('is reachable at /privacy', () => {
    stubApi();
    renderWithRouter(<App />, '/privacy');

    expect(
      screen.getByRole('heading', { level: 1, name: /what smogwise does/i }),
    ).toBeInTheDocument();
  });

  it('has no detectable accessibility violations', async () => {
    stubApi();
    const { container } = renderWithRouter(<App />, '/privacy');

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('states the claims that matter for a health-adjacent app', () => {
    stubApi();
    renderWithRouter(<App />, '/privacy');

    for (const claim of [
      /no analytics, advertising, or third-party tracking/i,
      /no tracking cookies/i,
      /no storage of health answers/i,
      /no storage of your plans/i,
    ]) {
      expect(screen.getByText(claim)).toBeInTheDocument();
    }
  });

  it('explains that saved plans never leave the device', () => {
    stubApi();
    renderWithRouter(<App />, '/privacy');

    expect(screen.getByText(/on your device only/i)).toBeInTheDocument();
  });

  it('is explicit that the password itself is not stored', () => {
    stubApi();
    renderWithRouter(<App />, '/privacy');

    expect(screen.getByText(/scrypt hash/i)).toBeInTheDocument();
    expect(screen.getByText(/cannot be reversed/i)).toBeInTheDocument();
  });

  it('describes the session cookie protections', () => {
    stubApi();
    renderWithRouter(<App />, '/privacy');

    expect(screen.getByText('HttpOnly')).toBeInTheDocument();
    expect(screen.getByText('SameSite=Lax')).toBeInTheDocument();
  });

  it('names the third-party services it depends on', () => {
    stubApi();
    renderWithRouter(<App />, '/privacy');

    expect(
      screen.getByRole('link', { name: /open-meteo$/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/amazon bedrock/i)).toBeInTheDocument();
  });

  it('offers a way to verify the claims rather than asking for trust', () => {
    stubApi();
    renderWithRouter(<App />, '/privacy');

    expect(
      screen.getByRole('link', { name: /read the source/i }),
    ).toHaveAttribute('href', expect.stringContaining('github.com'));
  });

  it('fetches no data of its own, being static content', () => {
    const fetchMock = stubApi();
    renderWithRouter(<App />, '/privacy');

    // The shell checks the session on every route; the page itself must not
    // request anything beyond that.
    const dataCalls = fetchMock.mock.calls.filter(
      ([url]) => !String(url).includes('/api/auth/'),
    );
    expect(dataCalls).toHaveLength(0);
  });
});
