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
