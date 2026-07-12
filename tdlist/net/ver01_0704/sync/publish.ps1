# Voka GitHub publish script
# Usage:
#   .\publish.ps1 -Username <user> -Token <pat> -Repo <repo-name> [-CreateRepo] [-EnablePages]

param(
    [Parameter(Mandatory = $true)]
    [string]$Username,

    [Parameter(Mandatory = $true)]
    [string]$Token,

    [Parameter(Mandatory = $false)]
    [string]$Repo = "voka-home",

    [switch]$CreateRepo,
    [switch]$EnablePages
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")).Path
$VerRoot = Join-Path $ProjectRoot "tdlist\net\ver01_0704"
$WorkflowDir = Join-Path $ProjectRoot ".github\workflows"

function Write-Step($msg) { Write-Host ">> $msg" -ForegroundColor Cyan }

function Invoke-GitHubApi {
    param(
        [string]$Method,
        [string]$Uri,
        [hashtable]$Headers,
        [string]$Body = $null
    )

    try {
        if ($Body) {
            return Invoke-RestMethod -Uri $Uri -Headers $Headers -Method $Method -Body $Body
        }
        return Invoke-RestMethod -Uri $Uri -Headers $Headers -Method $Method
    } catch {
        $statusCode = $null
        $detail = $_.Exception.Message
        $response = $_.Exception.Response
        if ($response) {
            $statusCode = [int]$response.StatusCode
            try {
                $stream = $response.GetResponseStream()
                if ($stream) {
                    $reader = New-Object System.IO.StreamReader($stream)
                    $raw = $reader.ReadToEnd()
                    if ($raw) {
                        $parsed = $raw | ConvertFrom-Json
                        if ($parsed.message) {
                            $detail = [string]$parsed.message
                        }
                        if ($parsed.errors) {
                            $errorMessages = @($parsed.errors | ForEach-Object {
                                if ($_.message) { [string]$_.message }
                            } | Where-Object { $_ })
                            if ($errorMessages.Count -gt 0) {
                                $detail = ($errorMessages -join "; ")
                            }
                        }
                    }
                }
            } catch {
                # keep default detail
            }
        }
        return @{
            Error = $true
            StatusCode = $statusCode
            Message = $detail
        }
    }
}

function Test-RepositoryAlreadyExistsMessage {
    param([string]$Message)
    if (-not $Message) { return $false }
    return $Message -match 'already exists|Repository creation failed|name already exists'
}

function Format-NativeCommandOutput {
    param($Output)

    if ($null -eq $Output) {
        return ""
    }

    $lines = @($Output) | ForEach-Object {
        if ($_ -is [System.Management.Automation.ErrorRecord]) {
            $_.ToString()
        } else {
            [string]$_
        }
    }

    return ($lines -join "`n")
}

function Invoke-NativeGit {
    param([string[]]$GitCommandArgs)

    $previousErrorAction = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $output = & git @GitCommandArgs 2>&1
        return @{
            ExitCode = $LASTEXITCODE
            Output = Format-NativeCommandOutput $output
        }
    } finally {
        $ErrorActionPreference = $previousErrorAction
    }
}

function Invoke-Git {
    [CmdletBinding()]
    param(
        [Parameter(ValueFromRemainingArguments = $true)]
        [string[]]$GitCommandArgs
    )

    if (-not $GitCommandArgs -or $GitCommandArgs.Count -eq 0) {
        throw "Invoke-Git requires git arguments"
    }

    $result = Invoke-NativeGit -GitCommandArgs $GitCommandArgs
    if ($result.Output) {
        Write-Host $result.Output
    }
    if ($result.ExitCode -ne 0) {
        throw "git $($GitCommandArgs -join ' ') failed (exit $($result.ExitCode))"
    }
}

function Initialize-GitHttpSettings {
    Write-Step "Tuning git HTTP settings for large/slow uploads ..."
    git config http.version HTTP/1.1
    git config http.postBuffer 524288000
    git config http.lowSpeedLimit 0
    git config http.lowSpeedTime 999999
    if ($env:HTTPS_PROXY) {
        git config http.proxy $env:HTTPS_PROXY
    } elseif ($env:HTTP_PROXY) {
        git config http.proxy $env:HTTP_PROXY
    }
}

function Get-GitCommandOutput {
    param([string[]]$GitCommandArgs)

    $result = Invoke-NativeGit -GitCommandArgs $GitCommandArgs
    return $result.Output
}

