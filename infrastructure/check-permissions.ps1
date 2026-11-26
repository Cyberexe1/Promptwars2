$ErrorActionPreference = 'Continue'
$env:AWS_PAGER = ''
. (Join-Path $PSScriptRoot '_aws-env.ps1')

$checks = @(
    @{ n = 'ecr:GetAuthorizationToken'; c = { aws ecr get-authorization-token --query 'authorizationData[0].expiresAt' --output text } },
    @{ n = 'ecr:DescribeRepositories'; c = { aws ecr describe-repositories --repository-names smogwise-api --query 'repositories[0].repositoryUri' --output text --region $region } },
    @{ n = 'ecr:DescribeImages'; c = { aws ecr describe-images --repository-name smogwise-api --query 'imageDetails[0].imagePushedAt' --output text --region $region } },
    @{ n = 'apprunner:DescribeService'; c = { aws apprunner list-services --query 'ServiceSummaryList[0].ServiceName' --output text --region $region } },
    @{ n = 'cloudfront:ListFunctions'; c = { aws cloudfront list-functions --query 'FunctionList.Quantity' --output text } },
    @{ n = 'cloudformation:DescribeStackEvents'; c = { aws cloudformation describe-stack-events --stack-name smogwise-frontend --max-items 1 --query 'StackEvents[0].ResourceStatus' --output text --region $region } }
)

foreach ($check in $checks) {
    $out = & $check.c 2>&1 | Out-String
    if ($out -match 'AccessDenied|not authorized') {
        Write-Host ("  DENIED   {0}" -f $check.n) -ForegroundColor Red
    }
    else {
        Write-Host ("  allowed  {0}  {1}" -f $check.n, $out.Trim()) -ForegroundColor Green
    }
}
