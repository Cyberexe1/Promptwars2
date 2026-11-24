import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import App from './App';
import { renderWithRouter } from './test/render';
import { stubApi } from './test/server';

/**
 * Automated accessibility checks.
 *
 * These catch structural problems such as unlabelled controls, broken heading
 * order, and missing landmarks. They do not replace manual keyboard and
 * screen-reader testing, which is a Phase 3 task in the project README.
 *
 * Known gap: axe's colour-contrast rule needs a canvas, which jsdom does not
 * implement, so contrast is not verified here.
 */

/** The dashboard is behind a session, so these renders need one. */
function renderDashboard() {
  stubApi({ signedIn: true });
  return renderWithRouter(<App />, '/dashboard');
}

describe('landing page', () => {
  it('has no detectable violations', async () => {
    stubApi();
    const { container } = renderWithRouter(<App />, '/');

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('gives every section an accessible name', () => {
    stubApi();
    renderWithRouter(<App />, '/');

    for (const region of screen.getAllByRole('region')) {
      expect(region).toHaveAccessibleName();
    }
  });
});

describe('dashboard', () => {
  it('has no detectable violations before any input', async () => {
    const { container } = renderDashboard();
    await screen.findByLabelText(/search for a city/i);

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('has no detectable violations once a plan is shown', async () => {
    const user = userEvent.setup();
    const { container } = renderDashboard();

    await user.type(
      await screen.findByLabelText(/search for a city/i),
      'Delhi',
    );
    await user.click(
      await screen.findByRole('button', { name: /Delhi, Delhi, India/i }),
    );
    await screen.findByRole('region', { name: /air quality in/i });
    await user.click(screen.getByRole('button', { name: /build my clean-air plan/i }));
    await screen.findByRole('region', { name: /your clean-air plan/i });

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('labels every form control', async () => {
    renderDashboard();

    const form = await screen.findByRole('form', {
      name: /tell us about your household/i,
    });

    for (const control of [
      ...within(form).getAllByRole('checkbox'),
      ...within(form).getAllByRole('radio'),
      ...within(form).getAllByRole('spinbutton'),
    ]) {
      expect(control).toHaveAccessibleName();
    }
  });

  it('groups related choices under a legend', async () => {
    renderDashboard();
    await screen.findByLabelText(/search for a city/i);

    for (const legend of [
      /who lives with you/i,
      /how do you usually travel/i,
      /what do you cook with/i,
      /what can you spend/i,
    ]) {
      expect(screen.getByRole('group', { name: legend })).toBeInTheDocument();
    }
  });

  it('exposes progress as text, not position alone', async () => {
    renderDashboard();

    const progress = await screen.findByRole('navigation', { name: /progress/i });

    expect(within(progress).getByText('Current step')).toBeInTheDocument();
    expect(within(progress).getAllByText('To do')).toHaveLength(2);
  });

  it('announces status changes in a live region', async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.type(
      await screen.findByLabelText(/search for a city/i),
      'Delhi',
    );
    await user.click(
      await screen.findByRole('button', { name: /Delhi, Delhi, India/i }),
    );

    const status = await screen.findByText(/selected location: delhi/i);
    expect(status).toHaveAttribute('aria-live', 'polite');
  });

  it('moves focus in document order from the search field', async () => {
    const user = userEvent.setup();
    renderDashboard();

    const search = await screen.findByLabelText(/search for a city/i);
    search.focus();
    expect(search).toHaveFocus();

    await user.tab();
    expect(
      screen.getByRole('button', { name: /use my current location/i }),
    ).toHaveFocus();
  });

  it('makes the submit button keyboard reachable once a location is chosen', async () => {
    const user = userEvent.setup();
    renderDashboard();

    const submit = await screen.findByRole('button', {
      name: /build my clean-air plan/i,
    });
    // A disabled control is correctly skipped by the keyboard.
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText(/search for a city/i), 'Delhi');
    await user.click(
      await screen.findByRole('button', { name: /Delhi, Delhi, India/i }),
    );
    await screen.findByRole('region', { name: /air quality in/i });

    expect(submit).toBeEnabled();
    submit.focus();
    expect(submit).toHaveFocus();
  });
});

describe('login page', () => {
  it('has no detectable violations', async () => {
    stubApi();
    const { container } = renderWithRouter(<App />, '/login');
    await screen.findByLabelText(/email address/i);

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

describe('not found page', () => {
  it('has no detectable violations', async () => {
    stubApi();
    const { container } = renderWithRouter(<App />, '/missing');

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
