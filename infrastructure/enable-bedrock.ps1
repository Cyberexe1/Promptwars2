<#
    Redeploys the backend with a Bedrock model configured.

    The instance role only gains bedrock:InvokeModel when BedrockModelId is
    non-empty, so this redeploy is what grants the running service access.
#>
param([string]$ModelId = 'amazon.nova-pro-v1:0')

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

$site = (aws cloudformation describe-stacks --stack-name smogwise-frontend --region $region `
        --query "Stacks[0].Outputs[?OutputKey=='SiteUrl'].OutputValue" --output text 2>&1 | Out-String).Trim()

Write-Host "model : $ModelId"
Write-Host "cors  : $site"
Write-Host ''

aws cloudformation deploy --template-file (Join-Path $infra '04-backend.yaml') `
    --stack-name smogwise-backend --capabilities CAPABILITY_IAM `
    --parameter-overrides "CorsAllowedOrigins=$site" 'DynamoDbTableName=smogwise' "BedrockModelId=$ModelId" `
    --region $region

if ($LASTEXITCODE -ne 0) { Write-Host 'FAILED'; exit 1 }

$api = (aws cloudformation describe-stacks --stack-name smogwise-backend --region $region `
        --query "Stacks[0].Outputs[?OutputKey=='ServiceUrl'].OutputValue" --output text 2>&1 | Out-String).Trim()
Write-Host ''
Write-Host "api : $api"
