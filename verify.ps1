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

Step 'backend typecheck'  'backend'  'npm run typecheck'
Step 'backend tests'      'backend'  'npx vitest run'
Step 'backend build'      'backend'  'npm run build'
Step 'backend audit'      'backend'  'npm audit --audit-level=high'
Step 'frontend lint'      'frontend' 'npm run lint'
Step 'frontend typecheck' 'frontend' 'npm run typecheck'
Step 'frontend tests'     'frontend' 'npx vitest run'
Step 'frontend build'     'frontend' 'npm run build'
Step 'frontend audit'     'frontend' 'npm audit --audit-level=high'

if (Get-Command cfn-lint -ErrorAction SilentlyContinue) {
    Step 'cfn-lint templates' '.' 'cfn-lint'
}
else {
    Write-Output 'cfn-lint not on PATH, skipping template validation'
}

Write-Output ''
$results | Format-Table -AutoSize
$failed = ($results | Where-Object { $_.Status -eq 'FAIL' }).Count
Write-Output ("checks: " + $results.Count + ", failed: " + $failed)
exit $failed
