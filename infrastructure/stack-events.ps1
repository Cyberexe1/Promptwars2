# Shows the failure reasons from a stack's event history.
param([Parameter(Mandatory = $true)][string]$StackName)

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
