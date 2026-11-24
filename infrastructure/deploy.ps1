<#
.SYNOPSIS
    Deploys SmogWise to AWS: CloudFront and S3 for the frontend, App Runner
    for the backend.

.DESCRIPTION
    Runs the runbook in dependency order and wires the values that are easy to
    get wrong by hand:

      - the frontend stack is created first, because the backend needs the
        CloudFront domain for its CORS allowlist
      - ECR is created before App Runner, which cannot start without an image
      - the frontend is built only after the API URL is known, because
        VITE_API_URL is compiled into the bundle

    This creates billable resources. Run with -DryRun first.

.PARAMETER Region
    AWS region. CloudFront is global, but a custom domain certificate must be
    in us-east-1 regardless.

.PARAMETER BedrockModelId
    Inference profile id. Leave empty to run on the deterministic rules
    engine, which is fully functional.

.PARAMETER AlarmEmail
    Address for CloudWatch alarm notifications. Requires confirming a
    subscription email.

.PARAMETER DryRun
    Print the plan and run the preflight without creating anything.

.EXAMPLE
    ./deploy.ps1 -DryRun
    ./deploy.ps1 -AlarmEmail you@example.com
#>
[CmdletBinding()]
param(
    [string]$Region = 'us-east-1',
    [string]$BedrockModelId = '',
    [string]$AlarmEmail = '',
    [string]$Prefix = 'smogwise',
    [switch]$DryRun
)

# 'Continue', not 'Stop': the AWS CLI writes progress to stderr, which Windows
# PowerShell would otherwise treat as a terminating error. Every external call
# below checks $LASTEXITCODE explicitly instead.
$ErrorActionPreference = 'Continue'
$env:AWS_PAGER = ''

$repoRoot = Split-Path $PSScriptRoot -Parent
$infraDir = $PSScriptRoot

function Step($message) { Write-Host "`n=== $message ===" -ForegroundColor Cyan }
function Info($label, $value) { Write-Host ("  {0,-22} {1}" -f $label, $value) }
function Fail($message) { Write-Host "  $message" -ForegroundColor Red; exit 1 }

function Invoke-Checked($description, [scriptblock]$action) {
    if ($DryRun) {
        Write-Host "  [dry run] $description" -ForegroundColor DarkGray
        return $null
    }
    $result = & $action
    if ($LASTEXITCODE -ne 0) { Fail "Failed: $description" }
    return $result
}

function Get-StackOutput($stackName, $key) {
    aws cloudformation describe-stacks --stack-name $stackName --region $Region `
        --query "Stacks[0].Outputs[?OutputKey=='$key'].OutputValue" --output text
}

# ---------------------------------------------------------------------------
# Preflight. Every one of these has blocked a real deployment attempt.
# ---------------------------------------------------------------------------
Step 'Preflight'

$account = (aws sts get-caller-identity --query 'Account' --output text 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0) {
    Write-Host '  AWS credentials are not usable.' -ForegroundColor Red
    Write-Host '  Run `aws configure sso` or `aws configure`, then `aws sts get-caller-identity`.'
    Write-Host '  Note: the SDK reads AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY exactly.'
    exit 1
}
Info 'account' $account
Info 'region' $Region

# App Runner closed to new customers on 30 April 2026. An ineligible account
# cannot create the service at all, whatever the template says.
aws apprunner list-services --region $Region --output text 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host '  This account cannot use App Runner.' -ForegroundColor Red
    Write-Host '  AWS closed it to new customers on 30 April 2026.'
    Write-Host '  See infrastructure/README.md for the Amazon ECS Express Mode route.'
    exit 1
}
Info 'app runner' 'available'

docker info --format '{{.ServerVersion}}' 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Fail 'Docker daemon is not running. Start Docker Desktop.' }
Info 'docker' 'running'

$bucket = "$Prefix-web-$account"
Info 'frontend bucket' $bucket
Info 'bedrock' $(if ($BedrockModelId) { $BedrockModelId } else { 'disabled, rules engine only' })

if (-not $DryRun) {
    Write-Host "`nThis creates billable AWS resources." -ForegroundColor Yellow
    Write-Host 'App Runner bills continuously at MinSize 1, plus CloudFront, S3, DynamoDB and Secrets Manager.'
    $answer = Read-Host 'Type "deploy" to continue'
    if ($answer -ne 'deploy') { Write-Host 'Cancelled.'; exit 0 }
}

# ---------------------------------------------------------------------------
# 1. Frontend infrastructure, first: the backend needs the CloudFront domain.
# ---------------------------------------------------------------------------
Step '1/6 Frontend infrastructure (S3 and CloudFront)'
Invoke-Checked 'deploy frontend stack' {
    aws cloudformation deploy `
        --template-file (Join-Path $infraDir '05-frontend.yaml') `
        --stack-name "$Prefix-frontend" `
        --parameter-overrides "BucketName=$bucket" `
        --region $Region
}

$siteUrl = if ($DryRun) { 'https://dry-run.cloudfront.net' } else { Get-StackOutput "$Prefix-frontend" 'SiteUrl' }
$distributionId = if ($DryRun) { 'DRYRUN' } else { Get-StackOutput "$Prefix-frontend" 'DistributionId' }
Info 'site url' $siteUrl
Info 'distribution' $distributionId

# ---------------------------------------------------------------------------
# 2. Registry and table.
# ---------------------------------------------------------------------------
Step '2/6 Container registry and database'
Invoke-Checked 'deploy ECR stack' {
    aws cloudformation deploy --template-file (Join-Path $infraDir '02-ecr.yaml') `
        --stack-name "$Prefix-ecr" --region $Region
}
Invoke-Checked 'deploy DynamoDB stack' {
    aws cloudformation deploy --template-file (Join-Path $infraDir '03-data.yaml') `
        --stack-name "$Prefix-data" --region $Region
}

