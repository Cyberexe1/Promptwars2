<#
.SYNOPSIS
    Redeploys only the frontend: the CloudFront stack and the published bundle.

.DESCRIPTION
    Use this when the backend has not changed. deploy.ps1 runs the whole
    pipeline, including ECR, the data stack, and App Runner, and needs a running
    Docker daemon. None of that is needed to ship a frontend change, so this
    skips it.

    It does four things, in order:
      1. updates the CloudFront stack, pointing /api at the App Runner origin
      2. builds the bundle for same-origin calls (VITE_API_URL=/)
      3. uploads assets, then index.html, then a copy of the shell per route
      4. invalidates the cache and checks the result

    Same-origin matters because the session and CSRF cookies are SameSite=Lax.
    A bundle that calls App Runner directly makes the page and the API
    different sites, the browser withholds the cookies, and sign-up fails.

    Keep the route list below in step with frontend/src/App.tsx and with the
    same list in deploy.ps1.
#>
$ErrorActionPreference = 'Continue'
$env:AWS_PAGER = ''

. (Join-Path $PSScriptRoot '_aws-env.ps1')

$repoRoot = Split-Path $PSScriptRoot -Parent
$prefix = 'smogwise'

function Step($t) { Write-Host ''; Write-Host "=== $t ===" -ForegroundColor Cyan }
function Fail($m) { Write-Host "FAILED: $m" -ForegroundColor Red; exit 1 }

Step 'Read stack outputs'
$apiUrl = (aws cloudformation describe-stacks --stack-name "$prefix-backend" `
        --query "Stacks[0].Outputs[?OutputKey=='ServiceUrl'].OutputValue" `
        --output text --region $region 2>&1 | Out-String).Trim()
$bucket = (aws cloudformation describe-stacks --stack-name "$prefix-frontend" `
        --query "Stacks[0].Outputs[?OutputKey=='BucketName'].OutputValue" `
        --output text --region $region 2>&1 | Out-String).Trim()
$siteUrl = (aws cloudformation describe-stacks --stack-name "$prefix-frontend" `
        --query "Stacks[0].Outputs[?OutputKey=='SiteUrl'].OutputValue" `
        --output text --region $region 2>&1 | Out-String).Trim()
$distId = (aws cloudformation describe-stacks --stack-name "$prefix-frontend" `
        --query "Stacks[0].Outputs[?OutputKey=='DistributionId'].OutputValue" `
        --output text --region $region 2>&1 | Out-String).Trim()

Write-Host "  api:    $apiUrl"
Write-Host "  bucket: $bucket"
Write-Host "  site:   $siteUrl"
Write-Host "  dist:   $distId"

if (-not $apiUrl -or $apiUrl -notmatch '^https://') { Fail 'could not read the API URL' }
if (-not $bucket) { Fail 'could not read the bucket name' }
if (-not $distId) { Fail 'could not read the distribution id' }

Step 'Add the /api behaviour to CloudFront'
# ApiOrigin becomes a second origin so /api/* is proxied through the
# distribution, which keeps the page and the API same-site.
aws cloudformation deploy `
    --template-file (Join-Path $PSScriptRoot '05-frontend.yaml') `
    --stack-name "$prefix-frontend" `
    --parameter-overrides "BucketName=$bucket" "ApiOrigin=$apiUrl" `
    --region $region
if ($LASTEXITCODE -ne 0) { Fail 'frontend stack update failed' }

Step 'Rebuild the bundle for same-origin calls'
Push-Location (Join-Path $repoRoot 'frontend')
try {
    # A slash, not an empty string: PowerShell deletes an environment variable
    # when you assign '' to it, so Vite saw nothing and the bundle fell back to
    # localhost. api.ts strips the trailing slash, so the base becomes empty
    # and every call is same-origin.
    $env:VITE_API_URL = '/'
    npm run build
    if ($LASTEXITCODE -ne 0) { Fail 'frontend build failed' }

    if (Select-String -Path 'dist/assets/*.js' -Pattern 'awsapprunner\.com' -Quiet) {
        Fail 'bundle still calls App Runner directly'
    }
    if (Select-String -Path 'dist/assets/*.js' -Pattern 'localhost:3000' -Quiet) {
        Fail 'bundle still calls localhost'
    }
    Write-Host '  bundle is same-origin' -ForegroundColor Green
}
finally { Pop-Location }

