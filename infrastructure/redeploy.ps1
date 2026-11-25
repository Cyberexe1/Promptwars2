# Rolls the App Runner service onto the image just pushed, then republishes
# the frontend. Waits for the service to come back healthy before publishing,
# so the site is never pointed at a restarting API.
$ErrorActionPreference = 'Continue'
$env:AWS_PAGER = ''

$infra = $PSScriptRoot
$region = 'us-east-1'

$envFile = Join-Path (Split-Path $infra -Parent) 'backend\.env'
$values = @{}
foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
        $values[$Matches[1]] = $Matches[2].Trim().Trim('"').Trim("'")
    }
}
$env:AWS_ACCESS_KEY_ID = if ($values['AWS_ACCESS_KEY_ID']) { $values['AWS_ACCESS_KEY_ID'] } else { $values['AWS_access_key'] }
$env:AWS_SECRET_ACCESS_KEY = if ($values['AWS_SECRET_ACCESS_KEY']) { $values['AWS_SECRET_ACCESS_KEY'] } else { $values['AWS_Secret_key'] }
$env:AWS_DEFAULT_REGION = $region

$arn = (aws cloudformation describe-stacks --stack-name smogwise-backend --region $region `
        --query "Stacks[0].Outputs[?OutputKey=='ServiceArn'].OutputValue" --output text 2>&1 | Out-String).Trim()

Write-Host 'Starting the App Runner deployment'
$op = (aws apprunner start-deployment --service-arn $arn --query 'OperationId' --output text 2>&1 | Out-String).Trim()
Write-Host "  operation: $op"

for ($i = 1; $i -le 60; $i++) {
    Start-Sleep -Seconds 10
    $status = (aws apprunner describe-service --service-arn $arn `
            --query 'Service.Status' --output text 2>&1 | Out-String).Trim()
    Write-Host "  attempt $i : $status"
    if ($status -eq 'RUNNING') { break }
    if ($status -match 'FAILED') { Write-Host 'Deployment failed.'; exit 1 }
}

$api = (aws cloudformation describe-stacks --stack-name smogwise-backend --region $region `
        --query "Stacks[0].Outputs[?OutputKey=='ServiceUrl'].OutputValue" --output text 2>&1 | Out-String).Trim()
Write-Host ''
Write-Host 'API health after rollout:'
curl.exe -fsS --retry 10 --retry-delay 6 "$api/health"
Write-Host ''
