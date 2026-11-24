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
      /no accounts, sign-in, or passwords/i,
      /no analytics/i,
      /no cookies/i,
      /no storage of health answers/i,
    ]) {
      expect(screen.getByText(claim)).toBeInTheDocument();
    }
  });

  it('explains that saved plans never leave the device', () => {
    stubApi();
    renderWithRouter(<App />, '/privacy');

    expect(screen.getByText(/on your device only/i)).toBeInTheDocument();
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

  it('makes no network request, since it is static content', () => {
    const fetchMock = stubApi();
    renderWithRouter(<App />, '/privacy');

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
