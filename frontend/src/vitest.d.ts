/**
 * Matcher typings for the test suite.
 *
 * `vitest-axe` ships declarations for the legacy global `Vi` namespace, which
 * Vitest 5 no longer reads, so the axe matcher is declared here against the
 * current `Matchers` interface.
 */
import 'vitest';

declare module 'vitest' {
  // Both type parameters must stay to match the original declaration, even
// though only R is referenced here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface Matchers<R = void | Promise<void>, T = unknown> {
    toHaveNoViolations(): R;
  }
}
