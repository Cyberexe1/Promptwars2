<#
    Runs one deployment step at a time, so a failure is diagnosable instead of
    leaving a half-finished run to unpick.

    Usage: ./step.ps1 <ecr|data|image|backend|frontend|cors|publish|verify|status>

    WARNING: this overlaps deploy.ps1 and has drifted from it. The `backend`
    and `cors` steps pass an empty BedrockModelId, so running either after
    enable-bedrock.ps1 removes Bedrock from the live service and drops
    bedrock:InvokeModel from the instance role. The `frontend` step omits
    ApiOrigin, which widens the CSP connect-src that deploy.ps1 narrows.
    Prefer deploy.ps1 unless you specifically need one stage in isolation.
#>
param([Parameter(Mandatory = $true)][string]$Step)

$ErrorActionPreference = 'Continue'
$env:AWS_PAGER = ''

$infra = $PSScriptRoot
$repoRoot = Split-Path $infra -Parent
$region = 'us-east-1'
$prefix = 'smogwise'

# ----- credentials ----------------------------------------------------------
$envFile = Join-Path $repoRoot 'backend\.env'
$values = @{}
foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
        $values[$Matches[1]] = $Matches[2].Trim().Trim('"').Trim("'")
    }
}
$env:AWS_ACCESS_KEY_ID = if ($values['AWS_ACCESS_KEY_ID']) { $values['AWS_ACCESS_KEY_ID'] } else { $values['AWS_access_key'] }
$env:AWS_SECRET_ACCESS_KEY = if ($values['AWS_SECRET_ACCESS_KEY']) { $values['AWS_SECRET_ACCESS_KEY'] } else { $values['AWS_Secret_key'] }
$env:AWS_DEFAULT_REGION = $region

$account = (aws sts get-caller-identity --query 'Account' --output text 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0) { Write-Host 'Credentials rejected.'; exit 1 }

$bucket = "$prefix-web-$account"
$registry = "$account.dkr.ecr.$region.amazonaws.com"
$imageTag = "$registry/$prefix-api:latest"

function Out($label, $value) { Write-Host ("  {0,-20} {1}" -f $label, $value) }

