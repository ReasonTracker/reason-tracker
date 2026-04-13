param(
  [switch]$DryRun,
  [switch]$SkipFd
)

$ErrorActionPreference = "Stop"

function Test-ToolAvailable {
  param([string]$CommandName)

  return $null -ne (Get-Command $CommandName -ErrorAction SilentlyContinue)
}

function Update-SessionPath {
  $machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
  $userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$machinePath;$userPath"
}

function Get-InstallerName {
  if (Test-ToolAvailable "winget") {
    return "winget"
  }

  if (Test-ToolAvailable "choco") {
    return "choco"
  }

  if (Test-ToolAvailable "scoop") {
    return "scoop"
  }

  throw "No supported package manager was found. Install winget, Chocolatey, or Scoop first."
}

function Invoke-InstallCommand {
  param(
    [string]$InstallerName,
    [string]$ToolName,
    [string]$WingetId,
    [string]$ChocolateyName,
    [string]$ScoopName
  )

  switch ($InstallerName) {
    "winget" {
      $command = "winget install --id $WingetId --exact --accept-package-agreements --accept-source-agreements"
      break
    }
    "choco" {
      $command = "choco install $ChocolateyName -y"
      break
    }
    "scoop" {
      $command = "scoop install $ScoopName"
      break
    }
    default {
      throw "Unsupported installer: $InstallerName"
    }
  }

  if ($DryRun) {
    Write-Host "[dry-run] $command"
    return
  }

  Write-Host "Installing $ToolName with $InstallerName..."
  Invoke-Expression $command
}

function Ensure-Tool {
  param(
    [string]$DisplayName,
    [string]$CommandName,
    [string]$WingetId,
    [string]$ChocolateyName,
    [string]$ScoopName
  )

  if (Test-ToolAvailable $CommandName) {
    Write-Host "$DisplayName is already available."
    return
  }

  $installerName = Get-InstallerName
  Invoke-InstallCommand -InstallerName $installerName -ToolName $DisplayName -WingetId $WingetId -ChocolateyName $ChocolateyName -ScoopName $ScoopName

  if ($DryRun) {
    return
  }

  Update-SessionPath

  if (-not (Test-ToolAvailable $CommandName)) {
    throw "$DisplayName was installed but is still not visible in this shell. Open a new terminal and rerun vp run developer:doctor."
  }

  Write-Host "$DisplayName is ready."
}

Ensure-Tool -DisplayName "ripgrep" -CommandName "rg" -WingetId "BurntSushi.ripgrep.MSVC" -ChocolateyName "ripgrep" -ScoopName "ripgrep"

if (-not $SkipFd) {
  Ensure-Tool -DisplayName "fd" -CommandName "fd" -WingetId "sharkdp.fd" -ChocolateyName "fd" -ScoopName "fd"
}

if ($DryRun) {
  Write-Host "Dry run complete."
  exit 0
}

Write-Host "Machine tooling is ready. Run vp run developer:doctor to verify the current shell."