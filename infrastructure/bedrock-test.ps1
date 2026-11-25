# Confirms a model can actually be invoked through the Converse API, which is
# what the application uses. Listing models does not prove invoke access.
param([string]$ModelId = 'amazon.nova-pro-v1:0')

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

# Both payloads go in files: PowerShell strips quotes from inline JSON before
# the CLI ever sees it.
$messageFile = Join-Path $env:TEMP 'bedrock-msg.json'
$configFile = Join-Path $env:TEMP 'bedrock-cfg.json'
'[{"role":"user","content":[{"text":"Reply with exactly: OK"}]}]' |
    Set-Content $messageFile -Encoding ascii -NoNewline
'{"maxTokens":20,"temperature":0}' |
    Set-Content $configFile -Encoding ascii -NoNewline

Write-Host "model: $ModelId"
$out = (aws bedrock-runtime converse `
        --model-id $ModelId `
        --messages "file://$messageFile" `
        --inference-config "file://$configFile" `
        --region us-east-1 --output json 2>&1 | Out-String)

if ($LASTEXITCODE -eq 0) {
    $reply = ($out | ConvertFrom-Json).output.message.content[0].text
    Write-Host "INVOKE OK. reply: $($reply.Trim())"
}
else {
    Write-Host 'INVOKE FAILED:'
    Write-Host (($out.Trim() -split "`n" | Select-Object -Last 2) -join "`n")
}

Remove-Item $messageFile, $configFile -ErrorAction SilentlyContinue
