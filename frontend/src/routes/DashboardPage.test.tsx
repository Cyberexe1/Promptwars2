import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DashboardPage } from './DashboardPage';
import { AIR_QUALITY, PLAN } from '../test/fixtures';
import { renderWithRouter } from '../test/render';
import { errorResponse, jsonResponse, stubApi } from '../test/server';

function renderDashboard() {
  return renderWithRouter(<DashboardPage />, '/dashboard');
}

/** Types a city name and picks the first suggestion. */
async function selectDelhi(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/search for a city/i), 'Delhi');

  const option = await screen.findByRole('button', {
    name: /Delhi, Delhi, India/i,
  });
  await user.click(option);
  return option;
}

async function generatePlan(user: ReturnType<typeof userEvent.setup>) {
  await selectDelhi(user);
  await screen.findByRole('region', { name: /air quality in/i });
  await user.click(screen.getByRole('button', { name: /build my clean-air plan/i }));
}

describe('initial state', () => {
  it('shows the dashboard heading', () => {
    stubApi();
    renderDashboard();

    expect(
      screen.getByRole('heading', { level: 1, name: /clean-air plan/i }),
    ).toBeInTheDocument();
  });

  it('does not request anything before a location is chosen', () => {
    const fetchMock = stubApi();
    renderDashboard();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('disables plan generation until a location is chosen', () => {
    stubApi();
    renderDashboard();

    expect(
      screen.getByRole('button', { name: /build my clean-air plan/i }),
    ).toBeDisabled();
    expect(screen.getByText(/choose a location above/i)).toBeInTheDocument();
  });

  it('starts on the first step with nothing marked done', () => {
    stubApi();
    renderDashboard();

    const progress = screen.getByRole('navigation', { name: /progress/i });
    const steps = within(progress).getAllByRole('listitem');

    expect(steps[0]).toHaveAttribute('aria-current', 'step');
    expect(within(progress).getAllByText('To do')).toHaveLength(2);
    expect(within(progress).queryByText('Done')).not.toBeInTheDocument();
  });
});

describe('progress through the steps', () => {
  it('marks the location step done once a reading loads', async () => {
    stubApi();
    const user = userEvent.setup();
    renderDashboard();

    await selectDelhi(user);
    await screen.findByRole('region', { name: /air quality in/i });

    const progress = screen.getByRole('navigation', { name: /progress/i });
    const steps = within(progress).getAllByRole('listitem');

    expect(within(steps[0]!).getByText('Done')).toBeInTheDocument();
    expect(steps[1]).toHaveAttribute('aria-current', 'step');
  });

  it('marks the household step done once a plan is generated', async () => {
    stubApi();
    const user = userEvent.setup();
    renderDashboard();

    await generatePlan(user);
    await screen.findByRole('region', { name: /your clean-air plan/i });

    const progress = screen.getByRole('navigation', { name: /progress/i });
    expect(within(progress).getAllByText('Done')).toHaveLength(2);
    expect(within(progress).getAllByRole('listitem')[2]).toHaveAttribute(
      'aria-current',
      'step',
    );
  });
});

describe('location search', () => {
  it('waits for more than one character before searching', async () => {
    const fetchMock = stubApi();
    const user = userEvent.setup();
    renderDashboard();

    await user.type(screen.getByLabelText(/search for a city/i), 'D');

    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('debounces typing into a single request', async () => {
    const fetchMock = stubApi();
    const user = userEvent.setup();
    renderDashboard();

    await user.type(screen.getByLabelText(/search for a city/i), 'Delhi');
    await screen.findByRole('button', { name: /Delhi, Delhi, India/i });

    const searchCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/api/locations'),
    );
    expect(searchCalls).toHaveLength(1);
  });

  it('reports when no place matches', async () => {
    stubApi({ locations: () => jsonResponse({ locations: [] }) });
    const user = userEvent.setup();
    renderDashboard();

    await user.type(screen.getByLabelText(/search for a city/i), 'Zzzzzz');

    expect(await screen.findByText(/no places found/i)).toBeInTheDocument();
  });

  it('shows a readable message when the search service fails', async () => {
    stubApi({
      locations: () => errorResponse(503, 'City search is temporarily down.'),
    });
    const user = userEvent.setup();
    renderDashboard();

    await user.type(screen.getByLabelText(/search for a city/i), 'Delhi');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/city search is temporarily down/i);
  });

  it('marks the chosen place as selected', async () => {
    stubApi();
    const user = userEvent.setup();
    renderDashboard();

    const option = await selectDelhi(user);

    await waitFor(() => expect(option).toHaveAttribute('aria-pressed', 'true'));
  });
});

describe('air quality display', () => {
  it('shows the reading, band, pollutants, and source', async () => {
    stubApi();
    const user = userEvent.setup();
    renderDashboard();

    await selectDelhi(user);

    const panel = await screen.findByRole('region', { name: /air quality in/i });

    expect(within(panel).getByText('183')).toBeInTheDocument();
    expect(within(panel).getByText('US AQI')).toBeInTheDocument();
    expect(within(panel).getByText('Unhealthy')).toBeInTheDocument();
    expect(within(panel).getByText('PM2.5')).toBeInTheDocument();
    expect(within(panel).getByText(/69.6/)).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: /open-meteo/i })).toHaveAttribute(
      'href',
      AIR_QUALITY.source.url,
    );
  });

  it('states the band in text, not by colour alone', async () => {
    stubApi();
    const user = userEvent.setup();
    renderDashboard();

    await selectDelhi(user);

    const panel = await screen.findByRole('region', { name: /air quality in/i });
    expect(within(panel).getByText('Unhealthy')).toBeVisible();
    expect(within(panel).getByText(AIR_QUALITY.risk.advice)).toBeVisible();
  });

  it('labels a pollutant that the provider does not report', async () => {
    stubApi({
      airQuality: () =>
        jsonResponse({
          ...AIR_QUALITY,
          current: { ...AIR_QUALITY.current, ozone: null },
        }),
    });
    const user = userEvent.setup();
    renderDashboard();

    await selectDelhi(user);

    expect(await screen.findByText(/not reported here/i)).toBeInTheDocument();
  });

  it('warns when the reading is stale', async () => {
    stubApi({ airQuality: () => jsonResponse({ ...AIR_QUALITY, stale: true }) });
    const user = userEvent.setup();
    renderDashboard();

    await selectDelhi(user);

    expect(await screen.findByText(/more than three hours old/i)).toBeInTheDocument();
  });

  it('surfaces an error instead of a blank panel when the reading fails', async () => {
    stubApi({
      airQuality: () => errorResponse(503, 'The air-quality service timed out.'),
    });
    const user = userEvent.setup();
    renderDashboard();

    await selectDelhi(user);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/air-quality service timed out/i);
    expect(
      screen.queryByRole('region', { name: /air quality in/i }),
    ).not.toBeInTheDocument();
  });
});

