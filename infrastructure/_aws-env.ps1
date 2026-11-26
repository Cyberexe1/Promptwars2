<#
    Shared AWS credential loader for the scripts in this directory.

    Why this file exists: eight scripts each carried their own near-identical
    copy of this block, and the copies drifted. Most of them skipped the
    existence check (so a missing .env surfaced later as an opaque AWS error),
    dropped AWS_SESSION_TOKEN (so temporary and SSO credentials never worked),
    and hardcoded us-east-1 instead of honouring AWS_REGION. Fixing any of
    those meant editing eight places, and in practice it was never done in all
    eight. The correct behaviour now lives here once.

    Usage, from any script in this directory:

        . (Join-Path $PSScriptRoot '_aws-env.ps1')

    It must be dot-sourced, not run: it sets $env:AWS_* for the AWS CLI in the
    caller's session, and leaves $region in the caller's scope for scripts that
    pass --region explicitly. $PSScriptRoot resolves to this file's directory,
    so the .env path is correct no matter where the caller was invoked from.

    backend/.env uses the non-standard key names AWS_access_key and
    AWS_Secret_key. The standard AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY
    names take precedence when present. Secret values are never printed.
#>

# The .env lives in backend/ at the repo root, which is the parent of this
# directory. Resolving against this directory alone pointed at
# infrastructure/backend/.env, which does not exist.
$envFile = Join-Path (Split-Path $PSScriptRoot -Parent) 'backend\.env'

if (-not (Test-Path $envFile)) {
    Write-Host "AWS credentials not loaded: no env file at $envFile"
    exit 1
}

$values = @{}
foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
        $values[$Matches[1]] = $Matches[2].Trim().Trim('"').Trim("'")
    }
}

$accessKey = if ($values['AWS_ACCESS_KEY_ID']) { $values['AWS_ACCESS_KEY_ID'] } else { $values['AWS_access_key'] }
$secretKey = if ($values['AWS_SECRET_ACCESS_KEY']) { $values['AWS_SECRET_ACCESS_KEY'] } else { $values['AWS_Secret_key'] }
$region = if ($values['AWS_REGION']) { $values['AWS_REGION'] } else { 'us-east-1' }

if (-not $accessKey -or -not $secretKey) {
    Write-Host "AWS credentials not loaded: no access key or secret key in $envFile"
    Write-Host '  expected AWS_ACCESS_KEY_ID / AWS_access_key and AWS_SECRET_ACCESS_KEY / AWS_Secret_key'
    exit 1
}

$env:AWS_ACCESS_KEY_ID = $accessKey
$env:AWS_SECRET_ACCESS_KEY = $secretKey
$env:AWS_DEFAULT_REGION = $region
# Forwarded only when present: an empty AWS_SESSION_TOKEN makes the CLI reject
# otherwise valid long-lived keys.
if ($values['AWS_SESSION_TOKEN']) { $env:AWS_SESSION_TOKEN = $values['AWS_SESSION_TOKEN'] }
