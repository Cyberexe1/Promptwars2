import { beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import App from '../App';
import { renderWithRouter } from '../test/render';
import { stubApi } from '../test/server';

/**
 * This route is code-split, so every case waits for the chunk to load before
 * querying. A synchronous query would run against the Suspense fallback.
 */
async function renderPrivacy() {
  stubApi();
  const rendered = renderWithRouter(<App />, '/privacy');
  await screen.findByRole('heading', { level: 1, name: /what smogwise does/i });
  return rendered;
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('privacy page', () => {
  it('is reachable at /privacy', async () => {
    await renderPrivacy();

    expect(
      screen.getByRole('heading', { level: 1, name: /what smogwise does/i }),
    ).toBeInTheDocument();
  });

  it('has no detectable accessibility violations', async () => {
    const { container } = await renderPrivacy();

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('states the claims that matter for a health-adjacent app', async () => {
    await renderPrivacy();

    for (const claim of [
      /no analytics, advertising, or third-party tracking/i,
      /no tracking cookies/i,
      /no storage of health answers/i,
      /no storage of your plans/i,
    ]) {
      expect(screen.getByText(claim)).toBeInTheDocument();
    }
  });

  it('explains that saved plans never leave the device', async () => {
    await renderPrivacy();

    expect(screen.getByText(/on your device only/i)).toBeInTheDocument();
  });

  it('is explicit that the password itself is not stored', async () => {
    await renderPrivacy();

    expect(screen.getByText(/scrypt hash/i)).toBeInTheDocument();
    expect(screen.getByText(/cannot be reversed/i)).toBeInTheDocument();
  });

  it('describes the session cookie protections', async () => {
    await renderPrivacy();

    expect(screen.getByText('HttpOnly')).toBeInTheDocument();
    expect(screen.getByText('SameSite=Lax')).toBeInTheDocument();
  });

  it('names the third-party services it depends on', async () => {
    await renderPrivacy();

    expect(screen.getByRole('link', { name: /open-meteo$/i })).toBeInTheDocument();
    expect(screen.getByText(/amazon bedrock/i)).toBeInTheDocument();
  });

  it('offers a way to verify the claims rather than asking for trust', async () => {
    await renderPrivacy();

    expect(screen.getByRole('link', { name: /read the source/i })).toHaveAttribute(
      'href',
      expect.stringContaining('github.com'),
    );
  });

  it('fetches no data of its own, being static content', async () => {
    stubApi();
    const fetchMock = stubApi();
    renderWithRouter(<App />, '/privacy');
    await screen.findByRole('heading', { level: 1, name: /what smogwise does/i });

    // The shell checks the session on every route; the page itself must not
    // request anything beyond that.
    const dataCalls = fetchMock.mock.calls.filter(
      ([url]) => !String(url).includes('/api/auth/'),
    );
    expect(dataCalls).toHaveLength(0);
  });
});