describe('plan generation', () => {
  it('sends the household profile and renders every recommendation', async () => {
    const fetchMock = stubApi();
    const user = userEvent.setup();
    renderDashboard();

    await generatePlan(user);

    const plan = await screen.findByRole('region', { name: /your clean-air plan/i });

    for (const recommendation of PLAN.recommendations) {
      expect(within(plan).getByText(recommendation.title)).toBeInTheDocument();
      expect(within(plan).getByText(recommendation.action)).toBeInTheDocument();
    }

    const planCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes('/api/recommendations'),
    );
    expect(planCall).toBeDefined();

    const body = JSON.parse(String(planCall![1]?.body));
    expect(body.location.name).toBe('Delhi, Delhi, India');
    expect(body.profile.ageGroups).toEqual(['adult']);
    expect(body.profile.commuteMethod).toBe('public-transport');
  });

  it('shows the reason and both impact statements for each recommendation', async () => {
    stubApi();
    const user = userEvent.setup();
    renderDashboard();

    await generatePlan(user);

    const plan = await screen.findByRole('region', { name: /your clean-air plan/i });

    expect(within(plan).getAllByText(/why it helps/i)).toHaveLength(
      PLAN.recommendations.length,
    );
    expect(within(plan).getAllByText(/effect on your household/i)).toHaveLength(
      PLAN.recommendations.length,
    );
    expect(within(plan).getAllByText(/effect on your community/i)).toHaveLength(
      PLAN.recommendations.length,
    );
  });

  it('shows cost, effort, and evidence strength for each recommendation', async () => {
    stubApi();
    const user = userEvent.setup();
    renderDashboard();

    await generatePlan(user);

    const plan = await screen.findByRole('region', { name: /your clean-air plan/i });

    expect(within(plan).getAllByText(/no cost/i).length).toBeGreaterThan(0);
    expect(within(plan).getAllByText(/evidence:/i)).toHaveLength(
      PLAN.recommendations.length,
    );
  });

  it('groups recommendations under category headings', async () => {
    stubApi();
    const user = userEvent.setup();
    renderDashboard();

    await generatePlan(user);

    const plan = await screen.findByRole('region', { name: /your clean-air plan/i });

    for (const heading of [
      'Health and protection',
      'Daily routine',
      'Indoor air',
      'Getting around',
    ]) {
      expect(within(plan).getByRole('heading', { name: heading })).toBeInTheDocument();
    }
  });

  it('discloses how the wording was produced', async () => {
    stubApi();
    const user = userEvent.setup();
    renderDashboard();

    await generatePlan(user);

    const plan = await screen.findByRole('region', { name: /your clean-air plan/i });
    expect(within(plan).getByText(/built-in rules engine/i)).toBeInTheDocument();
  });

  it('names Bedrock when the model produced the wording', async () => {
    stubApi({
      recommendations: () => jsonResponse({ ...PLAN, generatedBy: 'bedrock' }),
    });
    const user = userEvent.setup();
    renderDashboard();

    await generatePlan(user);

    expect(await screen.findByText(/amazon bedrock/i)).toBeInTheDocument();
  });

  it('explains when precautions were raised for a sensitive household', async () => {
    stubApi({
      recommendations: () =>
        jsonResponse({
          ...PLAN,
          risk: {
            ...PLAN.risk,
            effectiveLevel: 'very-unhealthy',
            escalatedForSensitivity: true,
          },
        }),
    });
    const user = userEvent.setup();
    renderDashboard();

    await selectDelhi(user);
    await screen.findByRole('region', { name: /air quality in/i });

    await user.click(screen.getByLabelText(/diagnosed heart or lung condition/i));
    await user.click(screen.getByRole('button', { name: /build my clean-air plan/i }));

    expect(
      await screen.findByText(/next stricter level of precaution/i),
    ).toBeInTheDocument();
  });

  it('reports a readable error when plan generation fails', async () => {
    stubApi({
      recommendations: () => errorResponse(503, 'The air-quality service timed out.'),
    });
    const user = userEvent.setup();
    renderDashboard();

    await generatePlan(user);

    await waitFor(() => {
      expect(
        screen.getByText(/the air-quality service timed out/i),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByRole('region', { name: /your clean-air plan/i }),
    ).not.toBeInTheDocument();
  });

  it('explains a network failure rather than failing silently', async () => {
    stubApi({
      recommendations: () => {
        throw new TypeError('Failed to fetch');
      },
    });
    const user = userEvent.setup();
    renderDashboard();

    await generatePlan(user);

    expect(await screen.findByText(/appear to be offline/i)).toBeInTheDocument();
  });
});

describe('profile validation', () => {
  it('blocks submission with no age group selected and says why', async () => {
    const fetchMock = stubApi();
    const user = userEvent.setup();
    renderDashboard();

    await selectDelhi(user);
    await screen.findByRole('region', { name: /air quality in/i });

    // 'Adults' is the only default, so unchecking it empties the list.
    await user.click(screen.getByLabelText('Adults'));
    await user.click(screen.getByRole('button', { name: /build my clean-air plan/i }));

    expect(await screen.findByText(/select at least one person/i)).toBeInTheDocument();

    const planCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/api/recommendations'),
    );
    expect(planCalls).toHaveLength(0);
  });

  it('rejects outdoor minutes beyond the allowed range', async () => {
    stubApi();
    const user = userEvent.setup();
    renderDashboard();

    await selectDelhi(user);
    await screen.findByRole('region', { name: /air quality in/i });

    const minutes = screen.getByLabelText(/minutes you expect to spend outdoors/i);
    await user.clear(minutes);
    await user.type(minutes, '900');
    await user.click(screen.getByRole('button', { name: /build my clean-air plan/i }));

    expect(await screen.findByText(/between 0 and 480/i)).toBeInTheDocument();
  });
});

