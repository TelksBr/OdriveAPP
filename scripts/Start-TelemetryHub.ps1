#Requires -Version 5.1
param(
  [int]$Port = 8765,
  [string]$SerialPort = 'COM6',
  [switch]$AllowFirewall,
  [switch]$RegisterUrlAcl,
  [switch]$GameMode,
  [switch]$Build
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

function Test-Command($name) {
  return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

$hubExe = Join-Path $repoRoot 'dist\wheelforge-hub.exe'

if ($Build -or -not (Test-Path $hubExe)) {
  if (-not (Test-Command go)) {
    Write-Error 'Go is not on PATH. Install from https://go.dev/dl/ and retry, or run scripts/Build-TelemetryHub.ps1 after installing Go.'
  }
  & (Join-Path $PSScriptRoot 'Build-TelemetryHub.ps1')
}

if (-not (Test-Path $hubExe)) {
  Write-Error "Hub binary not found at $hubExe"
}

if ($RegisterUrlAcl) {
  $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
  $url = "http://+:$Port/"
  Write-Host "Registering URL ACL for $url as $identity (admin required once)"
  netsh http add urlacl url=$url user=$identity | Out-Null
}

if ($AllowFirewall) {
  $ruleName = "WheelForge Telemetry Hub $Port"
  if (-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
    Write-Host "Adding firewall rule for TCP $Port"
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port | Out-Null
  }
}

$hostname = [System.Net.Dns]::GetHostName()
Write-Host ''
Write-Host 'Starting WheelForge Telemetry Hub (Go)…' -ForegroundColor Cyan
Write-Host "  Binary:  $hubExe"
Write-Host "  Local:   http://localhost:$Port/overlay/"
Write-Host "  LAN:     http://${hostname}:$Port/overlay/"
Write-Host "  Health:  http://localhost:$Port/health"
Write-Host "  UDP:     127.0.0.1:45890"
Write-Host "  WS:      ws://127.0.0.1:$Port/live"
if ($GameMode) {
  Write-Host "  Mode:    serial-only (HID free for games)" -ForegroundColor Yellow
}
Write-Host ''

$hubArgs = @('--port', $Port)
if ($GameMode) {
  $hubArgs += @('--serial-only', '--serial', $SerialPort, '--chart-hz', '60')
} else {
  $hubArgs += @('--chart-hz', '60')
}
& $hubExe @hubArgs
