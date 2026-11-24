# Known limitations

Written plainly, because a reviewer finding these unlisted is worse than reading them here.

## Not verified

| Item | Status | Why |
|---|---|---|
| Live AWS deployment | **Never run** | Needs the owner's AWS account. Templates pass `cfn-lint`; nothing has been applied. |
| Container runtime | Image builds, run not verified locally | Docker Desktop's daemon was unavailable at the end of the build. CI starts the image and polls `/health` on every push. |
| Colour contrast, automated | Not checked | axe's contrast rule needs a canvas, which jsdom does not implement, so it is silently skipped. Values were chosen by hand against WCAG 2.2 AA; body text is `#1b2a33` on `#f6f8f9`, above 13:1. |
| Screen-reader behaviour | Not tested | Structure, labelling, and live regions are asserted by tests. Actual NVDA, JAWS, and VoiceOver passes need a human. |
| Real-device mobile testing | Not done | Layouts are responsive and tested at jsdom level only. |
| Bedrock output quality | Not assessed | The integration, schema validation, and fallback are tested with mocks. No real model response has been reviewed, because no model id is configured. |

## Deliberate constraints

**App Runner is in maintenance mode.** AWS closed it to new customers on 30 April 2026 and plans no new features ([AWS notice](https://docs.aws.amazon.com/apprunner/latest/dg/apprunner-availability-change.html)). The template targets it because it was the requested platform, and it still works for accounts that used the service before that date. An ineligible account needs Amazon ECS Express Mode instead; only the compute service changes. The eligibility check is the first thing in [`infrastructure/README.md`](../infrastructure/README.md).

**No authentication.** The application is useful anonymously, so accounts would add an attack surface and a store of health-adjacent data for no user benefit. The cost is that saved plans do not follow a user to another device.

**Saved plans are device-local.** Clearing browser data removes them, private browsing blocks them, and they do not sync. The interface states this. The benefit is that a plan which may disclose a household's medical sensitivity never reaches a server, a log, or a backup.

**Single AWS region.** No multi-region failover. Appropriate for the scale; a regional outage takes the service down.

**`MinSize: 1` on App Runner.** Avoids cold starts, bills while idle. The dominant running cost.

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

265 tests pass and none touch the network: upstream services are mocked in the backend, `fetch` is stubbed in the frontend, and the Bedrock client is never constructed.

That is also the limit. These tests prove the code behaves as written against fixtures. They do not prove that Open-Meteo's response shape is still what the schema expects, that Bedrock returns usable prose, or that CloudFront serves the headers the template specifies. The deploy workflows include smoke tests for exactly that reason, and those have not run.

The strongest single test is the matrix in `recommend.test.ts`: over 1,000 combinations of household shape and air-quality band, asserting every plan is usable, free of duplicates, and free of self-contradiction such as advising both opening and closing windows.
