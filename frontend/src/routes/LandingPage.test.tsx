import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { LandingPage } from './LandingPage';
import { AIR_QUALITY } from '../test/fixtures';
import { renderWithRouter } from '../test/render';
import { errorResponse, jsonResponse, stubApi } from '../test/server';

function renderLanding() {
  return renderWithRouter(<LandingPage />, '/');
}

describe('headline content', () => {
  it('states what the product does in the main heading', () => {
    stubApi();
    renderLanding();

    expect(
      screen.getByRole('heading', { level: 1, name: /what today.s air means/i }),
    ).toBeInTheDocument();
  });

  it('exposes exactly one level-one heading', () => {
    stubApi();
    renderLanding();

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('links to the dashboard from both calls to action', () => {
    stubApi();
    renderLanding();

    const links = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href') === '/dashboard');

    expect(links.length).toBeGreaterThanOrEqual(2);
  });

  it('describes the problem it addresses', () => {
    stubApi();
    renderLanding();

    expect(
      screen.getByRole('heading', { name: /generic smog advice/i }),
    ).toBeInTheDocument();
  });

  it('explains the process as numbered steps', () => {
    stubApi();
    renderLanding();

    for (const step of [
      /pick your area/i,
      /we read the air/i,
      /tell us your day/i,
      /get a plan you can act on/i,
    ]) {
      expect(screen.getByRole('heading', { name: step })).toBeInTheDocument();
    }
  });

  it('covers all four recommendation areas', () => {
    stubApi();
    renderLanding();

    for (const feature of [
      /low-emission daily routines/i,
      /indoor air that is actually better/i,
      /sustainable alternatives/i,
      /built for communities/i,
    ]) {
      expect(screen.getByRole('heading', { name: feature })).toBeInTheDocument();
    }
  });

  it('is explicit that the model does not make safety decisions', () => {
    stubApi();
    renderLanding();

    expect(
      screen.getByRole('heading', { name: /not left to the model/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/rules decide, the model only explains/i)).toBeInTheDocument();
  });

  it('carries the medical disclaimer above the footer', () => {
    stubApi();
    renderLanding();

    expect(screen.getByText(/not medical advice/i)).toBeInTheDocument();
  });
});

describe('live example reading', () => {
  it('announces that it is loading before the reading arrives', () => {
    stubApi();
    renderLanding();

    expect(screen.getByRole('status')).toHaveTextContent(/loading an example/i);
  });

  it('shows a real reading with its band and source once loaded', async () => {
    stubApi();
    renderLanding();

    const sample = await screen.findByRole('complementary', {
      name: /example live reading/i,
    });

    await waitFor(() => {
      expect(sample).toHaveTextContent('183');
    });
    expect(sample).toHaveTextContent('Unhealthy');
    expect(sample).toHaveTextContent(/69.6/);
    expect(sample.querySelector('a')).toHaveAttribute('href', AIR_QUALITY.source.url);
  });

  it('requests only the air-quality endpoint, not a plan', async () => {
    const fetchMock = stubApi();
    renderLanding();

    await screen.findByText('183');

    const paths = fetchMock.mock.calls.map(([url]) => String(url));
    expect(paths.some((path) => path.includes('/api/air-quality'))).toBe(true);
    expect(paths.some((path) => path.includes('/api/recommendations'))).toBe(false);
  });

  it('degrades to a designed empty state rather than an error', async () => {
    stubApi({ airQuality: () => errorResponse(503, 'Upstream unavailable.') });
    renderLanding();

    expect(
      await screen.findByText(/no live reading to show right now/i),
    ).toBeInTheDocument();
    // This sits in the hero and is only illustrative, so a failure must not
    // raise an alert or look broken.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('handles a reading with no index value', async () => {
    stubApi({
      airQuality: () =>
        jsonResponse({
          ...AIR_QUALITY,
          current: { ...AIR_QUALITY.current, usAqi: null, pm25: null },
        }),
    });
    renderLanding();

    const sample = await screen.findByRole('complementary', {
      name: /example live reading/i,
    });
    await waitFor(() => expect(sample).toHaveTextContent('—'));
  });
});
