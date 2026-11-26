<#
    Redeploys the backend with a Bedrock model configured.

    The instance role only gains bedrock:InvokeModel when BedrockModelId is
    non-empty, so this redeploy is what grants the running service access.
#>
param([string]$ModelId = 'amazon.nova-pro-v1:0')

$ErrorActionPreference = 'Continue'
$env:AWS_PAGER = ''

$infra = $PSScriptRoot

# Sets $env:AWS_* and the $region used by the calls below. $region comes from
# AWS_REGION in backend/.env and falls back to us-east-1.
. (Join-Path $PSScriptRoot '_aws-env.ps1')

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
