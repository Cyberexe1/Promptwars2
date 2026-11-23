import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import App from './App';
import { stubApi } from './test/server';

/**
 * Automated accessibility checks.
 *
 * These catch structural problems such as unlabelled controls and broken
 * heading order. They do not replace manual keyboard and screen-reader
 * testing, which is listed in the project README as a Phase 3 task.
 */
describe('accessibility', () => {
  it('has no detectable violations on first load', async () => {
    stubApi();
    const { container } = render(<App />);

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('has no detectable violations once a plan is shown', async () => {
    stubApi();
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.type(screen.getByLabelText(/search for a city/i), 'Delhi');
    await user.click(
      await screen.findByRole('button', { name: /Delhi, Delhi, India/i }),
    );
    await screen.findByRole('region', { name: /air quality in/i });
    await user.click(screen.getByRole('button', { name: /build my clean-air plan/i }));
    await screen.findByRole('region', { name: /your clean-air plan/i });

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('labels every form control', () => {
    stubApi();
    render(<App />);

    const form = screen.getByRole('form', { name: /tell us about your household/i });

    for (const control of [
      ...within(form).getAllByRole('checkbox'),
      ...within(form).getAllByRole('radio'),
      ...within(form).getAllByRole('spinbutton'),
    ]) {
      expect(control).toHaveAccessibleName();
    }
  });

  it('groups related choices under a legend', () => {
    stubApi();
    render(<App />);

    for (const legend of [
      /who lives with you/i,
      /how do you usually travel/i,
      /what do you cook with/i,
      /what can you spend/i,
    ]) {
      expect(screen.getByRole('group', { name: legend })).toBeInTheDocument();
    }
  });

  it('exposes a single level-one heading and an ordered outline', () => {
    stubApi();
    render(<App />);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getAllByRole('heading', { level: 2 }).length).toBeGreaterThan(0);
  });

  it('announces status changes in a live region', async () => {
    stubApi();
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText(/search for a city/i), 'Delhi');
    await user.click(
      await screen.findByRole('button', { name: /Delhi, Delhi, India/i }),
    );

    const status = await screen.findByText(/selected location: delhi/i);
    expect(status).toHaveAttribute('aria-live', 'polite');
  });

  it('moves focus in document order from the search field', async () => {
    stubApi();
    const user = userEvent.setup();
    render(<App />);

    const search = screen.getByLabelText(/search for a city/i);
    search.focus();
    expect(search).toHaveFocus();

    await user.tab();
    expect(
      screen.getByRole('button', { name: /use my current location/i }),
    ).toHaveFocus();
  });

  it('makes the submit button keyboard reachable once a location is chosen', async () => {
    stubApi();
    const user = userEvent.setup();
    render(<App />);

    const submit = screen.getByRole('button', { name: /build my clean-air plan/i });
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
