import { describe, expect, it } from 'vitest';
// `?raw` is Vite's own inlining, so this needs no Node types and keeps the
// browser project free of Node globals.
import baseCss from './index.css?raw';
import dashboardCss from './styles/dashboard.css?raw';
import landingCss from './styles/landing.css?raw';
import layoutCss from './styles/layout.css?raw';
import privacyCss from './styles/privacy.css?raw';
import uiCss from './styles/ui.css?raw';

/**
 * Guards the field styling contract.
 *
 * The email and password inputs once rendered at the browser's default width
 * with no padding or focus ring, because the base stylesheet listed the input
 * types it styled and nobody added the new ones. These tests assert fields are
 * selected by exclusion, so a type added later is styled by default rather
 * than silently skipped.
 */

/** Every input type the application actually renders. */
const TEXT_LIKE_TYPES = ['search', 'email', 'password', 'number'] as const;

const COMPONENT_SHEETS = {
  layout: layoutCss,
  ui: uiCss,
  landing: landingCss,
  dashboard: dashboardCss,
  privacy: privacyCss,
};

describe('the stylesheets actually loaded', () => {
  // Without this, a misconfigured `?raw` import resolves to an empty string
  // and every assertion below passes without checking anything.
  it('has real content for every sheet under test', () => {
    expect(baseCss.length).toBeGreaterThan(1000);

    for (const [name, css] of Object.entries(COMPONENT_SHEETS)) {
      expect(css.length, `${name}.css looks empty`).toBeGreaterThan(100);
    }
  });
});

describe('field styling', () => {
  it('selects text fields by exclusion, not by an allow-list', () => {
    // An allow-list is how the original bug happened.
    expect(baseCss).toMatch(/input:not\(/);
    expect(baseCss).not.toMatch(/input\[type='email'\]\s*\{/);
    expect(baseCss).not.toMatch(/input\[type='password'\]\s*\{/);
  });

  it('excludes the control types that must not be full width', () => {
    for (const type of ['checkbox', 'radio', 'range', 'file', 'submit', 'button']) {
      expect(baseCss).toContain(`[type='${type}']`);
    }
  });

  it('leaves every text-like type the app renders inside the selection', () => {
    for (const type of TEXT_LIKE_TYPES) {
      // Covered by exclusion, so it must not appear in an exclusion list.
      expect(baseCss).not.toMatch(
        new RegExp(`:not\\([^)]*\\[type='${type}'\\]`, 's'),
      );
    }
  });

  it('gives fields a visible focus ring rather than removing the outline', () => {
    expect(baseCss).toMatch(/:focus\s*\{[^}]*box-shadow/);
    expect(baseCss).toMatch(/:focus-visible\s*\{[^}]*outline:/);
  });

  it('caps the number field so it does not stretch a whole card', () => {
    expect(baseCss).toMatch(/input\[type='number'\]\s*\{[^}]*max-width/);
  });

  it('keeps autofilled text readable', () => {
    // Browser autofill repaints the background and can drop contrast below AA.
    expect(baseCss).toContain('-webkit-autofill');
  });
});

describe('design tokens', () => {
  it('defines the scales the stylesheets reference', () => {
    for (const token of [
      '--text-base',
      '--text-4xl',
      '--gap-sm',
      '--gap-2xl',
      '--radius-sm',
      '--shadow-lg',
      '--dur-fast',
      '--ease',
      '--shell',
    ]) {
      expect(baseCss).toContain(`${token}:`);
    }
  });

  it('keeps raw colours out of the component stylesheets', () => {
    for (const [name, css] of Object.entries(COMPONENT_SHEETS)) {
      const hexes = css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
      // Plain white and black are allowed for text on brand surfaces.
      const unexpected = hexes.filter((hex) => !/^#(fff|ffffff|000|000000)$/i.test(hex));

      expect(unexpected, `${name}.css has raw colours: ${unexpected.join(', ')}`).toEqual(
        [],
      );
    }
  });

  it('references motion through tokens, not hardcoded durations', () => {
    for (const [name, css] of Object.entries(COMPONENT_SHEETS)) {
      // Keyframe animations legitimately carry their own timing.
      const transitions = css.match(/transition:[^;]+;/g) ?? [];
      const hardcoded = transitions.filter((rule) => /\d+m?s/.test(rule));

      expect(
        hardcoded,
        `${name}.css hardcodes a duration: ${hardcoded.join(' ')}`,
      ).toEqual([]);
    }
  });
});
