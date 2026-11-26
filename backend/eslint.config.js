import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

/**
 * Backend lint configuration.
 *
 * This did not exist. `npm run lint` was `tsc --noEmit`, identical to
 * `typecheck`, and the backend CI job had no lint step, so the README's claim
 * that lint was clean covered the frontend only. One `eslint-disable` comment
 * in `src/schemas.ts` had been suppressing a rule that nothing evaluated.
 *
 * Deliberately the same shape as the frontend config, minus the React
 * plugins, so one project's rules are not a surprise after reading the other.
 */
export default defineConfig([
  globalIgnores(['dist', 'coverage']),
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      // A leading underscore marks a binding that exists to satisfy a
      // signature but is intentionally unused. Express error handlers need a
      // fourth parameter they never read.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
]);