function Get-GitPushFailureHint {
    param([string]$Output)

    if ($Output -match 'without `workflow` scope') {
        return "Token is missing the workflow scope. Regenerate a Classic PAT with repo + workflow, or disable GitHub Pages for the first push."
    }
    if ($Output -match 'Could not connect to server|Failed to connect|HTTP 408|timeout') {
        return "Cannot reach GitHub (network timeout). Check VPN/proxy or retry on a stable network."
    }
    if ($Output -match 'remote rejected') {
        return "GitHub rejected the push. See the remote error details below."
    }
    return "Push failed. Check Token scopes (repo + workflow), network, or run git push manually in PowerShell."
}

function Test-GitPushRetryable {
    param([string]$Output)
    if ($Output -match 'without `workflow` scope|remote rejected') {
        return $false
    }
    if ($Output -match 'Could not connect|Failed to connect|Connection was reset|Recv failure|HTTP 408|timeout') {
        return $true
    }
    return $true
}

function Invoke-GitPushWithRetry {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$PushArgs,
        [int]$MaxAttempts = 5
    )

    $lastOutput = ""
    for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
        Write-Step "Pushing to GitHub (attempt $attempt/$MaxAttempts) ..."
        $result = Invoke-NativeGit -GitCommandArgs $PushArgs
        $lastOutput = $result.Output
        if ($result.ExitCode -eq 0) {
            if ($lastOutput) {
                Write-Host $lastOutput
            }
            return
        }

        if ($lastOutput) {
            Write-Host $lastOutput
        }

        if (-not (Test-GitPushRetryable $lastOutput)) {
            break
        }

        if ($attempt -lt $MaxAttempts) {
            $waitSeconds = [Math]::Min(15, 5 * $attempt)
            Write-Step "Push failed, retrying in $waitSeconds seconds ..."
            Start-Sleep -Seconds $waitSeconds
        }
    }

    $hint = Get-GitPushFailureHint $lastOutput
    throw "$hint`n`n$lastOutput"
}

function Unstage-GitHubWorkflowForCommit {
    $workflowPath = ".github/workflows/pages.yml"
    if (-not (Test-Path $workflowPath)) {
        return
    }
    git reset HEAD $workflowPath 2>$null | Out-Null
}

function Remove-WorkflowFromHeadCommitIfNeeded {
    $workflowPath = ".github/workflows/pages.yml"
    $tracked = git ls-files --stage $workflowPath 2>$null
    if (-not $tracked) {
        return
    }

    Write-Step "Removing workflow file from the site commit (will push it separately with workflow scope) ..."
    git rm --cached --force $workflowPath 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        return
    }

    $staged = git diff --cached --name-only
    if (-not $staged) {
        Write-Step "No staged changes left for amend; skipping."
        return
    }

    $amend = Invoke-NativeGit -GitCommandArgs @("commit", "--amend", "--no-edit")
    if ($amend.ExitCode -eq 0) {
        return
    }

    if ($amend.Output -match 'would make it empty') {
        Write-Step "Workflow-only commit detected; rolling back so site and workflow can push separately."
        $reset = Invoke-NativeGit -GitCommandArgs @("reset", "--soft", "HEAD^")
        if ($reset.ExitCode -ne 0) {
            throw "git reset --soft HEAD^ failed: $($reset.Output)"
        }
        git reset HEAD $workflowPath 2>$null | Out-Null
        return
    }

    throw "git commit --amend failed: $($amend.Output)"
}

if ($CreateRepo) {
    Write-Step "Checking/creating repository $Username/$Repo ..."
    $headers = @{
        Authorization = "Bearer $Token"
        Accept        = "application/vnd.github+json"
        "X-GitHub-Api-Version" = "2022-11-28"
    }

    $check = Invoke-GitHubApi -Method Get -Uri "https://api.github.com/repos/$Username/$Repo" -Headers $headers
    if ($check.Error) {
        if ($check.StatusCode -eq 404) {
            $body = @{
                name        = $Repo
                description = "Voka personal homepage and project hub"
                private     = $false
                auto_init   = $false
            } | ConvertTo-Json
            $created = Invoke-GitHubApi -Method Post -Uri "https://api.github.com/user/repos" -Headers $headers -Body $body
            if ($created.Error) {
                if ($created.StatusCode -eq 422 -and (Test-RepositoryAlreadyExistsMessage $created.Message)) {
                    Write-Step "Repository already exists on GitHub, continuing with push ..."
                } else {
                    throw "Failed to create repository ($($created.StatusCode)): $($created.Message). If the repo already exists, uncheck auto-create and sync again."
                }
            } else {
                Write-Step "Repository created"
            }
        } else {
            throw "GitHub API error ($($check.StatusCode)): $($check.Message)"
        }
    } else {
        Write-Step "Repository already exists, skipping creation"
    }
}

