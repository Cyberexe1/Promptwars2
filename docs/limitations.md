# Known limitations

Written plainly, because a reviewer finding these unlisted is worse than reading them here.

## Not verified

| Item | Status | Why |
|---|---|---|
| Screen-reader behaviour | Not tested | Structure, labelling, and live regions are asserted by tests. Actual NVDA, JAWS, and VoiceOver passes need a human. |
| Real-device mobile testing | Not done | Layouts are responsive and tested at jsdom level only. No real phone or tablet has loaded the deployed site. |
| Browser end-to-end tests | Not written | The full journey is covered at component level with `fetch` stubbed. A real browser driver was not installed; the development machine had under 6 GB free. |
| Bedrock output quality at scale | Spot-checked only | The live model path is verified working and its output is schema-validated and bounded. A handful of responses have been read, not a reviewed sample across bands and household shapes. |
| Load and concurrency behaviour | Not measured | No load test has run against the deployed service. Capacity is a single App Runner instance with autoscaling configured but never exercised. |

## Deliberate constraints

**App Runner is in maintenance mode.** AWS closed it to new customers on 30 April 2026 and plans no new features ([AWS notice](https://docs.aws.amazon.com/apprunner/latest/dg/apprunner-availability-change.html)). The template targets it because it was the requested platform, and it still works for accounts that used the service before that date. An ineligible account needs Amazon ECS Express Mode instead; only the compute service changes. The eligibility check is the first thing in [`infrastructure/README.md`](../infrastructure/README.md).

**Login throttle state is per instance.** Failed attempts are counted per account in process memory, so with more than one instance running an attacker gets one budget per instance. Making it global means a DynamoDB write on every failed attempt. The per-address rate limiter stays as the backstop, and the single-instance configuration means this is currently exact.

**There is no AWS WAF.** CloudFront and App Runner are protected by application-level rate limiting, CORS, and request-size caps, not by a managed rule set. A WAF would add rate-based blocking at the edge and common-attack rules; it costs about $6 per month plus per-request charges, which was not justified for a demo.

**Request and response shapes are duplicated by hand.** The frontend declares its own types matching the backend's Zod schemas. Nothing fails the build if the two drift apart; a shared package or generated types would close that gap.

**Sessions cannot be revoked server-side.** Tokens are stateless and HMAC-signed, so logging out clears the cookie but cannot invalidate a copy taken beforehand. Tokens expire after seven days and carry a token id, so a denylist can be added if immediate revocation becomes a requirement. Rotating `SESSION_SECRET` invalidates every session at once, which is the emergency control.

**There is no password reset.** Without a verified email channel there is no safe way to prove ownership of an address, and building an unverified reset would be worse than having none. A forgotten password currently means creating a new account.

**Email addresses are not verified.** Anyone can register an address they do not own. The address is only an identifier here, never a contact channel, so nothing is sent to it and nothing is confirmed by it.

**Accounts live in memory without DynamoDB.** Running locally with no `DYNAMODB_TABLE_NAME` keeps users in a process map, so they vanish on restart. The server logs a warning. Production supplies the table.

**Saved plans still do not follow the account.** They remain in browser local storage even for a signed-in user, so they do not sync across devices. This is deliberate: a plan can disclose a household's medical sensitivity, and keeping it on the device keeps that out of any server-side store or backup.

**Saved plans are device-local.** Clearing browser data removes them, private browsing blocks them, and they do not sync. The interface states this. The benefit is that a plan which may disclose a household's medical sensitivity never reaches a server, a log, or a backup.

**Single AWS region.** No multi-region failover. Appropriate for the scale; a regional outage takes the service down.

**`MinSize: 1` on App Runner.** Avoids cold starts, bills while idle. The dominant running cost.

**Session cookies will not survive a cross-site fetch in the current
deployment.** The frontend is on CloudFront and the API on App Runner, which
are different sites, and the session cookie is `SameSite=Lax`. A browser will
not attach it to the frontend's `fetch`, so a signed-in user can appear signed
out. The live smoke tests do not catch this because `curl` ignores SameSite
entirely. The fix is a CloudFront `/api` behaviour so both share an origin, not
`SameSite=None`, which would discard a real CSRF defence.

**Emission-reducing advice is crowded out exactly when it matters.** Of 22
catalogue entries only four clearly reduce emissions rather than exposure:
`move-off-biomass`, `swap-car-trips`, `no-waste-burning`, `no-idling`. All but
the first rank below every protective item, and the selector fills the plan by
priority. At a high AQI reading a car-commuting household typically gets one
emission item out of six; at a clean reading they get more. The app therefore
gives its best sustainability advice when the air is already good. Nothing in
the test matrix asserts otherwise, so this is unguarded as well as unfixed.

**`cleanestHour` is computed, displayed, and then ignored by the advice.**
`domain/outlook.ts` works out the cleanest and worst hours ahead and the chart
shows them, but `shift-outdoor-activity` still says "the early afternoon" as a
fixed string, and the hourly series is never sent to the model. On a flat
series, which is common in severe smog, that advice is unusable and the app has
the data to know it.

**`budget` barely does anything.** It is read once in the whole domain layer,
to offer a low-cost filter build. `medium` and `high` produce identical plans.

## Accuracy

**Impact statements are estimates, not measurements.** They describe a mechanism and a direction, with an evidence rating of well established, reasonably supported, or limited. No percentage is claimed anywhere, and a test asserts that no catalogue entry contains one. The application has no sensor on anyone's street.

**The PM2.5 fallback disagrees with the provider.** When `us_aqi` is missing, a US AQI is computed from PM2.5 using the EPA breakpoints effective May 2024. This is an approximation: the official index uses a 24-hour rolling average and takes the worst sub-index across several pollutants. Observed in practice, Delhi at 69.6 µg/m³ produced 161 from the fallback against the provider's 183. The response says `estimated from PM2.5` whenever this path is used.

**Risk bands follow the US EPA scale everywhere.** Air-quality standards differ by country. The European index is displayed alongside with an explicit note that the two are not interchangeable, but the advice thresholds are American. A user in Europe or India sees guidance calibrated to US breakpoints.

**Sensitivity escalation is one coarse step.** Moving the band up by one is a blunt instrument. Real clinical risk varies by condition, severity, and medication. The disclaimer and the symptom-watching recommendation exist because of this.

**The grid cache can cross a pollution gradient.** Two points 1 km apart share a cache entry, and air quality can differ meaningfully across that distance near a major road. The trade-off buys a large reduction in upstream calls and a coarser stored location.

## Scope not built

- No forecast. Advice is for current conditions, so "check again later" appears instead of "it will clear by 4pm".
- No notifications. EventBridge, Lambda, and SNS are designed in the README but not implemented; they need consent handling and an unsubscribe path.
- No localisation. English only, which is a real barrier in the cities worst affected by winter smog.
- Community checklists are generated, not stored or shared server-side. Sharing is copy-to-clipboard or print.
- No indoor sensor integration, so indoor advice is generic rather than measured.

## Testing boundaries

477 tests pass and none touch the network: upstream services are mocked in the backend, `fetch` is stubbed in the frontend, and the Bedrock client is never constructed.

That is also the limit. These tests prove the code behaves as written against fixtures. They do not prove that Open-Meteo's response shape is still what the schema expects, that Bedrock returns usable prose, or that CloudFront serves the headers the template specifies. Scripts in [`infrastructure/`](../infrastructure/) check those against the deployed stack instead: `audit-live.ps1` asserts health, live readings, signup, CORS rejection, SPA fallback, and security headers; `verify-bedrock.ps1` confirms a plan came back from the model rather than the rules fallback; `verify-throttle.ps1` drives the login throttle to 429. They have been run against the live deployment and pass.

The strongest single test is the matrix in `recommend.test.ts`: over 1,000 combinations of household shape and air-quality band, asserting every plan is usable, free of duplicates, and free of self-contradiction such as advising both opening and closing windows.
