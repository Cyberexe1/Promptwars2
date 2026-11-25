# Confirms per-account login throttling is active on the deployed service.
$ErrorActionPreference = 'Continue'
$api = 'https://yzjmcnk4t4.us-east-1.awsapprunner.com'

$jar = Join-Path $env:TEMP 'vt-cookies.txt'
$body = Join-Path $env:TEMP 'vt-login.json'
Remove-Item $jar -ErrorAction SilentlyContinue

curl.exe -s -o NUL -c $jar "$api/api/auth/me" 2>&1 | Out-Null
$csrfLine = Get-Content $jar | Select-String 'smogwise_csrf'
$csrf = ($csrfLine.Line -split "`t")[-1].Trim()

$target = "throttle$(Get-Random)@example.com"
('{"email":"' + $target + '","password":"wrong password entirely"}') |
    Set-Content $body -Encoding ascii -NoNewline

Write-Host "target account (never registered): $target"
Write-Host ''

for ($i = 1; $i -le 12; $i++) {
    $code = curl.exe -s -o NUL -w '%{http_code}' -b $jar -X POST "$api/api/auth/login" `
        -H 'content-type: application/json' -H "x-csrf-token: $csrf" `
        --data-binary "@$body" 2>&1
    Write-Host ("  attempt {0,-3} -> {1}" -f $i, $code)
    if ($code -eq '429') {
        Write-Host ''
        Write-Host "Throttled after $i attempts. An address that was never"
        Write-Host 'registered is throttled too, so the response cannot be used'
        Write-Host 'to tell which accounts exist.'
        break
    }
}

Remove-Item $jar, $body -ErrorAction SilentlyContinue