Set-Location $ProjectRoot
if (-not (Test-Path ".git")) {
    Write-Step "Initializing Git repository ..."
    Invoke-Git init
    Invoke-Git branch -M main
}

$BuildAll = Join-Path $VerRoot "sync\build-all.py"
if (Test-Path $BuildAll) {
    Write-Step "Building site from local content (notes, playlist, bundles) ..."
    & python $BuildAll
    if ($LASTEXITCODE -ne 0) {
        throw "build-all.py failed with exit code $LASTEXITCODE"
    }
} else {
    Write-Host "build-all.py not found; skipping pre-publish build." -ForegroundColor Yellow
}

if (-not (Test-Path ".gitignore")) {
    @"
raw_src/neko/
.env
**/.credentials
"@ | Set-Content ".gitignore" -Encoding UTF8
}

$remoteUrl = "https://${Username}:${Token}@github.com/${Username}/${Repo}.git"
$remotes = @(git remote 2>$null)
if ($remotes -contains "origin") {
    Invoke-Git remote set-url origin $remoteUrl
} else {
    Invoke-Git remote add origin $remoteUrl
}

Write-Step "Staging and committing files ..."
Invoke-Git add .
git add -u 2>$null | Out-Null
Unstage-GitHubWorkflowForCommit
$status = git status --porcelain
if ($status) {
    Invoke-Git commit -m "feat: Voka homepage ver01_0704 - site update"
} else {
    Write-Step "No local changes, skipping commit"
}

Remove-WorkflowFromHeadCommitIfNeeded

Initialize-GitHttpSettings
Write-Step "Pushing site to origin/main ..."
Invoke-GitPushWithRetry -PushArgs @("push", "-u", "origin", "main", "--force")

if ($EnablePages) {
    Write-Step "Configuring GitHub Pages (Actions) ..."
    if (-not (Test-Path $WorkflowDir)) {
        New-Item -ItemType Directory -Path $WorkflowDir -Force | Out-Null
    }

    $workflow = @"
name: Deploy Voka Site

on:
  push:
    branches: [main]
    paths:
      - 'tdlist/net/ver01_0704/site/**'
      - '.github/workflows/pages.yml'
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: `${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: tdlist/net/ver01_0704/site
      - id: deployment
        uses: actions/deploy-pages@v4
"@

    $workflow | Set-Content (Join-Path $WorkflowDir "pages.yml") -Encoding UTF8
    Invoke-Git add .github/workflows/pages.yml
    git commit -m "ci: add GitHub Pages workflow for ver01_0704 site" 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
        try {
            Invoke-GitPushWithRetry -PushArgs @("push", "origin", "main") -MaxAttempts 1
        } catch {
            Write-Host ""
            Write-Host "Site code was pushed, but GitHub Pages workflow was not uploaded." -ForegroundColor Yellow
            Write-Host $_.Exception.Message -ForegroundColor Yellow
            Write-Host "Add 'workflow' scope to your Token, then sync again with Pages enabled." -ForegroundColor Yellow
        }
    }

    $ghAvailable = $null -ne (Get-Command gh -ErrorAction SilentlyContinue)
    if ($ghAvailable) {
        $env:GH_TOKEN = $Token
        gh api repos/$Username/$Repo/pages -X POST -f build_type=workflow -f source[branch]=main -f source[path]=/ 2>$null
        Write-Step "Pages configured via gh CLI"
    } else {
        Write-Step "Open repo Settings > Pages and choose Source: GitHub Actions"
    }
}

Invoke-Git remote set-url origin "https://github.com/${Username}/${Repo}.git"

$pagesUrl = if ($Repo -eq "${Username}.github.io") {
    "https://${Username}.github.io/"
} else {
    "https://${Username}.github.io/${Repo}/"
}

Write-Host ""
Write-Host "Publish complete!" -ForegroundColor Green
Write-Host "Repository: https://github.com/$Username/$Repo"
Write-Host "Pages URL (after Actions deploy): $pagesUrl"
Write-Host "If this is the first deploy, confirm Settings > Pages uses GitHub Actions."
