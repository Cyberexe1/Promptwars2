$ErrorActionPreference = 'Continue'
$env:AWS_PAGER = ''
$blockers = @()

function Show($label, $value) { Write-Output ("{0,-26} {1}" -f $label, $value) }

Write-Output '=== AWS access ==='
$identity = aws sts get-caller-identity --query 'Account' --output text 2>&1
if ($LASTEXITCODE -eq 0 -and $identity -notmatch 'error') {
    Show 'account' $identity
    Show 'region' (aws configure get region 2>&1)
}
else {
    Show 'account' 'UNAVAILABLE'
    $first = ($identity | Out-String).Trim() -split "`n" | Select-Object -Last 1
    Show 'reason' $first.Trim()
    $blockers += 'AWS credentials are not usable'
}

Write-Output ''
Write-Output '=== App Runner eligibility ==='
$ar = aws apprunner list-services --region us-east-1 --output text 2>&1
if ($LASTEXITCODE -eq 0) {
    Show 'app runner' 'available to this account'
}
else {
    $msg = ($ar | Out-String).Trim() -split "`n" | Select-Object -Last 1
    Show 'app runner' 'could not confirm'
    Show 'reason' $msg.Trim()
    $blockers += 'App Runner eligibility unconfirmed'
}

Write-Output ''
Write-Output '=== Local tooling ==='
$dockerVersion = docker info --format '{{.ServerVersion}}' 2>&1
if ($LASTEXITCODE -eq 0) { Show 'docker daemon' $dockerVersion }
else { Show 'docker daemon' 'NOT RUNNING'; $blockers += 'Docker daemon is not running' }

Show 'aws cli' ((aws --version 2>&1) -split ' ' | Select-Object -First 1)
Show 'node' (node --version)

Write-Output ''
Write-Output '=== Repository ==='
$dirty = git status --porcelain
Show 'uncommitted files' (($dirty | Measure-Object -Line).Lines)
Show 'branch' (git rev-parse --abbrev-ref HEAD)
$local = git rev-parse HEAD
$remote = git rev-parse '@{u}' 2>$null
Show 'in sync with origin' ($(if ($local -eq $remote) { 'yes' } else { 'no' }))

Write-Output ''
Write-Output '=== Blockers ==='
if ($blockers.Count -eq 0) { Write-Output 'none' }
else { $blockers | ForEach-Object { Write-Output "- $_" } }
