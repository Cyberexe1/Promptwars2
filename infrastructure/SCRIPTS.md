# Scripts in this directory

Run from the repository root, for example
`powershell -File infrastructure/deploy.ps1`. Everything except `deploy.ps1`
reads AWS credentials from `backend/.env` through `_aws-env.ps1`.

## Deploy

| Script | Use it when | Needs Docker |
|---|---|---|
| `deploy.ps1` | First deployment, or any change to the backend. Runs the whole pipeline. Supports `-DryRun`. | Yes |
| `redeploy.ps1` | The backend changed and the stacks did not. Rebuilds and pushes the image, then rolls App Runner. | Yes |
| `redeploy-frontend.ps1` | Only the frontend changed. Updates the CloudFront stack and republishes the bundle. | No |
| `enable-bedrock.ps1` | Turning on Amazon Bedrock for an existing deployment. | Yes |

## Check

| Script | Answers |
|---|---|
| `aws-check.ps1` | Can these credentials reach every service the deployment needs? |
| `check-permissions.ps1` | Which specific IAM actions are denied? More precise than `aws-check.ps1`. |
| `stack-events.ps1` | Why did a CloudFormation stack fail? |

## Verify a live deployment

| Script | Checks |
|---|---|
| `verify-account-flow.ps1` | Sign-up, session, plan, and sign-in through the site origin. The closest thing to a browser test that curl can do. |
| `audit-live.ps1` | Headers, compression, TLS, rate-limit headers, and that `/api` is proxied. |
| `smoke-auth-live.ps1` | The authentication flow, end to end. |
| `verify-bedrock.ps1` | That a plan came from the model rather than the rules fallback. |
| `verify-throttle.ps1` | That repeated failed sign-ins return 429. |

None of the verify scripts can confirm `SameSite` behaviour, because curl
ignores it. After any deployment, sign in once in a real browser.

## Not scripts

`deploy-policy.json` is the IAM policy for the deploying identity.
`role-boundary-policy.json` is the permissions boundary it requires on every
role the stacks create. Create the boundary first. See `README.md`.
