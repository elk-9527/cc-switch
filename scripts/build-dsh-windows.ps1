param(
    [switch]$SkipBuild,
    [string]$DshConfigDirectory = $env:DSH_HOME
)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskOutput = Join-Path $taskRoot 'release\dsh-desktop'
$taskTarget = if ($env:CARGO_TARGET_DIR) { $env:CARGO_TARGET_DIR } else { Join-Path $taskRoot 'src-tauri\target' }
if (-not [IO.Path]::IsPathRooted($taskTarget)) { $taskTarget = Join-Path $taskRoot $taskTarget }
$taskExecutable = Join-Path $taskTarget 'release\cc-switch.exe'
if (-not $SkipBuild) {
    Push-Location $taskRoot
    try {
        & pnpm.cmd tauri build --no-bundle --config src-tauri/tauri.dsh.conf.json
        if ($LASTEXITCODE -ne 0) { throw 'Windows build failed' }
    } finally { Pop-Location }
}
if (-not (Test-Path -LiteralPath $taskExecutable -PathType Leaf)) { throw 'Release executable is missing' }
$taskMarker = Join-Path $taskOutput '.dsh-build-owned'
if ((Test-Path -LiteralPath $taskOutput) -and
    (-not (Test-Path -LiteralPath $taskMarker) -or
     (Get-Content -LiteralPath $taskMarker -Raw).Trim() -ne 'cc-switch-dsh-desktop')) {
    throw 'Output directory is not owned by this packaging script'
}
New-Item -ItemType Directory -Force $taskOutput,(Join-Path $taskOutput 'bin'),(Join-Path $taskOutput 'data\.cc-switch') | Out-Null
Set-Content -LiteralPath $taskMarker -Value 'cc-switch-dsh-desktop' -Encoding ascii
Copy-Item -LiteralPath $taskExecutable -Destination (Join-Path $taskOutput 'bin\cc-switch.exe')
Set-Content -LiteralPath (Join-Path $taskOutput 'bin\portable.ini') -Value '[portable]' -Encoding ascii

# This isolated CC Switch profile starts with DSH Desktop. Native files are
# written only when the user explicitly manages a provider, MCP, skill or prompt.
if (-not $DshConfigDirectory) { $DshConfigDirectory = Join-Path $env:USERPROFILE '.dsh' }
$taskSettingsFile = Join-Path $taskOutput 'data\.cc-switch\settings.json'
if (-not (Test-Path -LiteralPath $taskSettingsFile)) {
    $taskVisible = @{}
    foreach ($taskApp in @('claude','claude-desktop','codex','gemini','grokbuild','opencode','openclaw','hermes','pi','mcode','kimi','dsh','agy','omp')) {
        $taskVisible[$taskApp] = $taskApp -eq 'dsh'
    }
    $taskSettings = @{
        dshConfigDir = $DshConfigDirectory
        dshProfile = 'desktop'
        language = 'zh'
        visibleApps = $taskVisible
        firstRunNoticeConfirmed = $true
        newLayoutNoticeConfirmed = $true
        showInTray = $false
        minimizeToTrayOnClose = $false
    }
    [IO.File]::WriteAllText($taskSettingsFile, ($taskSettings | ConvertTo-Json -Depth 5))
}
$taskLauncher = @'
@echo off
setlocal
set "CC_SWITCH_TEST_HOME=%~dp0data"
set "WEBVIEW2_USER_DATA_FOLDER=%~dp0data\webview"
if not defined DSH_HOME set "DSH_HOME=%USERPROFILE%\.dsh"
start "" /D "%~dp0" "%~dp0bin\cc-switch.exe"
'@
[IO.File]::WriteAllText((Join-Path $taskOutput 'Start-DSH.cmd'), ($taskLauncher -replace '\r?\n', "`r`n"), [Text.Encoding]::ASCII)
$taskReadme = @'
# CC Switch DSH Desktop

Launch `Start-DSH.cmd`. Keep the entire folder together.

This build uses a separate application identity and stores CC Switch settings,
database, backups and WebView cache in `data/`. The existing CC Switch installation
is not replaced. DSH Desktop is selected initially; its data directory can be
changed under Settings > App configuration > DeepSeek Harness.

Native DSH configuration is shared with DSH itself. Provider/MCP changes create
recoverable snapshots. Models are selected in DSH's native menu. Reachability
checks do not prove that an API key or model inference works.

Keep `data/` private: it can contain credentials and backups. To move this package
to another machine, check its configured DSH directory before editing anything.
Do not launch `bin/cc-switch.exe` directly: the launcher supplies the isolated
data paths. Use this script again to update the executable; existing data is kept.
'@
[IO.File]::WriteAllText((Join-Path $taskOutput 'README.md'), $taskReadme)
$taskHash = (Get-FileHash -LiteralPath (Join-Path $taskOutput 'bin\cc-switch.exe') -Algorithm SHA256).Hash
Set-Content -LiteralPath (Join-Path $taskOutput 'SHA256SUMS.txt') -Value "$taskHash  bin/cc-switch.exe" -Encoding ascii
Write-Output "Package: $taskOutput"
Write-Output "SHA256: $taskHash"
