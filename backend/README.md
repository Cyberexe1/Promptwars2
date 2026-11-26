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

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/health` | — | Liveness probe for App Runner. Makes no upstream call. |
| `POST` | `/api/auth/signup` | — | Create an account and start a session. |
| `POST` | `/api/auth/login` | — | Start a session. |
| `POST` | `/api/auth/logout` | — | Clear the session cookie. |
| `GET` | `/api/auth/me` | cookie | Who is signed in, or 401. |
| `GET` | `/api/locations?query=` | — | City search. Returns an empty list when nothing matches. |
| `GET` | `/api/air-quality?latitude=&longitude=&name=` | — | Current reading, risk band, and 24-hour outlook. |
| `POST` | `/api/recommendations` | **required** | Personalised plan for a household. |

Published air-quality data stays public, because the landing page shows a live
reading to anonymous visitors. `/api/recommendations` is the one endpoint that
accepts household and health answers, so it is the one behind the account
boundary.

## Accounts and sessions

| Decision | Reason |
|---|---|
| scrypt for password hashing | Ships with Node, so no dependency, and memory-hard, which makes bulk offline cracking expensive rather than merely slow. Cost parameters are stored per hash, so they can be raised later without invalidating existing passwords. |
| Minimum 12 characters, maximum 200 | The floor follows current guidance; the ceiling stops a very long password being a cheap way to make the server do expensive work. |
| Stateless HMAC-signed cookie | No session table to scale or clean. The trade-off: logout clears the cookie but cannot invalidate a copy already taken. Tokens last 7 days and carry a `jti`, so a denylist can be added if immediate revocation is ever needed. |
| `HttpOnly`, `SameSite=Lax`, `Secure` in production | Script cannot read the token, which blunts cross-site scripting; `SameSite` limits cross-site use. |
| Identical wording for every credential failure | A different message or status for "no such account" would let anyone enumerate registered addresses. |
| A dummy hash is verified when no user exists | Without it, a missing account would answer faster than a wrong password, which leaks the same thing through timing. |
| Separate, much tighter rate limit on credential endpoints | Hashing is deliberately expensive, so these are the most attractive endpoints for both brute force and resource exhaustion. |
| Records keyed by `sha256(email)` | A key listing reveals no addresses. The email is kept in the item because the interface shows who is signed in. |
| `ConditionExpression` on signup | Checking then writing would leave a race between two concurrent signups for one address. |
| `ConsistentRead` when loading a password hash | A stale replica read could accept a password that has since been changed. |

Accounts hold an email, a password hash, and a creation timestamp. Nothing
about a household, its health answers, or its plans is stored server-side.

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
- Rate limiting on `/api` (60 requests per minute by default), with a much tighter limit on the credential routes.
- Per-account login throttling on top of the per-address limit: 8 failures for one email address within 15 minutes and further attempts get 429 with `Retry-After`, no matter which addresses they come from. A correct password clears the count. See [`src/middleware/loginThrottle.ts`](src/middleware/loginThrottle.ts) for why unregistered addresses are counted too. Signup spends the same budget, so probing addresses for existing accounts is rate-limited rather than free.
- At most four password hashes run at once. Each needs about 32 MB, and the instance has 0.5 GB with a concurrency limit of 50, so an unauthenticated burst of sign-in attempts could otherwise exhaust memory. Excess requests queue.
- The CSRF token is HMAC-signed with the session secret. Without a signature the check was only that two caller-controllable values matched each other, which anything able to set a cookie on this host could satisfy.
- Cached air-quality items are parsed through a schema on read, not cast. The cache is shared between instances, so an unvalidated read let one bad writer poison the readings served to everyone, and that text reaches the model prompt. Writes carry a `ConditionExpression` so a stale write cannot replace a fresher entry.
- The location name is stripped of angle brackets before it is placed in the Bedrock prompt. The delimiter tags around it are only a boundary if the caller cannot write one, and 120 characters is enough to close the tag and open a forged `<safety_constraints>` block.
- CORS restricted to an explicit allowlist. A disallowed origin returns 403, so it does not pollute unhandled-error logs.
- `helmet` security headers; `x-powered-by` removed.
- Upstream calls use `AbortSignal` timeouts, refuse redirects, and cap response size.
- External responses are parsed through schemas and treated strictly as data. The Bedrock prompt wraps the user-supplied location name in a delimiter and instructs the model to ignore instructions inside it.
- Only `AppError` messages reach clients. Unexpected errors log by name and return a generic message, verified by a test asserting that connection details do not leak.
- Logs never receive coordinates, health preferences, email addresses, or credentials. Auth events log the outcome only.
- The only secret is `SESSION_SECRET`, generated into Secrets Manager by the stack and injected by App Runner at start-up. The server refuses to start in production without it, rather than signing sessions with a weak or ephemeral key.
- No third-party API keys exist. AWS credentials come from the standard provider chain, which is the App Runner instance role in production.

## Performance

- Air-quality readings are cached in DynamoDB on a 1 km grid with a 600-second TTL, so neighbours asking at the same time share one upstream call. A cache failure degrades to a direct fetch rather than an error.
- Responses are gzip-compressed. A plan response drops from about 1,878 bytes to 575, which is what matters on the mobile connections this app is built for.
- Upstream calls have abort timeouts and a response-size cap, so a slow provider cannot hold a request open indefinitely.

## Tests

256 tests, no network access. Both upstream services are mocked and the Bedrock client is never constructed.

| File | Covers |
|---|---|
| `tests/aqi.test.ts` | Band boundaries, PM2.5 conversion against published breakpoints, monotonicity, gap-free band coverage |
| `tests/risk.test.ts` | Sensitivity escalation, guardrail thresholds, missing-reading behaviour |
| `tests/recommend.test.ts` | Over 1,000 household and band combinations asserting plan size, no duplicates, no contradictions, and safety-critical selections |
| `tests/planner.test.ts` | Model-output merge: unknown ids discarded, unsafe wording replaced, code-owned fields preserved |
| `tests/routes.test.ts` | Status codes, validation rejection, CORS policy, error-message safety |
| `tests/outlook.test.ts` | Past hours dropped, window limits, gaps, ties, flat forecasts |
| `tests/cache.test.ts` | Grid keys, expiry, eviction, failure degradation, what is stored |
| `tests/auth.test.ts` | Hashing, token forgery and expiry, enumeration resistance, cookie flags, rate limiting, route protection |
| `tests/loginThrottle.test.ts` | Per-account failure counting, window rollover, reset on success, eviction bound, `Retry-After` value |

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
| `SESSION_SECRET` | empty | Random per start outside production. **Required, 32+ characters, in production.** |
| `DYNAMODB_TABLE_NAME` | empty | Empty keeps accounts and the reading cache in memory, lost on restart. |
| `AQI_CACHE_TTL_SECONDS` | `600` | Zero disables reading caching. |
| `RATE_LIMIT_MAX` | `60` | Requests per window per client. |
| `AUTH_RATE_LIMIT_MAX` | `10` | Credential attempts per 15 minutes per client. |
