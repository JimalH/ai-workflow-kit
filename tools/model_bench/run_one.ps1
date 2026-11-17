# Run the benchmark task once with one tool, model and reasoning effort.
# Each run gets its own folder; time, exit code and the tool's raw output go to the round's logs.
param(
  [Parameter(Mandatory)] [string]$Name,                                   # e.g. codex-terra
  [Parameter(Mandatory)] [ValidateSet('claude','codex','dsh')] [string]$Tool,
  [Parameter(Mandatory)] [string]$Model,
  [Parameter(Mandatory)] [string]$Effort,                                 # the tool's own level name
  [string]$Round = 'round1',
  [string]$Work = (Join-Path $PSScriptRoot 'work'),                       # not committed
  [string]$CondaEnv = 'model-bench',                                      # one env for every run
  [string]$Prompt = 'Read TASK.md in the current directory and complete the task it describes.'
)
$ErrorActionPreference = 'Stop'
$runDir = Join-Path $Work "$Round\runs\$Name"
$logs = Join-Path $Work "$Round\logs"
$patches = Join-Path $Work 'patches'
New-Item -ItemType Directory -Force $runDir, $logs, $patches | Out-Null
Copy-Item (Join-Path $PSScriptRoot 'TASK.md') $runDir -Force

# Put the shared conda env first on PATH, so `python` is the same for every tool.
$prefix = "$(& conda run -n $CondaEnv python -c "import sys; print(sys.prefix)" 2>$null | Where-Object { "$_".Trim() } | Select-Object -Last 1)".Trim()
if (-not $prefix -or -not (Test-Path $prefix)) { throw "conda env '$CondaEnv' not found; the Coordinator creates it first (see README)" }
$env:PATH = "$prefix;$prefix\Scripts;$env:PATH"
$env:PYTHONDONTWRITEBYTECODE = '1'

Set-Location $runDir
$out = Join-Path $logs "$Name.out"
$err = Join-Path $logs "$Name.err"
$ErrorActionPreference = 'Continue'
$start = Get-Date
switch ($Tool) {
  'claude' {
    $null | & claude -p $Prompt --model $Model --effort $Effort --output-format json --permission-mode acceptEdits `
      --allowedTools 'Read' 'Write' 'Edit' 'Glob' 'Grep' 'Bash(python:*)' 'Bash(py:*)' 'PowerShell(python:*)' 'PowerShell(py:*)' `
      > $out 2> $err
  }
  'codex' {
    $null | & codex exec --json -m $Model -s workspace-write -c approval_policy=never -c "model_reasoning_effort=$Effort" `
      --skip-git-repo-check $Prompt > $out 2> $err
  }
  'dsh' {
    $patch = Join-Path $patches "$Model-$Effort.yml"
    "- id: agent-default-model`n  config:`n    provider: deepseek-official`n    model: $Model`n    reasoningEffort: $Effort`n" |
      Set-Content $patch -Encoding utf8 -NoNewline
    & dsh headless --patch $patch --json --approval-policy never $Prompt > $out 2> $err
  }
}
$code = $LASTEXITCODE
$end = Get-Date
$sec = [math]::Round(($end - $start).TotalSeconds, 1)
[pscustomobject]@{ name = $Name; tool = $Tool; model = $Model; effort = $Effort; conda_env = $CondaEnv; exit = $code
  start = $start.ToString('o'); end = $end.ToString('o'); seconds = $sec
} | ConvertTo-Json | Set-Content (Join-Path $logs "$Name.meta.json") -Encoding utf8
"$Name exit=$code seconds=$sec"