function Get-Output($stack, $key) {
    $v = (aws cloudformation describe-stacks --stack-name $stack --region $region `
            --query "Stacks[0].Outputs[?OutputKey=='$key'].OutputValue" --output text 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -ne 0) { return $null }
    return $v
}

switch ($Step) {

    'ecr' {
        Write-Host 'Deploying the container registry'
        aws cloudformation deploy --template-file (Join-Path $infra '02-ecr.yaml') `
            --stack-name "$prefix-ecr" --region $region
        if ($LASTEXITCODE -ne 0) { Write-Host 'FAILED'; exit 1 }
        Out 'repository' (Get-Output "$prefix-ecr" 'RepositoryUri')
    }

    'data' {
        Write-Host 'Deploying the DynamoDB table'
        aws cloudformation deploy --template-file (Join-Path $infra '03-data.yaml') `
            --stack-name "$prefix-data" --region $region
        if ($LASTEXITCODE -ne 0) { Write-Host 'FAILED'; exit 1 }
        Out 'table' (Get-Output "$prefix-data" 'TableName')
    }

    'image' {
        Write-Host 'Building and pushing the API image'
        aws ecr get-login-password --region $region | docker login --username AWS --password-stdin $registry
        if ($LASTEXITCODE -ne 0) { Write-Host 'FAILED at docker login'; exit 1 }

        docker build -t "$prefix-api:latest" (Join-Path $repoRoot 'backend')
        if ($LASTEXITCODE -ne 0) { Write-Host 'FAILED at docker build'; exit 1 }

        docker tag "$prefix-api:latest" $imageTag
        docker push $imageTag
        if ($LASTEXITCODE -ne 0) { Write-Host 'FAILED at docker push'; exit 1 }
        Out 'image' $imageTag
    }

    'backend' {
        Write-Host 'Deploying the App Runner service'
        # CORS is set to the CloudFront origin later, once it exists. Until
        # then it stays at localhost rather than a wildcard.
        $cors = Get-Output "$prefix-frontend" 'SiteUrl'
        if (-not $cors) { $cors = 'http://localhost:5173' }
        Out 'cors origin' $cors

        aws cloudformation deploy --template-file (Join-Path $infra '04-backend.yaml') `
            --stack-name "$prefix-backend" --capabilities CAPABILITY_IAM `
            --parameter-overrides "CorsAllowedOrigins=$cors" "DynamoDbTableName=$prefix" 'BedrockModelId=' `
            --region $region
        if ($LASTEXITCODE -ne 0) { Write-Host 'FAILED'; exit 1 }
        Out 'api url' (Get-Output "$prefix-backend" 'ServiceUrl')
    }

    'frontend' {
        Write-Host 'Deploying S3 and CloudFront'
        aws cloudformation deploy --template-file (Join-Path $infra '05-frontend.yaml') `
            --stack-name "$prefix-frontend" --parameter-overrides "BucketName=$bucket" `
            --region $region
        if ($LASTEXITCODE -ne 0) { Write-Host 'FAILED'; exit 1 }
        Out 'site url' (Get-Output "$prefix-frontend" 'SiteUrl')
        Out 'distribution' (Get-Output "$prefix-frontend" 'DistributionId')
    }

    'cors' {
        Write-Host 'Pointing the API CORS allowlist at CloudFront'
        $site = Get-Output "$prefix-frontend" 'SiteUrl'
        if (-not $site) { Write-Host 'Frontend stack not deployed yet.'; exit 1 }
        Out 'cors origin' $site

        aws cloudformation deploy --template-file (Join-Path $infra '04-backend.yaml') `
            --stack-name "$prefix-backend" --capabilities CAPABILITY_IAM `
            --parameter-overrides "CorsAllowedOrigins=$site" "DynamoDbTableName=$prefix" 'BedrockModelId=' `
            --region $region
        if ($LASTEXITCODE -ne 0) { Write-Host 'FAILED'; exit 1 }
    }

    'publish' {
        $api = Get-Output "$prefix-backend" 'ServiceUrl'
        $distribution = Get-Output "$prefix-frontend" 'DistributionId'
        if (-not $api) { Write-Host 'Backend stack not deployed yet.'; exit 1 }
        Out 'api url' $api

        Write-Host 'Building the frontend against the deployed API'
        Push-Location (Join-Path $repoRoot 'frontend')
        try {
            $env:VITE_API_URL = $api
            npm run build
            if ($LASTEXITCODE -ne 0) { Write-Host 'FAILED at build'; exit 1 }
            if (Select-String -Path 'dist/assets/*.js' -Pattern 'localhost:3000' -Quiet) {
                Write-Host 'FAILED: bundle still points at localhost'; exit 1
            }
        }
        finally { Pop-Location }

        $dist = Join-Path $repoRoot 'frontend\dist'
        Write-Host 'Uploading hashed assets'
        aws s3 sync $dist "s3://$bucket" --exclude index.html `
            --cache-control 'public,max-age=31536000,immutable' --no-progress
        Write-Host 'Uploading the entry point'
        aws s3 cp (Join-Path $dist 'index.html') "s3://$bucket/index.html" `
            --cache-control 'no-cache,no-store,must-revalidate' `
            --content-type 'text/html; charset=utf-8' --no-progress
        aws s3 sync $dist "s3://$bucket" --delete --no-progress

        Write-Host 'Invalidating the cache'
        $id = (aws cloudfront create-invalidation --distribution-id $distribution `
                --paths '/' '/index.html' --query 'Invalidation.Id' --output text 2>&1 | Out-String).Trim()
        Out 'invalidation' $id
    }

    'verify' {
        $api = Get-Output "$prefix-backend" 'ServiceUrl'
        $site = Get-Output "$prefix-frontend" 'SiteUrl'
        Out 'api' $api
        Out 'site' $site
        Write-Host ''
        Write-Host 'API health:'
        curl.exe -fsS "$api/health"
        Write-Host ''
        Write-Host 'Anonymous plan request should be refused:'
        curl.exe -s -o NUL -w "  status %{http_code}`n" -X POST "$api/api/recommendations" -H 'content-type: application/json' -d '{}'
        Write-Host 'Site root:'
        curl.exe -s -o NUL -w "  status %{http_code}`n" $site
        Write-Host 'Client route fallback:'
        curl.exe -s -o NUL -w "  status %{http_code}`n" "$site/dashboard"
    }

    'status' {
        foreach ($s in @("$prefix-ecr", "$prefix-data", "$prefix-backend", "$prefix-frontend")) {
            $state = (aws cloudformation describe-stacks --stack-name $s --region $region `
                    --query 'Stacks[0].StackStatus' --output text 2>&1 | Out-String).Trim()
            if ($LASTEXITCODE -ne 0) { $state = 'not deployed' }
            Out $s $state
        }
    }

    default { Write-Host 'Unknown step. Use: ecr, data, image, backend, frontend, cors, publish, verify, status' }
}
