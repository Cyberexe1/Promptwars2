# SmogWise API

Node.js and TypeScript service that fetches live air quality, assesses risk with deterministic rules, and produces a personalised clean-air plan.

## Design principle

The language model never decides what advice to give.

1. A reviewed catalogue in [`src/domain/catalogue.ts`](src/domain/catalogue.ts) holds every suggestion the service can return.
2. The rules engine in [`src/domain/recommend.ts`](src/domain/recommend.ts) picks which entries apply to this household at this air-quality band.
3. Amazon Bedrock may only reword the entries that were already chosen.
4. [`src/services/planner.ts`](src/services/planner.ts) discards any model output with an unrecognised id and replaces wording that contradicts a safety constraint.

A model outage therefore changes the tone of a response, not its correctness. With `BEDROCK_MODEL_ID` unset the service runs entirely on the rules engine.

## Running locally

```bash
npm install
cp .env.example .env    # optional: defaults work without it
npm run dev             # http://localhost:3000
```

No API key is needed. [Open-Meteo](https://open-meteo.com/) serves both the geocoding and air-quality data without authentication.

| Script | Purpose |
|---|---|
| `npm run dev` | Watch-mode server via `tsx` |
| `npm run build` | Compile to `dist/` |
| `npm start` | Run the compiled server |
| `npm run typecheck` | Type check `src` and `tests` |
| `npm test` | Run the Vitest suite |

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Liveness probe for App Runner. Makes no upstream call. |
| `GET` | `/api/locations?query=` | City search. Returns an empty list when nothing matches. |
| `GET` | `/api/air-quality?latitude=&longitude=&name=` | Current reading plus the official risk band. |
| `POST` | `/api/recommendations` | Personalised plan for a household. |

### `POST /api/recommendations`

```json
{
  "location": { "name": "Delhi", "latitude": 28.65, "longitude": 77.23 },
  "profile": {
    "ageGroups": ["child", "adult"],
    "sensitive": true,
    "commuteMethod": "motorbike",
    "outdoorMinutes": 90,
    "cookingFuel": "biomass",
    "purifier": false,
    "budget": "low"
  }
}
```

The response carries `summary`, `risk`, four to six `recommendations`, `generatedBy` (`rules` or `bedrock`), `disclaimer`, and the `airQuality` reading with its source and timestamp.

## Risk assessment

Bands follow the US EPA Air Quality Index. PM2.5 breakpoints use the revision effective 6 May 2024, which lowered the top of the "Good" band from 12.0 to 9.0 µg/m³ ([EPA breakpoint table](https://aqs.epa.gov/aqsweb/documents/codetables/aqi_breakpoints.html), [PM NAAQS AQI fact sheet](https://www.epa.gov/system/files/documents/2024-02/pm-naaqs-air-quality-index-fact-sheet.pdf)).

| US AQI | Band |
|---|---|
| 0–50 | Good |
| 51–100 | Moderate |
| 101–150 | Unhealthy for sensitive groups |
| 151–200 | Unhealthy |
| 201–300 | Very unhealthy |
| 301+ | Hazardous |

Two separate values are reported. `level` is the official measured band, always stated truthfully. `effectiveLevel` is the band used to choose advice, moved one step stricter when the household includes a child, an adult over 65, someone pregnant, or someone with a diagnosed heart or lung condition. The UI shows both so a raised precaution is never mistaken for a worse official reading.

Guardrails derived from `effectiveLevel` in [`src/domain/risk.ts`](src/domain/risk.ts) decide whether strenuous outdoor activity, any outdoor exercise, and window ventilation are advisable, and whether a respirator is warranted.

When the provider returns neither `us_aqi` nor `pm2_5`, the service does not guess. It reports the band as `Unknown`, falls back to precautionary advice, and says plainly that no live reading is available.

## Security

- Input validated with Zod at every entry point, including coordinate ranges, enum values, text length, and control characters.
- 16 kB request body ceiling; oversized bodies return 403 or 413, never 500.
- Rate limiting on `/api` (60 requests per minute by default).
- CORS restricted to an explicit allowlist. A disallowed origin returns 403, so it does not pollute unhandled-error logs.
- `helmet` security headers; `x-powered-by` removed.
- Upstream calls use `AbortSignal` timeouts, refuse redirects, and cap response size.
- External responses are parsed through schemas and treated strictly as data. The Bedrock prompt wraps the user-supplied location name in a delimiter and instructs the model to ignore instructions inside it.
- Only `AppError` messages reach clients. Unexpected errors log by name and return a generic message, verified by a test asserting that connection details do not leak.
- Logs never receive coordinates, health preferences, or credentials.
- No API keys exist in this service. AWS credentials come from the standard provider chain, which is the App Runner instance role in production.

## Tests

113 tests, no network access. Both upstream services are mocked and the Bedrock client is never constructed.

| File | Covers |
|---|---|
| `tests/aqi.test.ts` | Band boundaries, PM2.5 conversion against published breakpoints, monotonicity, gap-free band coverage |
| `tests/risk.test.ts` | Sensitivity escalation, guardrail thresholds, missing-reading behaviour |
| `tests/recommend.test.ts` | Over 1,000 household and band combinations asserting plan size, no duplicates, no contradictions, and safety-critical selections |
| `tests/planner.test.ts` | Model-output merge: unknown ids discarded, unsafe wording replaced, code-owned fields preserved |
| `tests/routes.test.ts` | Status codes, validation rejection, CORS policy, error-message safety |

The matrix test in `recommend.test.ts` is the main safety guarantee: for every household shape at every band it asserts a usable plan with no self-contradicting advice, such as recommending both opening and closing windows.

## Environment variables

See [`.env.example`](.env.example). All have working defaults except `BEDROCK_MODEL_ID`, which is empty by design.

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `3000` | |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173` | Comma-separated. Set to the CloudFront domain in production. |
| `UPSTREAM_TIMEOUT_MS` | `6000` | |
| `AWS_REGION` | `us-east-1` | Must be a region where the Bedrock model is enabled. |
| `BEDROCK_MODEL_ID` | empty | Empty disables Bedrock and uses the rules engine alone. |
| `RATE_LIMIT_MAX` | `60` | Requests per window per client. |