describe('offline and geolocation', () => {
  it('tells the user when the browser reports no connection', () => {
    stubApi();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    renderDashboard();

    expect(screen.getByText(/you are offline/i)).toBeInTheDocument();
  });

  it('uses coordinates from the browser when permission is granted', async () => {
    const fetchMock = stubApi();
    vi.stubGlobal('navigator', {
      ...navigator,
      onLine: true,
      geolocation: {
        getCurrentPosition: (success: PositionCallback) =>
          success({
            coords: { latitude: 28.6519, longitude: 77.2314 },
          } as GeolocationPosition),
      },
    });

    const user = userEvent.setup();
    renderDashboard();

    await user.click(screen.getByRole('button', { name: /use my current location/i }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) =>
        String(url).includes('/api/air-quality'),
      );
      expect(call).toBeDefined();
      // Coordinates are rounded to three decimals before they leave the page.
      expect(String(call![0])).toContain('latitude=28.652');
    });
  });

  it('falls back to search when location permission is refused', async () => {
    stubApi();
    vi.stubGlobal('navigator', {
      ...navigator,
      onLine: true,
      geolocation: {
        getCurrentPosition: (
          _success: PositionCallback,
          failure?: PositionErrorCallback | null,
        ) => failure?.({ code: 1 } as GeolocationPositionError),
      },
    });

    const user = userEvent.setup();
    renderDashboard();

    await user.click(screen.getByRole('button', { name: /use my current location/i }));

    expect(
      await screen.findByText(/location permission was not granted/i),
    ).toBeInTheDocument();
  });
});