Step 'Publish'
$dist = Join-Path $repoRoot 'frontend\dist'
# Hashed assets first with a long cache, so the new index never references an
# asset that is not uploaded yet.
aws s3 sync "$dist/assets" "s3://$bucket/assets" --delete `
    --cache-control 'public,max-age=31536000,immutable' --region $region
if ($LASTEXITCODE -ne 0) { Fail 'asset upload failed' }

aws s3 sync "$dist" "s3://$bucket" --exclude 'assets/*' `
    --cache-control 'no-cache' --region $region
if ($LASTEXITCODE -ne 0) { Fail 'root upload failed' }

Step 'Publish the app shell at each client-side route'
# Replaces the CloudFront CustomErrorResponses that used to serve index.html
# for any 403. Those applied to every behaviour, so once the API shared this
# distribution they rewrote its 403 and 404 responses into 200s carrying HTML.
#
# Keep this list in step with the routes in frontend/src/App.tsx. A route that
# is missing here still works when reached by in-app navigation and returns the
# S3 error on a direct load or refresh.
$routes = @('login', 'privacy', 'dashboard')
foreach ($route in $routes) {
    aws s3 cp (Join-Path $dist 'index.html') "s3://$bucket/$route" `
        --content-type 'text/html' --cache-control 'no-cache' --region $region
    if ($LASTEXITCODE -ne 0) { Fail "could not publish the shell for /$route" }
}

Step 'Invalidate the cache'
$inv = (aws cloudfront create-invalidation --distribution-id $distId `
        --paths '/*' --query 'Invalidation.Id' --output text 2>&1 | Out-String).Trim()
Write-Host "  invalidation: $inv"
aws cloudfront wait invalidation-completed --distribution-id $distId --id $inv
if ($LASTEXITCODE -ne 0) { Write-Host '  wait timed out; the invalidation may still be running' -ForegroundColor Yellow }

Step 'Verify'
$viaCf = (curl.exe -s -o NUL -w '%{http_code} %{content_type}' "$siteUrl/api/air-quality?latitude=28.65&longitude=77.23" 2>&1 | Out-String).Trim()
Write-Host "  api on site origin:     $viaCf"
if ($viaCf -match '^200 application/json') {
    Write-Host '  PASS  the API answers JSON on the site origin' -ForegroundColor Green
}
else {
    Write-Host '  FAIL  still not proxied' -ForegroundColor Red
}

# A refused request must look refused. This is what the removed
# CustomErrorResponses were turning into a 200.
$noCsrf = (curl.exe -s -o NUL -w '%{http_code}' -X POST -H 'Content-Type: application/json' `
        -d '{}' "$siteUrl/api/auth/login" 2>&1 | Out-String).Trim()
Write-Host "  POST login without CSRF: $noCsrf"
if ($noCsrf -eq '403') {
    Write-Host '  PASS  refusals keep their status through CloudFront' -ForegroundColor Green
}
else {
    Write-Host "  FAIL  expected 403, got $noCsrf" -ForegroundColor Red
}

foreach ($route in @('login', 'privacy', 'dashboard')) {
    $r = (curl.exe -s -o NUL -w '%{http_code} %{content_type}' "$siteUrl/$route" 2>&1 | Out-String).Trim()
    Write-Host "  GET /$route -> $r"
}

Write-Host ''
Write-Host 'Now sign in at the site in a real browser. curl cannot verify SameSite.' -ForegroundColor Yellow
