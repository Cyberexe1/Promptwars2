# Deployment runbook

Infrastructure as CloudFormation. Five templates, deployed in numeric order, because each depends on outputs from the previous ones.

```text
01-github-oidc.yaml   IAM role GitHub Actions assumes, no long-lived keys
02-ecr.yaml           Container registry (before the service: App Runner needs an image to exist)
03-data.yaml          DynamoDB single table
04-backend.yaml       App Runner service, instance role, CloudWatch alarms
05-frontend.yaml      Private S3 bucket, CloudFront, OAC, security headers
```

---

## Read this before you start: App Runner eligibility

AWS moved App Runner to **maintenance mode on 31 March 2026** and **closed it to new customers on 30 April 2026**. Existing customers can still create services, AWS continues security and availability work, and no sunset date has been announced. Source: [AWS App Runner availability change](https://docs.aws.amazon.com/apprunner/latest/dg/apprunner-availability-change.html).

**This means `04-backend.yaml` will only work if your AWS account used App Runner before 30 April 2026.** Check first:

```bash
aws apprunner list-services --region us-east-1
```

- **Succeeds** (even with an empty list) → you are an existing customer, continue as documented.
- **Fails with an authorization or opt-in error** → your account cannot use App Runner. See the alternative below.

`cfn-lint` reports this as `W3697`. It is suppressed in [`.cfnlintrc.yaml`](../.cfnlintrc.yaml) as an accepted decision, not an oversight.

### If your account is not eligible

AWS directs new accounts to **Amazon ECS Express Mode**, which provides the same "hand it a container, get a URL" experience and provisions the Fargate service, load balancer, TLS, autoscaling, and monitoring for you ([AWS guidance](https://docs.aws.amazon.com/decision-guides/latest/decision-guides/modern-apps-strategy-on-aws-how-to-choose.html), [Express Mode overview](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/express-service-overview.html)).

Nothing else in this project changes. The container, the image in ECR, the DynamoDB table, the frontend stack, and both workflows stay as they are; only the compute service differs. Templates 01, 02, 03, and 05 apply unchanged.

---

## Prerequisites

- AWS CLI v2, authenticated with permission to create IAM, ECR, DynamoDB, App Runner, S3, and CloudFront resources.
- Docker, to build the backend image.
- Amazon Bedrock model access enabled in your chosen region, **only** if you want model-written wording. The app is fully functional without it and reports `generatedBy: "rules"`.

Set these once per shell:

```bash
export AWS_REGION=us-east-1
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export BUCKET_NAME=smogwise-web-$ACCOUNT_ID    # must be globally unique
```

CloudFront is global, so if you use a custom domain its ACM certificate must be issued in `us-east-1` regardless of the region you deploy to.

---

## Step 1: Frontend infrastructure

Deployed first because the backend needs the CloudFront domain for its CORS allowlist.

```bash
aws cloudformation deploy \
  --template-file infrastructure/05-frontend.yaml \
  --stack-name smogwise-frontend \
  --parameter-overrides BucketName=$BUCKET_NAME \
  --region $AWS_REGION
```

CloudFront takes a few minutes to propagate. Capture the outputs:

```bash
aws cloudformation describe-stacks --stack-name smogwise-frontend \
  --query 'Stacks[0].Outputs' --output table --region $AWS_REGION
```

```bash
export SITE_URL=$(aws cloudformation describe-stacks --stack-name smogwise-frontend \
  --query "Stacks[0].Outputs[?OutputKey=='SiteUrl'].OutputValue" --output text --region $AWS_REGION)
export DISTRIBUTION_ID=$(aws cloudformation describe-stacks --stack-name smogwise-frontend \
  --query "Stacks[0].Outputs[?OutputKey=='DistributionId'].OutputValue" --output text --region $AWS_REGION)
```

## Step 2: Registry and database

```bash
aws cloudformation deploy \
  --template-file infrastructure/02-ecr.yaml \
  --stack-name smogwise-ecr \
  --region $AWS_REGION

aws cloudformation deploy \
  --template-file infrastructure/03-data.yaml \
  --stack-name smogwise-data \
  --region $AWS_REGION
```

## Step 3: First image push

App Runner cannot be created without an image, so push one by hand before Step 4. Afterwards the workflow handles it.

```bash
aws ecr get-login-password --region $AWS_REGION \
  | docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

docker build -t smogwise-api:latest ./backend
docker tag smogwise-api:latest $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/smogwise-api:latest
docker push $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/smogwise-api:latest
```

## Step 4: Backend service

`CorsAllowedOrigins` must be the exact CloudFront origin. A wrong value here is the most common cause of a working API that the browser refuses to call.

```bash
aws cloudformation deploy \
  --template-file infrastructure/04-backend.yaml \
  --stack-name smogwise-backend \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
      CorsAllowedOrigins=$SITE_URL \
      DynamoDbTableName=smogwise \
      BedrockModelId= \
      AlarmEmail=you@example.com \
  --region $AWS_REGION
```

To enable Bedrock later, redeploy with `BedrockModelId=<your inference profile id>`. The instance role grants `bedrock:InvokeModel` only when that parameter is non-empty.

```bash
export API_URL=$(aws cloudformation describe-stacks --stack-name smogwise-backend \
  --query "Stacks[0].Outputs[?OutputKey=='ServiceUrl'].OutputValue" --output text --region $AWS_REGION)

curl -fsS $API_URL/health
```

## Step 5: Publish the frontend

`VITE_API_URL` is compiled into the bundle, so it must be set at build time, not runtime.

```bash
cd frontend
VITE_API_URL=$API_URL npm run build

aws s3 sync dist s3://$BUCKET_NAME --exclude index.html \
  --cache-control "public,max-age=31536000,immutable"

aws s3 cp dist/index.html s3://$BUCKET_NAME/index.html \
  --cache-control "no-cache,no-store,must-revalidate"

aws cloudfront create-invalidation --distribution-id $DISTRIBUTION_ID --paths "/" "/index.html"
```

Hashed assets upload first and are cached for a year. `index.html` uploads last and is never cached, so a deployment takes effect at once rather than serving an old bundle.

## Step 6: Deployment identity for CI

```bash
aws cloudformation deploy \
  --template-file infrastructure/01-github-oidc.yaml \
  --stack-name smogwise-oidc \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
      GitHubOwner=Cyberexe1 \
      GitHubRepo=Promptwars2 \
      GitHubBranch=main \
      FrontendBucketName=$BUCKET_NAME \
      CreateOidcProvider=true \
  --region $AWS_REGION
```

Set `CreateOidcProvider=false` if the account already has the GitHub provider; an account may only hold one per URL.

Then add these **repository variables** in GitHub under Settings → Secrets and variables → Actions → Variables. They are not secrets: none of them grants access on its own, because the role can only be assumed by this repository's `main` branch.

| Variable | Value |
|---|---|
| `AWS_REGION` | your region |
| `AWS_DEPLOY_ROLE_ARN` | `DeploymentRoleArn` output from stack 01 |
| `ECR_REPOSITORY` | `smogwise-api` |
| `APP_RUNNER_SERVICE_ARN` | `ServiceArn` output from stack 04 |
| `FRONTEND_BUCKET` | your bucket name |
| `CLOUDFRONT_DISTRIBUTION_ID` | `DistributionId` output from stack 05 |
| `VITE_API_URL` | `ServiceUrl` output from stack 04 |

Both deploy workflows are `workflow_dispatch` only and require typing `deploy` to confirm. Production deployment is a deliberate act, not a side effect of merging.

---

## Security decisions

| Decision | Reason |
|---|---|
| OIDC instead of access keys | CI gets short-lived credentials. No AWS key exists in GitHub. |
| Role trust pinned to one repo and branch | Without the `sub` condition, any GitHub repository could assume the role. |
| S3 private, reachable only via OAC | The bucket has no public access path at all. |
| Separate ECR access and instance roles | The running container cannot pull or push images. |
| `bedrock:InvokeModel` granted conditionally | An account not using Bedrock grants no model permissions. |
| No `dynamodb:Scan` or table administration | The application only reads and writes individual items and queries. |
| No Secrets Manager entry | Open-Meteo needs no API key, so the deployment holds no secrets to leak. |
| `DeletionPolicy: Retain` on the bucket, table, and registry | A stack teardown cannot destroy user data or a running service's image. |
| CORS pinned to the CloudFront origin | A rejected origin returns 403, keeping it out of the 5xx alarm. |

## Cost notes

The dominant cost is App Runner provisioned capacity: `MinSize: 1` avoids cold starts but bills even while idle. Set `MinSize` higher only under real load. S3, CloudFront, and DynamoDB on-demand are negligible at demo traffic. Bedrock is per-token and only charged when `BedrockModelId` is set.

Create an AWS Budget before leaving anything running.

## Teardown

Delete in reverse order. Retained resources need manual removal, which is the intended friction.

```bash
aws cloudformation delete-stack --stack-name smogwise-oidc     --region $AWS_REGION
aws cloudformation delete-stack --stack-name smogwise-backend  --region $AWS_REGION
aws cloudformation delete-stack --stack-name smogwise-frontend --region $AWS_REGION
aws cloudformation delete-stack --stack-name smogwise-data     --region $AWS_REGION
aws cloudformation delete-stack --stack-name smogwise-ecr      --region $AWS_REGION

# Retained by design; empty the bucket before removing it.
aws s3 rm s3://$BUCKET_NAME --recursive
aws s3api delete-bucket --bucket $BUCKET_NAME --region $AWS_REGION
aws dynamodb delete-table --table-name smogwise --region $AWS_REGION
aws ecr delete-repository --repository-name smogwise-api --force --region $AWS_REGION
```

## Validating templates locally

```bash
pip install cfn-lint
cfn-lint          # reads .cfnlintrc.yaml, lints every template
```

CI runs the same check on every push and pull request.
