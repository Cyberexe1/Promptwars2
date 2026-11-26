# Full account flow on the live site. Every request is same-site now, so this
# tracks browser behaviour closely. SameSite itself still needs a real browser.
$ErrorActionPreference = 'Continue'
$site = 'https://d1lae1x52oxefj.cloudfront.net'
$pass = 0; $fail = 0

function Section($t) { Write-Host ''; Write-Host "--- $t ---" -ForegroundColor Cyan }
function Check($label, $ok, $detail) {
    if ($ok) { $script:pass++; Write-Host "  PASS  $label  $detail" -ForegroundColor Green }
    else { $script:fail++; Write-Host "  FAIL  $label  $detail" -ForegroundColor Red }
}

Section 'Site and bundle'
$html = curl.exe -s "$site/" 2>&1 | Out-String
$entry = ([regex]::Matches($html, 'src="(/assets/index-[^"]+\.js)"') | ForEach-Object { $_.Groups[1].Value } | Select-Object -First 1)
$js = curl.exe -s "$site$entry" 2>&1 | Out-String
Check 'bundle has no App Runner host' ($js -notmatch 'awsapprunner') ''
Check 'bundle has no localhost' ($js -notmatch 'localhost:3000') ''

Section 'Direct loads of client-side routes'
foreach ($r in @('login', 'privacy', 'dashboard')) {
    $c = (curl.exe -s -o NUL -w '%{http_code}' "$site/$r" 2>&1 | Out-String).Trim()
    Check "GET /$r" ($c -eq '200') $c
}

Section 'API on the site origin'
$aq = (curl.exe -s -o NUL -w '%{http_code} %{content_type}' "$site/api/air-quality?latitude=28.65&longitude=77.23" 2>&1 | Out-String).Trim()
Check 'air quality' ($aq -match '^200 application/json') $aq

Section 'Refusals keep their real status'
$noCsrf = (curl.exe -s -o NUL -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{}' "$site/api/auth/login" 2>&1 | Out-String).Trim()
Check 'login without CSRF is 403' ($noCsrf -eq '403') $noCsrf
$missing = (curl.exe -s -o NUL -w '%{http_code}' "$site/api/does-not-exist" 2>&1 | Out-String).Trim()
Check 'unknown endpoint is 404' ($missing -eq '404') $missing
$anon = (curl.exe -s -o NUL -w '%{http_code}' "$site/api/auth/me" 2>&1 | Out-String).Trim()
Check 'anonymous /me is 401' ($anon -eq '401') $anon

Section 'Create an account'
$jar = Join-Path $env:TEMP 'flow.txt'
Remove-Item $jar -ErrorAction SilentlyContinue
curl.exe -s -c $jar -o NUL "$site/api/auth/me" 2>&1 | Out-Null
$token = (Get-Content $jar | Where-Object { $_ -match 'smogwise_csrf' } | ForEach-Object { ($_ -split "`t")[-1] } | Select-Object -First 1)
Check 'CSRF cookie issued' ([bool]$token) ''

$email = "live$(Get-Random)@example.com"
$cred = Join-Path $env:TEMP 'cred.json'
@{ email = $email; password = 'correct horse battery staple' } | ConvertTo-Json | Set-Content $cred -Encoding utf8

$code = (curl.exe -s -b $jar -c $jar -o NUL -w '%{http_code}' -X POST `
        -H 'Content-Type: application/json' -H "x-csrf-token: $token" -H "Origin: $site" `
        --data-binary "@$cred" "$site/api/auth/signup" 2>&1 | Out-String).Trim()
Check 'signup is 201' ($code -eq '201') $code

$sess = (Get-Content $jar | Where-Object { $_ -match 'smogwise_session' } | Select-Object -First 1)
Check 'session cookie set on the site host' ($sess -match 'cloudfront\.net') ''

Section 'Dashboard session'
$me = curl.exe -s -b $jar "$site/api/auth/me" 2>&1 | Out-String
Check 'authenticated /me returns a user' ($me -match '"user"') $me.Trim()

Section 'Build a plan'
$planReq = Join-Path $env:TEMP 'plan.json'
@{
    location = @{ name = 'Delhi'; latitude = 28.65; longitude = 77.23 }
    profile  = @{
        ageGroups = @('child', 'adult'); sensitive = $true
        commuteMethod = 'car'; outdoorMinutes = 90
        cookingFuel = 'gas'; purifier = $false; budget = 'high'
    }
} | ConvertTo-Json -Depth 5 | Set-Content $planReq -Encoding utf8

$plan = curl.exe -s -b $jar -X POST -H 'Content-Type: application/json' `
    -H "x-csrf-token: $token" -H "Origin: $site" --data-binary "@$planReq" `
    "$site/api/recommendations" 2>&1 | Out-String
Check 'plan generated' ($plan -match '"recommendations"') ''
if ($plan -match '"generatedBy":"([a-z]+)"') { Write-Host "  generatedBy: $($Matches[1])" }

Section 'Is the deployed API running the latest backend?'
Check 'reducesEmissions present' ($plan -match 'reducesEmissions') '(needs a new container image)'

Section 'Sign in again'
Remove-Item $jar -ErrorAction SilentlyContinue
curl.exe -s -c $jar -o NUL "$site/api/auth/me" 2>&1 | Out-Null
$t2 = (Get-Content $jar | Where-Object { $_ -match 'smogwise_csrf' } | ForEach-Object { ($_ -split "`t")[-1] } | Select-Object -First 1)
$login = (curl.exe -s -b $jar -c $jar -o NUL -w '%{http_code}' -X POST `
        -H 'Content-Type: application/json' -H "x-csrf-token: $t2" -H "Origin: $site" `
        --data-binary "@$cred" "$site/api/auth/login" 2>&1 | Out-String).Trim()
Check 'login is 200' ($login -eq '200') $login

$wrong = Join-Path $env:TEMP 'wrong.json'
@{ email = $email; password = 'definitely not the password' } | ConvertTo-Json | Set-Content $wrong -Encoding utf8
$bad = (curl.exe -s -b $jar -o NUL -w '%{http_code}' -X POST `
        -H 'Content-Type: application/json' -H "x-csrf-token: $t2" -H "Origin: $site" `
        --data-binary "@$wrong" "$site/api/auth/login" 2>&1 | Out-String).Trim()
Check 'wrong password is 401' ($bad -eq '401') $bad

Remove-Item $jar, $cred, $planReq, $wrong -ErrorAction SilentlyContinue
Write-Host ''
Write-Host "passed $pass, failed $fail" -ForegroundColor $(if ($fail -eq 0) { 'Green' } else { 'Yellow' })
