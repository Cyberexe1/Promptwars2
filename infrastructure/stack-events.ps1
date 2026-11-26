# Shows the failure reasons from a stack's event history.
param([Parameter(Mandatory = $true)][string]$StackName)

$ErrorActionPreference = 'Continue'
$env:AWS_PAGER = ''

. (Join-Path $PSScriptRoot '_aws-env.ps1')

$json = aws cloudformation describe-stack-events --stack-name $StackName `
    --region us-east-1 --output json 2>&1 | Out-String

if ($LASTEXITCODE -ne 0) {
    Write-Host 'Could not read stack events:'
    Write-Host (($json.Trim() -split "`n" | Select-Object -Last 1).Trim())
    exit 1
}

$events = ($json | ConvertFrom-Json).StackEvents |
    Where-Object { $_.ResourceStatus -match 'FAILED' }

if (-not $events) { Write-Host 'No failed events.'; exit 0 }

foreach ($e in ($events | Select-Object -First 6)) {
    Write-Host ('resource : ' + $e.LogicalResourceId + ' (' + $e.ResourceType + ')')
    Write-Host ('status   : ' + $e.ResourceStatus)
    Write-Host ('reason   : ' + $e.ResourceStatusReason)
    Write-Host ''
}
