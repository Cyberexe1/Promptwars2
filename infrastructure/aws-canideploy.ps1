<#
    Final check: attempts the exact non-mutating calls that gate each step of
    the deployment. Creates nothing.

    If a step shows DENIED, that step of the deployment cannot run, and no
    template change will alter that.
#>
$ErrorActionPreference = 'Continue'
$env:AWS_PAGER = ''

$infra = $PSScriptRoot
$envFile = Join-Path (Split-Path $infra -Parent) 'backend\.env'
$values = @{}
foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
        $values[$Matches[1]] = $Matches[2].Trim().Trim('"').Trim("'")
    }
}
$env:AWS_ACCESS_KEY_ID = if ($values['AWS_ACCESS_KEY_ID']) { $values['AWS_ACCESS_KEY_ID'] } else { $values['AWS_access_key'] }
$env:AWS_SECRET_ACCESS_KEY = if ($values['AWS_SECRET_ACCESS_KEY']) { $values['AWS_SECRET_ACCESS_KEY'] } else { $values['AWS_Secret_key'] }
$env:AWS_DEFAULT_REGION = 'us-east-1'

# Write-Host, not Write-Output: inside a function Write-Output becomes part of
# the return value, which would make every result a truthy array.
function Try-Call($label, $gate, [scriptblock]$call) {
    $output = (& $call 2>&1 | Out-String)
    if ($LASTEXITCODE -eq 0) {
        Write-Host ("{0,-32} ALLOWED  {1}" -f $label, $gate)
        return $true
    }
    $reason = if ($output -match 'not authorized|AccessDenied|explicit deny') { 'DENIED ' } else { 'FAILED ' }
    Write-Host ("{0,-32} {1}  {2}" -f $label, $reason, $gate)
    return $false
}

Write-Output 'Backend on App Runner'
Write-Output '---------------------'
$cfn = Try-Call 'cloudformation:ValidateTemplate' 'deploying any stack' {
    aws cloudformation validate-template --template-body (Get-Content (Join-Path $infra '02-ecr.yaml') -Raw)
}
$ecrAuth = Try-Call 'ecr:GetAuthorizationToken' 'docker login to push' {
    aws ecr get-login-password --region us-east-1
}
$ecrList = Try-Call 'ecr:DescribeRepositories' 'creating the image repo' {
    aws ecr describe-repositories --region us-east-1
}
$apprunner = Try-Call 'apprunner:ListServices' 'creating the service' {
    aws apprunner list-services --region us-east-1
}

Write-Output ''
Write-Output 'Frontend on CloudFront'
Write-Output '----------------------'
$cf = Try-Call 'cloudfront:ListDistributions' 'creating the distribution' {
    aws cloudfront list-distributions
}
$s3 = Try-Call 's3:ListAllMyBuckets' 'the origin bucket' {
    aws s3api list-buckets
}

Write-Output ''
Write-Output 'Verdict'
Write-Output '-------'
if ($cfn -and $ecrAuth -and $ecrList -and $apprunner) {
    Write-Output 'Backend  : can deploy'
}
else {
    Write-Output 'Backend  : CANNOT deploy. App Runner needs an image in ECR, and'
    Write-Output '           the stack needs CloudFormation.'
}
if ($cf -and $s3) {
    Write-Output 'Frontend : can deploy'
}
else {
    Write-Output 'Frontend : CANNOT deploy. A CloudFront distribution cannot be'
    Write-Output '           created without cloudfront permissions.'
}
Write-Output ''
Write-Output 'Fix: attach infrastructure/deploy-policy.json with an admin identity.'
