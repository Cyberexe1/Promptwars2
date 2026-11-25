# Lists Bedrock models this account can invoke, and the inference profiles
# that wrap them. Read-only.
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

Write-Host '--- text models supporting on-demand invocation ---'
$json = aws bedrock list-foundation-models --region us-east-1 --output json 2>&1 | Out-String
if ($LASTEXITCODE -ne 0) {
    Write-Host 'Cannot list models:'
    Write-Host (($json.Trim() -split "`n" | Select-Object -Last 1).Trim())
    exit 1
}

($json | ConvertFrom-Json).modelSummaries |
    Where-Object {
        $_.outputModalities -contains 'TEXT' -and
        $_.inferenceTypesSupported -contains 'ON_DEMAND'
    } |
    Select-Object -First 25 |
    ForEach-Object { Write-Host ('  ' + $_.modelId) }

Write-Host ''
Write-Host '--- inference profiles (cross-region, needed by newer models) ---'
$profiles = aws bedrock list-inference-profiles --region us-east-1 --output json 2>&1 | Out-String
if ($LASTEXITCODE -eq 0) {
    ($profiles | ConvertFrom-Json).inferenceProfileSummaries |
        Select-Object -First 15 |
        ForEach-Object { Write-Host ('  ' + $_.inferenceProfileId + '   [' + $_.status + ']') }
}
else {
    Write-Host '  cannot list inference profiles'
}
