<#
    Asks IAM directly which of the deployment's actions this identity is
    allowed to perform.

    Uses SimulatePrincipalPolicy, which evaluates policy without performing
    anything. More reliable than probing with list calls, because a policy can
    allow a write while denying the corresponding list.
#>
$ErrorActionPreference = 'Continue'
$env:AWS_PAGER = ''

$envFile = Join-Path (Split-Path $PSScriptRoot -Parent) 'backend\.env'
$values = @{}
foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
        $values[$Matches[1]] = $Matches[2].Trim().Trim('"').Trim("'")
    }
}
$env:AWS_ACCESS_KEY_ID = if ($values['AWS_ACCESS_KEY_ID']) { $values['AWS_ACCESS_KEY_ID'] } else { $values['AWS_access_key'] }
$env:AWS_SECRET_ACCESS_KEY = if ($values['AWS_SECRET_ACCESS_KEY']) { $values['AWS_SECRET_ACCESS_KEY'] } else { $values['AWS_Secret_key'] }
$env:AWS_DEFAULT_REGION = 'us-east-1'

$arn = (aws sts get-caller-identity --query 'Arn' --output text 2>&1 | Out-String).Trim()
Write-Output "identity: $arn"
Write-Output ''

# The write actions the deployment actually performs.
$actions = @(
    'cloudformation:CreateStack',
    'ecr:CreateRepository',
    'ecr:GetAuthorizationToken',
    'ecr:PutImage',
    'apprunner:CreateService',
    'iam:CreateRole',
    'iam:PassRole',
    'dynamodb:CreateTable',
    's3:CreateBucket',
    's3:PutObject',
    'cloudfront:CreateDistribution',
    'cloudfront:CreateInvalidation',
    'secretsmanager:CreateSecret'
)

$simulated = aws iam simulate-principal-policy `
    --policy-source-arn $arn `
    --action-names $actions `
    --query 'EvaluationResults[].[EvalActionName,EvalDecision]' `
    --output text 2>&1 | Out-String

if ($LASTEXITCODE -ne 0) {
    Write-Output 'Cannot simulate: this identity lacks iam:SimulatePrincipalPolicy.'
    Write-Output 'Falling back to the read probes in aws-check.ps1.'
    Write-Output ''
    Write-Output (($simulated.Trim() -split "`n" | Select-Object -Last 1).Trim())
    exit 1
}

$allowed = 0
$denied = @()

foreach ($line in ($simulated.Trim() -split "`n")) {
    $parts = $line.Trim() -split '\s+'
    if ($parts.Count -lt 2) { continue }
    $action = $parts[0]
    $decision = $parts[1]
    Write-Output ("{0,-34} {1}" -f $action, $decision)
    if ($decision -eq 'allowed') { $allowed++ } else { $denied += $action }
}

Write-Output ''
Write-Output ("allowed: $allowed of " + $actions.Count)
if ($denied.Count -gt 0) {
    Write-Output ('denied : ' + ($denied -join ', '))
}