# ---------------------------------------------------------------------------
# 3. First image. App Runner cannot be created without one.
# ---------------------------------------------------------------------------
Step '3/6 Build and push the API image'
$registry = "$account.dkr.ecr.$Region.amazonaws.com"
$image = "$registry/$Prefix-api:latest"

Invoke-Checked 'log in to ECR' {
    aws ecr get-login-password --region $Region | docker login --username AWS --password-stdin $registry
}
Invoke-Checked 'build image' {
    docker build -t "$Prefix-api:latest" (Join-Path $repoRoot 'backend')
}
Invoke-Checked 'tag image' { docker tag "$Prefix-api:latest" $image }
Invoke-Checked 'push image' { docker push $image }
Info 'image' $image

# ---------------------------------------------------------------------------
# 4. Backend service. CORS is pinned to the CloudFront origin from step 1.
# ---------------------------------------------------------------------------
Step '4/6 Backend service (App Runner)'
$backendParams = @(
    "CorsAllowedOrigins=$siteUrl",
    "DynamoDbTableName=$Prefix",
    "BedrockModelId=$BedrockModelId"
)
if ($AlarmEmail) { $backendParams += "AlarmEmail=$AlarmEmail" }

Invoke-Checked 'deploy backend stack' {
    aws cloudformation deploy `
        --template-file (Join-Path $infraDir '04-backend.yaml') `
        --stack-name "$Prefix-backend" `
        --capabilities CAPABILITY_IAM `
        --parameter-overrides $backendParams `
        --region $Region
}

$apiUrl = if ($DryRun) { 'https://dry-run.awsapprunner.com' } else { Get-StackOutput "$Prefix-backend" 'ServiceUrl' }
Info 'api url' $apiUrl

if (-not $DryRun) {
    Invoke-Checked 'check API health' { curl.exe -fsS --retry 10 --retry-delay 6 "$apiUrl/health" }
}

# ---------------------------------------------------------------------------
# 5. Frontend build. VITE_API_URL is compiled in, so it must be known first.
# ---------------------------------------------------------------------------
Step '5/6 Build and publish the frontend'
$frontendDir = Join-Path $repoRoot 'frontend'

if (-not $DryRun) {
    Push-Location $frontendDir
    try {
        $env:VITE_API_URL = $apiUrl
        npm ci
        if ($LASTEXITCODE -ne 0) { Fail 'npm ci failed' }
        npm run build
        if ($LASTEXITCODE -ne 0) { Fail 'frontend build failed' }

        # Guard against shipping a bundle that still calls localhost.
        if (Select-String -Path 'dist/assets/*.js' -Pattern 'localhost:3000' -Quiet) {
            Fail 'The bundle still points at localhost. VITE_API_URL did not apply.'
        }
    }
    finally { Pop-Location }
}
else {
    Write-Host '  [dry run] build frontend with VITE_API_URL' -ForegroundColor DarkGray
}

# Hashed assets first with a long cache, so the new index never references an
# asset that is not yet in the bucket.
Invoke-Checked 'upload hashed assets' {
    aws s3 sync (Join-Path $frontendDir 'dist') "s3://$bucket" `
        --exclude index.html --cache-control 'public,max-age=31536000,immutable' --no-progress
}
# The entry point last and uncached, so a deployment takes effect at once.
Invoke-Checked 'upload index.html' {
    aws s3 cp (Join-Path $frontendDir 'dist/index.html') "s3://$bucket/index.html" `
        --cache-control 'no-cache,no-store,must-revalidate' `
        --content-type 'text/html; charset=utf-8' --no-progress
}
Invoke-Checked 'remove orphaned files' {
    aws s3 sync (Join-Path $frontendDir 'dist') "s3://$bucket" --delete --no-progress
}

# ---------------------------------------------------------------------------
# 6. Cache invalidation and smoke test.
# ---------------------------------------------------------------------------
Step '6/6 Invalidate the cache and verify'
if (-not $DryRun) {
    $invalidation = aws cloudfront create-invalidation --distribution-id $distributionId `
        --paths '/' '/index.html' --query 'Invalidation.Id' --output text
    aws cloudfront wait invalidation-completed --distribution-id $distributionId --id $invalidation
    Info 'invalidation' "$invalidation complete"

    curl.exe -fsS --retry 5 --retry-delay 5 $siteUrl 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Fail 'The site did not respond.' }
    # A client-side route is not an object in S3, so this proves the
    # single-page-app fallback works.
    curl.exe -fsS --retry 3 --retry-delay 5 "$siteUrl/dashboard" 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Fail 'The single-page-app fallback did not work.' }
    Info 'site' 'responding on / and /dashboard'
}

Step 'Done'
Info 'site' $siteUrl
Info 'api' $apiUrl
Write-Host ''
Write-Host 'Set these as GitHub repository variables so CI can deploy:' -ForegroundColor Yellow
Write-Host "  AWS_REGION=$Region"
Write-Host "  ECR_REPOSITORY=$Prefix-api"
Write-Host "  FRONTEND_BUCKET=$bucket"
Write-Host "  CLOUDFRONT_DISTRIBUTION_ID=$distributionId"
Write-Host "  VITE_API_URL=$apiUrl"
Write-Host ''
Write-Host 'Create a budget before leaving this running.' -ForegroundColor Yellow
