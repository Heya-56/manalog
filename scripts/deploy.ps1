# ManaLog — one-shot deploy to AWS from Windows (PowerShell).
# Prereqs (checked below): Node 20+, AWS CLI v2 logged in (`aws configure`), AWS SAM CLI.
# Usage:  .\scripts\deploy.ps1                 (demo data)
#         .\scripts\deploy.ps1 -IyKey "xxxx"   (live ImportYeti data)
param(
  [string]$IyKey = "",
  [string]$Region = "us-east-1",
  [string]$Model = "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
)
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

function Need($cmd, $hint) { if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { Write-Host "MISSING: $cmd -> $hint" -ForegroundColor Red; exit 1 } }
Need node "https://nodejs.org (LTS)"
Need aws  "MSI: https://awscli.amazonaws.com/AWSCLIV2.msi   then: aws configure"
Need sam  "MSI: https://github.com/aws/aws-sam-cli/releases/latest/download/AWS_SAM_CLI_64_PY3.msi"

Write-Host "1/5 AWS identity" -ForegroundColor Cyan
aws sts get-caller-identity --output table

Write-Host "2/5 Tests" -ForegroundColor Cyan
npm install --no-audit --no-fund
npm test
if ($LASTEXITCODE -ne 0) { throw 'Tests failed' }

Write-Host "3/5 Bedrock model access check ($Model)" -ForegroundColor Cyan
$probe = '{"messages":[{"role":"user","content":[{"text":"ping"}]}],"inferenceConfig":{"maxTokens":5}}'
$probe | Out-File -Encoding ascii "$env:TEMP\ml-probe.json"
aws bedrock-runtime converse --region $Region --model-id $Model --cli-input-json "file://$env:TEMP\ml-probe.json" 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) { Write-Host "Bedrock OK" -ForegroundColor Green; $bedrock = "true" }
else { Write-Host "Bedrock not reachable -> enable model access in the Bedrock console (Model access). Deploying with BedrockEnabled=false for now." -ForegroundColor Yellow; $bedrock = "false" }

Write-Host "4/5 SAM build + deploy" -ForegroundColor Cyan
Set-Location infra
sam build -t template.yaml
if ($LASTEXITCODE -ne 0) { throw 'sam build failed' }
sam deploy --no-confirm-changeset --region $Region --parameter-overrides "BedrockEnabled=$bedrock" "BedrockModelId=$Model" "ImportYetiApiKey=$IyKey" "EnforcePlans=true"
if ($LASTEXITCODE -ne 0) { throw 'sam deploy failed' }

Write-Host "5/5 Smoke test" -ForegroundColor Cyan
$url = aws cloudformation describe-stacks --stack-name manalog --region $Region --query "Stacks[0].Outputs[?OutputKey=='ConsoleUrl'].OutputValue" --output text
Set-Location ..
Invoke-RestMethod "$($url)health" | ConvertTo-Json
node test/e2e-mcp-client.mjs "$($url)mcp" demo-judges-2026
Write-Host "`nConsole : $url`nMCP     : $($url)mcp`nJudges key: demo-judges-2026" -ForegroundColor Green
