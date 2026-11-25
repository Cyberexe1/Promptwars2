<#
    Loads AWS credentials from backend/.env under the names the CLI actually
    reads, then probes every service the deployment needs.

    Read-only: creates nothing. Secret values are never printed.
#>
$ErrorActionPreference = 'Continue'
$env:AWS_PAGER = ''

# ----- Load credentials -----------------------------------------------------
# The .env lives in backend/ at the repo root, which is this script's parent.
# Resolving against $PSScriptRoot alone pointed at infrastructure/backend/.env,
# which does not exist, so every run exited here before probing anything.
$envFile = Join-Path (Split-Path $PSScriptRoot -Parent) 'backend\.env'
if (-not (Test-Path $envFile)) { Write-Output "not found: $envFile"; exit 1 }

$values = @{}
foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
        $values[$Matches[1]] = $Matches[2].Trim().Trim('"').Trim("'")
    }
}

$accessKey = if ($values['AWS_ACCESS_KEY_ID']) { $values['AWS_ACCESS_KEY_ID'] } else { $values['AWS_access_key'] }
$secretKey = if ($values['AWS_SECRET_ACCESS_KEY']) { $values['AWS_SECRET_ACCESS_KEY'] } else { $values['AWS_Secret_key'] }
$region = if ($values['AWS_REGION']) { $values['AWS_REGION'] } else { 'us-east-1' }

if (-not $accessKey -or -not $secretKey) { Write-Output 'No keys found in backend/.env'; exit 1 }

$env:AWS_ACCESS_KEY_ID = $accessKey
$env:AWS_SECRET_ACCESS_KEY = $secretKey
$env:AWS_DEFAULT_REGION = $region
if ($values['AWS_SESSION_TOKEN']) { $env:AWS_SESSION_TOKEN = $values['AWS_SESSION_TOKEN'] }

Write-Output ('region: ' + $region)
Write-Output ''

# ----- Probe ----------------------------------------------------------------
$probes = @(
    @{ Name = 'STS identity'; Need = 'always'; Args = @('sts', 'get-caller-identity') }
    @{ Name = 'App Runner'; Need = 'backend service'; Args = @('apprunner', 'list-services') }
    @{ Name = 'CloudFormation'; Need = 'every stack'; Args = @('cloudformation', 'list-stacks') }
    @{ Name = 'ECR'; Need = 'container image'; Args = @('ecr', 'describe-repositories') }
    @{ Name = 'IAM roles'; Need = 'instance role'; Args = @('iam', 'list-roles', '--max-items', '1') }
    @{ Name = 'DynamoDB'; Need = 'accounts and cache'; Args = @('dynamodb', 'list-tables') }
    @{ Name = 'S3'; Need = 'frontend bucket'; Args = @('s3api', 'list-buckets') }
    @{ Name = 'CloudFront'; Need = 'frontend delivery'; Args = @('cloudfront', 'list-distributions') }
    @{ Name = 'Secrets Manager'; Need = 'session secret'; Args = @('secretsmanager', 'list-secrets') }
    @{ Name = 'Bedrock'; Need = 'optional wording'; Args = @('bedrock', 'list-foundation-models') }
)

$denied = @()

foreach ($probe in $probes) {
    $output = (& aws @($probe.Args) --output text 2>&1 | Out-String)
    if ($LASTEXITCODE -eq 0) {
        Write-Output ("{0,-17} OK             {1}" -f $probe.Name, $probe.Need)
    }
    else {
        $reason = 'FAILED'
        if ($output -match 'AccessDenied|not authorized|UnauthorizedOperation|explicit deny') { $reason = 'ACCESS DENIED' }
        elseif ($output -match 'opt-in|subscription|not available|InvalidAction') { $reason = 'UNAVAILABLE' }
        Write-Output ("{0,-17} {1,-14} {2}" -f $probe.Name, $reason, $probe.Need)
        $denied += $probe.Name
    }
}

Write-Output ''
if ($denied.Count -eq 0) {
    Write-Output 'RESULT: this identity can reach every service the deployment needs.'
}
else {
    Write-Output ('RESULT: cannot use -> ' + ($denied -join ', '))
}
