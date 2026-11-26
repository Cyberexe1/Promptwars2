<#
.SYNOPSIS
    Checks, against the live site, that plans carry the behaviour the brief asks
    for, rather than only that the endpoint answers.

.DESCRIPTION
    verify-account-flow.ps1 proves the plumbing works. This proves what comes
    out of it: that a household with no vehicle and no solid-fuel cooking still
    gets an action that cuts pollution at source, that the budget answer changes
    the plan, and that timing advice names an hour or withdraws itself instead
    of repeating a fixed time of day.

    Creates one throwaway account, as the other verify scripts do.
#>
$ErrorActionPreference = 'Continue'
$site = 'https://d1lae1x52oxefj.cloudfront.net'
$pass = 0; $fail = 0

function Check($label, $ok, $detail) {
    if ($ok) { $script:pass++; Write-Host "  PASS  $label  $detail" -ForegroundColor Green }
    else { $script:fail++; Write-Host "  FAIL  $label  $detail" -ForegroundColor Red }
}

$jar = Join-Path $env:TEMP 'behaviour-jar.txt'
Remove-Item $jar -ErrorAction SilentlyContinue
curl.exe -s -c $jar -o NUL "$site/api/auth/me" 2>&1 | Out-Null
$token = (Get-Content $jar | Where-Object { $_ -match 'smogwise_csrf' } | ForEach-Object { ($_ -split "`t")[-1] } | Select-Object -First 1)

$cred = Join-Path $env:TEMP 'behaviour-cred.json'
@{ email = "behave$(Get-Random)@example.com"; password = 'correct horse battery staple' } |
    ConvertTo-Json | Set-Content $cred -Encoding utf8
$code = (curl.exe -s -b $jar -c $jar -o NUL -w '%{http_code}' -X POST -H 'Content-Type: application/json' `
        -H "x-csrf-token: $token" -H "Origin: $site" --data-binary "@$cred" "$site/api/auth/signup" 2>&1 | Out-String).Trim()
if ($code -ne '201') { Write-Host "could not create the test account ($code)" -ForegroundColor Red; exit 1 }

function Get-Plan($overrides) {
    $profile = @{
        ageGroups = @('adult'); sensitive = $false; commuteMethod = 'public-transport'
        outdoorMinutes = 60; cookingFuel = 'electric'; purifier = $false; budget = 'medium'
    }
    foreach ($k in $overrides.Keys) { $profile[$k] = $overrides[$k] }
    $file = Join-Path $env:TEMP 'behaviour-plan.json'
    @{ location = @{ name = 'Delhi'; latitude = 28.65; longitude = 77.23 }; profile = $profile } |
        ConvertTo-Json -Depth 5 | Set-Content $file -Encoding utf8
    $json = curl.exe -s -b $jar -X POST -H 'Content-Type: application/json' -H "x-csrf-token: $token" `
        -H "Origin: $site" --data-binary "@$file" "$site/api/recommendations" 2>&1 | Out-String
    Remove-Item $file -ErrorAction SilentlyContinue
    $json | ConvertFrom-Json
}

Write-Host ''
Write-Host '--- a household that used to get no emission advice ---' -ForegroundColor Cyan
$plan = Get-Plan @{}
Check 'plan has recommendations' ($plan.recommendations.Count -ge 4) "($($plan.recommendations.Count))"
$emission = @($plan.recommendations | Where-Object { $_.reducesEmissions })
Check 'at least one action cuts pollution at source' ($emission.Count -ge 1) ($emission.id -join ', ')
Write-Host "  generatedBy: $($plan.generatedBy)   band: $($plan.risk.label)"
Write-Host '  plan:'
$plan.recommendations | ForEach-Object { Write-Host ('    {0}{1}' -f $(if ($_.reducesEmissions) { '[source] ' } else { '         ' }), $_.id) }

Write-Host ''
Write-Host '--- budget changes the plan ---' -ForegroundColor Cyan
$ids = @{}
foreach ($b in 'low', 'medium', 'high') {
    $ids[$b] = ((Get-Plan @{ budget = $b; cookingFuel = 'gas' }).recommendations.id | Sort-Object) -join ','
}
Check 'low differs from medium' ($ids.low -ne $ids.medium) ''
Check 'medium differs from high' ($ids.medium -ne $ids.high) ''

Write-Host ''
Write-Host '--- timing advice ---' -ForegroundColor Cyan
$shift = $plan.recommendations | Where-Object { $_.id -eq 'shift-outdoor-activity' }
if ($shift) {
    Write-Host "  title:  $($shift.title)"
    Write-Host "  action: $($shift.action)"
    $fixed = $shift.action -match 'early afternoon'
    $hasHour = $shift.action -match '\b\d{1,2}\s?(am|pm)\b|\b\d{1,2}:\d{2}\b'
    $withdrawn = $shift.action -match 'no cleaner|similar level|as short as'
    Check 'not the old fixed "early afternoon" wording' (-not $fixed) ''
    Check 'names an hour, or says there is no better one' ($hasHour -or $withdrawn) ''
}
else {
    Write-Host '  (not in this plan: the air is too bad for retiming advice to apply)'
    Check 'retiming advice withheld at a severe reading' ($plan.risk.level -in 'unhealthy', 'very-unhealthy', 'hazardous') $plan.risk.level
}

Write-Host ''
Write-Host '--- the matching air-quality outlook carries the offset ---' -ForegroundColor Cyan
$aq = curl.exe -s "$site/api/air-quality?latitude=28.65&longitude=77.23" 2>&1 | Out-String | ConvertFrom-Json
Check 'outlook has utcOffsetSeconds' ($null -ne $aq.outlook.utcOffsetSeconds) "($($aq.outlook.utcOffsetSeconds) s; Delhi is 19800)"
Check 'offset is Delhi local time' ($aq.outlook.utcOffsetSeconds -eq 19800) ''
if ($aq.outlook.windowSpread -ne $null) { Write-Host "  forecast spread over the advice window: $($aq.outlook.windowSpread) AQI points" }

Remove-Item $jar, $cred -ErrorAction SilentlyContinue
Write-Host ''
Write-Host "passed $pass, failed $fail" -ForegroundColor $(if ($fail -eq 0) { 'Green' } else { 'Yellow' })
