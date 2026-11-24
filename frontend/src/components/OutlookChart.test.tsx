import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { OutlookChart } from './OutlookChart';
import type { Outlook } from '../types';

const BASE = Date.UTC(2026, 10, 23, 9, 0, 0);
const HOUR = 60 * 60 * 1000;

function iso(offsetHours: number): string {
  return new Date(BASE + offsetHours * HOUR).toISOString();
}

function outlook(values: (number | null)[], overrides: Partial<Outlook> = {}): Outlook {
  return {
    hours: values.map((usAqi, index) => ({ time: iso(index), usAqi })),
    cleanestHour: null,
    worstHour: null,
    ...overrides,
  };
}

describe('OutlookChart', () => {
  it('renders nothing when every hour is missing a value', () => {
    const { container } = render(
      <OutlookChart outlook={outlook([null, null, null])} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('names the cleanest hour in text, not only on the chart', () => {
    render(
      <OutlookChart
        outlook={outlook([180, 170, 60, 150], { cleanestHour: iso(2) })}
      />,
    );

    expect(screen.getByText(/cleanest hour ahead/i)).toBeInTheDocument();
  });

  it('names the worst hour when the forecast has a peak', () => {
    render(
      <OutlookChart
        outlook={outlook([100, 260, 90], {
          cleanestHour: iso(2),
          worstHour: iso(1),
        })}
      />,
    );

    expect(screen.getByText(/worst hour ahead/i)).toBeInTheDocument();
  });

  it('omits the peak label when the backend reports none', () => {
    render(<OutlookChart outlook={outlook([140, 140], { cleanestHour: iso(0) })} />);

    expect(screen.queryByText(/worst hour ahead/i)).not.toBeInTheDocument();
  });

  it('exposes the full series as a table for assistive technology', () => {
    render(<OutlookChart outlook={outlook([183, 150, 120])} />);

    const table = screen.getByRole('table', {
      name: /forecast us air quality index/i,
    });

    // One row per hour, so nothing is available only through the bars.
    expect(within(table).getAllByRole('row')).toHaveLength(4);
    expect(within(table).getByText('183')).toBeInTheDocument();
  });

  it('labels a missing hour in the table rather than showing a blank', () => {
    render(<OutlookChart outlook={outlook([120, null, 130])} />);

    const table = screen.getByRole('table', { name: /forecast/i });
    expect(within(table).getByText(/not reported/i)).toBeInTheDocument();
  });

  it('hides the decorative bars from assistive technology', () => {
    const { container } = render(<OutlookChart outlook={outlook([120, 130])} />);

    // The bars duplicate the table, so exposing both would be noise.
    expect(container.querySelector('.chart')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });

  it('colours each bar by its own band, not the current reading', () => {
    const { container } = render(<OutlookChart outlook={outlook([30, 175])} />);
    const columns = container.querySelectorAll('.chart-column');

    expect(columns[0]).toHaveAttribute('data-risk', 'good');
    expect(columns[1]).toHaveAttribute('data-risk', 'unhealthy');
  });

  it('marks the cleanest and worst columns for sighted scanning', () => {
    const { container } = render(
      <OutlookChart
        outlook={outlook([200, 50, 260], {
          cleanestHour: iso(1),
          worstHour: iso(2),
        })}
      />,
    );

    expect(
      container.querySelector('[data-marker="cleanest"]'),
    ).toBeInTheDocument();
    expect(container.querySelector('[data-marker="worst"]')).toBeInTheDocument();
  });

  it('gives every bar a visible height, including very low values', () => {
    const { container } = render(<OutlookChart outlook={outlook([1, 300])} />);
    const bars = container.querySelectorAll<HTMLElement>('.chart-bar');

    for (const bar of bars) {
      const height = Number.parseFloat(bar.style.height);
      expect(height).toBeGreaterThan(0);
      expect(height).toBeLessThanOrEqual(100);
    }
  });

  it('scales bars relative to a ceiling above the peak', () => {
    const { container } = render(<OutlookChart outlook={outlook([100, 200])} />);
    const bars = container.querySelectorAll<HTMLElement>('.chart-bar');

    const first = Number.parseFloat(bars[0]!.style.height);
    const second = Number.parseFloat(bars[1]!.style.height);

    // 100 against 200 should be half as tall, whatever the ceiling.
    expect(second / first).toBeCloseTo(2, 1);
    expect(screen.getByText(/scale tops out at 200/i)).toBeInTheDocument();
  });

  it('renders a gap marker instead of a bar for a missing hour', () => {
    const { container } = render(<OutlookChart outlook={outlook([120, null])} />);

    expect(container.querySelectorAll('.chart-bar')).toHaveLength(1);
    expect(container.querySelectorAll('.chart-gap')).toHaveLength(1);
  });
});
