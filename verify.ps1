# Runs every local check and prints one summary.
# cfn-lint is optional: install with `pip install cfn-lint`.
$ErrorActionPreference = 'Continue'
$results = @()

function Step($name, $dir, $cmd) {
    Push-Location (Join-Path $PSScriptRoot $dir)
    $out = Invoke-Expression $cmd 2>&1
    $code = $LASTEXITCODE
    Pop-Location
    $script:results += [PSCustomObject]@{ Check = $name; Status = if ($code -eq 0) { 'PASS' } else { 'FAIL' } }
    if ($code -ne 0) {
        Write-Output "--- $name ---"
        $out | Select-Object -Last 20 | ForEach-Object { Write-Output $_ }
    }
}

Step 'backend lint'       'backend'  'npm run lint'
Step 'backend typecheck'  'backend'  'npm run typecheck'
Step 'backend tests'      'backend'  'npx vitest run'
Step 'backend build'      'backend'  'npm run build'
Step 'backend audit'      'backend'  'npm audit --audit-level=high'
Step 'frontend lint'      'frontend' 'npm run lint'
Step 'frontend typecheck' 'frontend' 'npm run typecheck'
Step 'frontend tests'     'frontend' 'npx vitest run'
Step 'frontend build'     'frontend' 'npm run build'
Step 'frontend audit'     'frontend' 'npm audit --audit-level=high'

# pip installs console scripts into a per-user Scripts directory that is often
# not on PATH, which made this silently skip and report 9 checks as a clean run.
$cfnLint = (Get-Command cfn-lint -ErrorAction SilentlyContinue).Source
if (-not $cfnLint) {
    $cfnLint = Get-ChildItem -Path @(
        (Join-Path $env:APPDATA 'Python\*\Scripts\cfn-lint.exe'),
        (Join-Path $env:LOCALAPPDATA 'Programs\Python\*\Scripts\cfn-lint.exe')
    ) -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
}

if ($cfnLint) {
    Step 'cfn-lint templates' '.' "& '$cfnLint' infrastructure\*.yaml"
}
else {
    Write-Output 'cfn-lint not found, skipping template validation (pip install cfn-lint)'
}

Write-Output ''
$results | Format-Table -AutoSize
$failed = ($results | Where-Object { $_.Status -eq 'FAIL' }).Count
Write-Output ("checks: " + $results.Count + ", failed: " + $failed)
exit $failed
