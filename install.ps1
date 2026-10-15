# Installiert token-stats für Claude Code auf diesem Windows-Gerät:
# kopiert das Plugin nach <ClaudeDir>\mods\token-stats und trägt den Ordner
# in <ClaudeDir>\settings.json unter env.CLAUDE_CODE_PLUGIN_DIRS ein.
#
#   powershell -ExecutionPolicy Bypass -File .\install.ps1
#   powershell -ExecutionPolicy Bypass -File .\install.ps1 -ClaudeDir D:\test\.claude

param(
  [string]$ClaudeDir = $(if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $env:USERPROFILE ".claude" })
)

$ErrorActionPreference = "Stop"
$source = $PSScriptRoot
$target = Join-Path $ClaudeDir "mods\token-stats"
$settingsPath = Join-Path $ClaudeDir "settings.json"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Warning "Node.js wurde nicht gefunden. Das Plugin braucht 'node' im PATH (https://nodejs.org)."
}

# 1. Plugin kopieren (ohne die vom Engine erzeugten Typen)
New-Item -ItemType Directory -Force -Path $target | Out-Null
foreach ($item in @(".claude-plugin", "hooks", "scripts", "types", "tests", "README.md")) {
  $from = Join-Path $source $item
  if (Test-Path $from) { Copy-Item -Path $from -Destination $target -Recurse -Force }
}
$generated = Join-Path $target ".claude-plugin\types"
if (Test-Path $generated) { Remove-Item -Recurse -Force $generated }
Write-Host "Plugin kopiert nach $target"

# 2. settings.json ergänzen
if (Test-Path $settingsPath) {
  Copy-Item $settingsPath "$settingsPath.bak" -Force
  $raw = Get-Content $settingsPath -Raw -Encoding UTF8
  $settings = if ($raw.Trim()) { $raw | ConvertFrom-Json } else { New-Object PSObject }
} else {
  New-Item -ItemType Directory -Force -Path $ClaudeDir | Out-Null
  $settings = New-Object PSObject
}

if (-not ($settings.PSObject.Properties.Name -contains "env")) {
  $settings | Add-Member -NotePropertyName env -NotePropertyValue (New-Object PSObject)
}
$current = $null
if ($settings.env.PSObject.Properties.Name -contains "CLAUDE_CODE_PLUGIN_DIRS") {
  $current = $settings.env.CLAUDE_CODE_PLUGIN_DIRS
}
$dirs = @()
if ($current) { $dirs = @($current -split ";" | Where-Object { $_ -ne "" }) }
if ($dirs -notcontains $target) { $dirs += $target }
$value = $dirs -join ";"
if ($settings.env.PSObject.Properties.Name -contains "CLAUDE_CODE_PLUGIN_DIRS") {
  $settings.env.CLAUDE_CODE_PLUGIN_DIRS = $value
} else {
  $settings.env | Add-Member -NotePropertyName CLAUDE_CODE_PLUGIN_DIRS -NotePropertyValue $value
}

# UTF-8 ohne BOM, wie Claude Code es schreibt
$json = $settings | ConvertTo-Json -Depth 64
[System.IO.File]::WriteAllText($settingsPath, $json, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "settings.json: env.CLAUDE_CODE_PLUGIN_DIRS = $value"
Write-Host "Fertig. Claude-Desktop-App neu starten bzw. neue Session öffnen; dann /tokens."
