# SmogWise web app

React, TypeScript, and Vite single-page application for SmogWise.

## Running locally

Start the API first (see [`../backend`](../backend)), then:

```bash
npm install
npm run dev     # http://localhost:5173
```

Point the app at a different API with a `.env.local` file:

```
VITE_API_URL=http://localhost:3000
```

| Script | Purpose |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Type check and build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc -b` |
| `npm test` | Vitest suite |

## Structure

| Path | Purpose |
|---|---|
| `src/App.tsx` | Page composition and request orchestration |
| `src/api.ts` | API client with typed errors and offline detection |
| `src/types.ts` | Contract types mirroring `backend/src/types.ts` |
| `src/labels.ts` | Human-readable text for every coded value |
| `src/defaults.ts` | Starting household profile |
| `src/components/LocationPicker.tsx` | Debounced city search and geolocation |
| `src/components/AirQualityPanel.tsx` | Reading, band, pollutants, provenance |
| `src/components/ProfileForm.tsx` | Household details |
| `src/components/RecommendationList.tsx` | The generated plan |

### State handling

Fetched results are stored tagged with the location they describe, and what to display is derived during render. Changing location invalidates the old reading and plan without a cascade of state resets, so stale data for a previous city can never appear on screen. The ESLint `react-hooks` rules enforce this by rejecting synchronous `setState` inside an effect.

## Accessibility

Built in, not retrofitted:

- **Never colour alone.** The risk band is always text plus a dot glyph. Colour is a top border on the card, a secondary cue only.
- **Semantic structure.** One `h1`, ordered headings, `section` landmarks with `aria-labelledby`, and related form controls grouped in `fieldset`/`legend`.
- **Labelled controls.** Every input has an associated label, asserted by a test.
- **Live regions.** Search progress, selection, and plan status are announced via `role="status"` and `aria-live="polite"`.
- **Focus management.** A skip link is the first focusable element. Focus moves to the plan once generated. Focus outlines are restyled, never removed.
- **Keyboard support.** Native elements throughout, so tab order and activation come from the platform.
- **Scalable text.** `rem` sizing with `clamp()`, so browser zoom and larger default font sizes work.
- **Reduced motion and forced colours.** `prefers-reduced-motion` and `forced-colors` are both honoured.
- **Honest states.** Loading, empty, offline, stale-data, validation, and error states all have explicit copy.

### Verification

`src/accessibility.test.tsx` runs `axe-core` on first load and on a rendered plan, and asserts labelling, grouping, heading order, and live regions.

One limitation worth stating plainly: axe's colour-contrast rule needs a canvas, which jsdom does not implement, so it is skipped in this suite. Contrast was chosen against WCAG 2.2 AA targets by hand (body text is `#1f2933` on `#f7f9fa`, above 12:1), but automated contrast checking and manual screen-reader passes need a real browser. Both are Phase 3 tasks in the root README.

## Tests

47 tests. `fetch` is stubbed in `src/test/server.ts`, so nothing touches the network.

| File | Covers |
|---|---|
| `src/App.test.tsx` | Search debouncing, selection to reading, plan generation and payload, error and offline states, validation, geolocation grant and refusal |
| `src/api.test.ts` | Query encoding, request shape, error mapping, and that no credentials are ever attached |
| `src/accessibility.test.tsx` | axe scans and structural accessibility assertions |

## Privacy

- Coordinates from the browser are rounded to three decimal places before use, roughly a few hundred metres: enough for an air-quality lookup, not enough to identify a home.
- Geolocation is requested only when the user presses the button, never on load.
- Nothing is persisted. There is no analytics, no tracking, and no local storage.
- No API key or credential is present in the bundle; a test asserts no `authorization` header is ever sent.
