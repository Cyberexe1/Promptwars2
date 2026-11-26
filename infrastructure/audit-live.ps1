# Audits the security posture of the running deployment.
$ErrorActionPreference = 'Continue'
$api = 'https://yzjmcnk4t4.us-east-1.awsapprunner.com'
$site = 'https://d1lae1x52oxefj.cloudfront.net'

function Section($t) { Write-Host ''; Write-Host "--- $t ---" }

Section 'API response headers'
$apiHeaders = curl.exe -s -D - -o NUL "$api/health" 2>&1 | Out-String
foreach ($h in @('strict-transport-security', 'x-content-type-options', 'x-frame-options',
        'content-security-policy', 'referrer-policy', 'x-powered-by',
        'cross-origin-opener-policy', 'origin-agent-cluster')) {
    $line = ($apiHeaders -split "`n" | Where-Object { $_ -match "^${h}:" })
    Write-Host ("  {0,-30} {1}" -f $h, $(if ($line) { 'present' } else { 'absent' }))
}

Section 'API compression'
$plain = curl.exe -s -o NUL -w '%{size_download}' "$api/api/air-quality?latitude=28.65&longitude=77.23" 2>&1
$gzip = curl.exe -s -o NUL -w '%{size_download}' -H 'Accept-Encoding: gzip' "$api/api/air-quality?latitude=28.65&longitude=77.23" 2>&1
Write-Host ("  uncompressed bytes             {0}" -f $plain)
Write-Host ("  with Accept-Encoding: gzip     {0}" -f $gzip)
Write-Host ("  compression active             {0}" -f ([int]$gzip -lt [int]$plain))

Section 'TLS and transport'
$tls = curl.exe -s -o NUL -w 'tls %{ssl_verify_result} http %{http_version}' "$api/health" 2>&1
Write-Host ("  $tls")
$redirect = curl.exe -s -o NUL -w '%{http_code}' "http://$($site.Replace('https://',''))" 2>&1
Write-Host ("  http to https redirect         {0}" -f $redirect)

Section 'Rate limiting headers'
$rl = curl.exe -s -D - -o NUL "$api/api/auth/me" 2>&1 | Out-String
foreach ($h in @('ratelimit-limit', 'ratelimit-remaining', 'ratelimit-policy')) {
    $line = ($rl -split "`n" | Where-Object { $_ -match "^${h}" })
    Write-Host ("  {0,-30} {1}" -f $h, $(if ($line) { $line.Trim() } else { 'absent' }))
}

Section 'Information disclosure'
$notFound = curl.exe -s "$api/api/does-not-exist" 2>&1 | Out-String
Write-Host ("  404 body leaks stack trace     {0}" -f ($notFound -match 'at \S+:\d+'))
Write-Host ("  404 body                       {0}" -f $notFound.Trim())

Section 'API reachable through CloudFront (same-site path)'
# The page and the API must be one site, or the browser will not attach the
# SameSite=Lax session cookie to the page's fetch and a signed-in user looks
# signed out. This checks the /api behaviour is wired and routing to App
# Runner, rather than S3 answering with the SPA shell.
$viaCf = curl.exe -s -o NUL -w '%{http_code}' "$site/api/air-quality?latitude=28.65&longitude=77.23" 2>&1
Write-Host ("  GET {0}/api/air-quality -> {1}" -f $site, $viaCf)
if ("$viaCf" -eq '200') {
    Write-Host '  PASS  the API answers on the site origin' -ForegroundColor Green
}
else {
    Write-Host '  FAIL  /api is not proxied. Redeploy 05-frontend.yaml with ApiOrigin set.' -ForegroundColor Red
}

$cfType = curl.exe -s -D - -o NUL "$site/api/air-quality?latitude=28.65&longitude=77.23" 2>&1 | Out-String
if ($cfType -match 'content-type:\s*application/json') {
    Write-Host '  PASS  JSON, so this is App Runner and not the SPA fallback' -ForegroundColor Green
}
else {
    Write-Host '  FAIL  not JSON. S3 is probably answering this path.' -ForegroundColor Red
}

Section 'What this script cannot check'
Write-Host '  curl ignores SameSite entirely, so a passing cookie flow here does'
Write-Host '  not prove sign-in works in a browser. Open the site and sign in.'
Write-Host '  Real-device and screen-reader behaviour also need a person.'
