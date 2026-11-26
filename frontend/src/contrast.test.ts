import { describe, expect, it } from 'vitest';
import baseCss from './index.css?raw';

/**
 * Colour contrast, verified by computation.
 *
 * axe cannot check this: its colour-contrast rule needs a canvas, which jsdom
 * does not implement, so it is silently skipped. Rather than leave contrast
 * hand-checked, these tests parse the tokens out of the stylesheet and compute
 * WCAG 2.2 ratios directly.
 *
 * Thresholds, from WCAG 2.2:
 *   AA  normal text  4.5:1
 *   AA  large text   3:1   (>= 18.66px bold, or >= 24px)
 *   AA  non-text UI  3:1   (borders, focus indicators)
 *   AAA normal text  7:1
 */

/** Pulls `--name: #value` pairs out of the `:root` block. */
function parseTokens(css: string): Record<string, string> {
  const tokens: Record<string, string> = {};
  const pattern = /--([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(css)) !== null) {
    tokens[match[1]!] = match[2]!;
  }
  return tokens;
}

const tokens = parseTokens(baseCss);

function toRgb(hex: string): [number, number, number] {
  let value = hex.replace('#', '');
  if (value.length === 3) {
    value = value
      .split('')
      .map((c) => c + c)
      .join('');
  }
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

/** Relative luminance, per the WCAG definition. */
function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((channel) => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  const [lighter, darker] = a > b ? [a, b] : [b, a];
  return (lighter + 0.05) / (darker + 0.05);
}

/** Resolves a token name to its hex value, failing loudly if absent. */
function token(name: string): string {
  const value = tokens[name];
  if (!value) {
    throw new Error(`Token --${name} is not defined as a hex value in index.css`);
  }
  return value;
}

describe('the tokens were parsed', () => {
  it('found the palette, so the checks below are not vacuous', () => {
    expect(Object.keys(tokens).length).toBeGreaterThan(20);
    expect(tokens['ink']).toBeDefined();
    expect(tokens['page']).toBeDefined();
  });
});

describe('body and surface text meets AA', () => {
  it.each([
    ['ink on page', 'ink', 'page'],
    ['ink on surface', 'ink', 'surface'],
    ['ink on surface-sunken', 'ink', 'surface-sunken'],
    ['ink-soft on page', 'ink-soft', 'page'],
    ['ink-soft on surface', 'ink-soft', 'surface'],
    ['ink-faint on page', 'ink-faint', 'page'],
    ['ink-faint on surface', 'ink-faint', 'surface'],
    ['ink-faint on surface-sunken', 'ink-faint', 'surface-sunken'],
  ])('%s clears 4.5:1', (_label, fg, bg) => {
    expect(contrastRatio(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it('body text reaches AAA, not merely AA', () => {
    expect(contrastRatio(token('ink'), token('page'))).toBeGreaterThanOrEqual(7);
  });
});

describe('links and brand text meet AA', () => {
  it.each([
    ['brand-dark on page', 'brand-dark', 'page'],
    ['brand-dark on surface', 'brand-dark', 'surface'],
    ['brand-dark on brand-tint', 'brand-dark', 'brand-tint'],
    ['brand-deep on brand-tint', 'brand-deep', 'brand-tint'],
    ['brand on page', 'brand', 'page'],
  ])('%s clears 4.5:1', (_label, fg, bg) => {
    expect(contrastRatio(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5);
  });
});

describe('every risk band label is readable', () => {
  // Band colour carries meaning only alongside text, and that text must be
  // legible on each surface it appears on.
  it.each([
    'risk-good',
    'risk-moderate',
    'risk-sensitive-unhealthy',
    'risk-unhealthy',
    'risk-very-unhealthy',
    'risk-hazardous',
  ])('%s clears 4.5:1 on white and on the sunken surface', (band) => {
    expect(contrastRatio(token(band), token('surface'))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(token(band), token('surface-sunken'))).toBeGreaterThanOrEqual(
      4.5,
    );
  });
});

describe('the emission tag is readable and its border is visible', () => {
  it('meets AA for text', () => {
    expect(contrastRatio(tokens['risk-good']!, tokens['surface']!)).toBeGreaterThanOrEqual(4.5);
  });

  it('meets the 3:1 non-text minimum for its border', () => {
    // WCAG 2.2 1.4.11. The tag is distinguished by colour and weight, so the
    // outline has to be perceivable on its own.
    expect(contrastRatio(tokens['risk-good']!, tokens['surface']!)).toBeGreaterThanOrEqual(3);
  });
});

describe('feedback colours meet AA on their own backgrounds', () => {
  it.each([
    ['error', 'error-ink', 'error-bg'],
    ['warning', 'warning-ink', 'warning-bg'],
    ['info', 'brand-deep', 'info-bg'],
    ['success', 'success', 'success-bg'],
  ])('%s text clears 4.5:1', (_label, fg, bg) => {
    expect(contrastRatio(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5);
  });
});

describe('white text on filled surfaces meets AA', () => {
  it.each(['brand', 'brand-dark', 'brand-deep', 'error', 'risk-good'])(
    'white on %s clears 4.5:1',
    (surface) => {
      expect(contrastRatio('#ffffff', token(surface))).toBeGreaterThanOrEqual(4.5);
    },
  );
});

describe('text on the dark call-to-action band meets AA', () => {
  it.each([
    ['on-brand', 'brand-deep'],
    ['on-brand', 'brand-abyss'],
    ['on-brand-soft', 'brand-deep'],
    ['on-brand-faint', 'brand-deep'],
  ])('%s on %s clears 4.5:1', (fg, bg) => {
    expect(contrastRatio(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5);
  });
});

describe('non-text indicators meet the 3:1 rule', () => {
  // WCAG 2.2 SC 1.4.11. Input borders and focus indicators are the boundaries
  // a user needs to see in order to find a control at all.
  it.each([
    ['focus ring on page', 'focus', 'page'],
    ['focus ring on surface', 'focus', 'surface'],
    ['input border on surface', 'line-strong', 'surface'],
    ['input border on page', 'line-strong', 'page'],
    ['input border on surface-sunken', 'line-strong', 'surface-sunken'],
    ['brand border on surface', 'brand', 'surface'],
  ])('%s clears 3:1', (_label, fg, bg) => {
    expect(contrastRatio(token(fg), token(bg))).toBeGreaterThanOrEqual(3);
  });
});
