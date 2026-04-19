param(
  [switch]$DryRun,
  [switch]$SkipFd
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "../../../..")
$softwareRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$recommendedExtensionsPath = Join-Path $repoRoot ".vscode/extensions.json"

function Test-ToolAvailable {
  param([string]$CommandName)

  return $null -ne (Get-Command $CommandName -ErrorAction SilentlyContinue)
}

function Get-VsCodeCliCommand {
  if ($IsWindows -and (Test-ToolAvailable "code.cmd")) {
    return "code.cmd"
  }

  if (Test-ToolAvailable "code") {
    return "code"
  }

  return $null
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
    throw "$DisplayName was installed but is still not visible in this shell. Open a new terminal and rerun vp run developer:setup-machine."
  }

  Write-Host "$DisplayName is ready."
}

function Get-MarketplaceUrl {
  param([string]$ExtensionId)

  return "https://marketplace.visualstudio.com/items?itemName=$ExtensionId"
}

function Get-RecommendedVsCodeExtensions {
  if (-not (Test-Path $recommendedExtensionsPath)) {
    return @()
  }

  try {
    $config = Get-Content -Raw -Path $recommendedExtensionsPath | ConvertFrom-Json

    if ($config.recommendations -is [System.Array]) {
      return @($config.recommendations | Where-Object { $_ -is [string] -and $_.Trim().Length -gt 0 })
    }

    if ($config.recommendations -is [string] -and $config.recommendations.Trim().Length -gt 0) {
      return @($config.recommendations)
    }
  }
  catch {
    Write-Warning "Could not read recommended VS Code extensions from $recommendedExtensionsPath."
  }

  return @()
}

function Write-ExtensionInstallFallback {
  param(
    [string]$ExtensionId,
    [string]$VsCodeCliCommand = "code"
  )

  Write-Host "Install from a terminal: $VsCodeCliCommand --install-extension $ExtensionId"
  Write-Host "Marketplace: $(Get-MarketplaceUrl -ExtensionId $ExtensionId)"
}

function Ensure-RecommendedVsCodeExtensions {
  $recommendedExtensions = Get-RecommendedVsCodeExtensions

  if ($recommendedExtensions.Count -eq 0) {
    return
  }

  $vsCodeCliCommand = Get-VsCodeCliCommand

  if ($null -eq $vsCodeCliCommand) {
    Write-Warning "VS Code CLI 'code' is not available, so recommended extensions could not be checked or installed."

    foreach ($extensionId in $recommendedExtensions) {
      Write-ExtensionInstallFallback -ExtensionId $extensionId
    }

    return
  }

  $installedExtensions = & $vsCodeCliCommand --list-extensions

  if ($LASTEXITCODE -ne 0) {
    Write-Warning "VS Code CLI could not list installed extensions, so recommended extensions could not be verified."

    foreach ($extensionId in $recommendedExtensions) {
      Write-ExtensionInstallFallback -ExtensionId $extensionId -VsCodeCliCommand $vsCodeCliCommand
    }

    return
  }

  $installedExtensionSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)

  foreach ($installedExtension in $installedExtensions) {
    $trimmedExtension = $installedExtension.Trim()

    if ($trimmedExtension.Length -gt 0) {
      [void]$installedExtensionSet.Add($trimmedExtension)
    }
  }

  foreach ($extensionId in $recommendedExtensions) {
    if ($installedExtensionSet.Contains($extensionId)) {
      Write-Host "VS Code extension $extensionId is already installed."
      continue
    }

    $installCommand = "$vsCodeCliCommand --install-extension $extensionId"

    if ($DryRun) {
      Write-Host "[dry-run] $installCommand"
      continue
    }

    Write-Host "Installing VS Code extension $extensionId..."
  & $vsCodeCliCommand --install-extension $extensionId

    if ($LASTEXITCODE -eq 0) {
      Write-Host "VS Code extension $extensionId is ready."
      continue
    }

    Write-Warning "Could not install VS Code extension $extensionId automatically."
    Write-ExtensionInstallFallback -ExtensionId $extensionId -VsCodeCliCommand $vsCodeCliCommand
  }
}

function Install-WorkspaceDependencies {
  if (-not (Test-ToolAvailable "vp")) {
    Write-Warning "Vite Plus CLI 'vp' is not available, so workspace dependencies could not be installed automatically. Run 'vp install' from Documents/technical/Software after opening a shell with vp on PATH."
    return
  }

  $command = "vp install"

  if ($DryRun) {
    Write-Host "[dry-run] $command"
    return
  }

  Write-Host "Installing workspace dependencies with Vite Plus..."

  Push-Location $softwareRoot

  try {
    & vp install

    if ($LASTEXITCODE -ne 0) {
      throw "Workspace dependency install failed with status $LASTEXITCODE."
    }
  }
  finally {
    Pop-Location
  }

  Write-Host "Workspace dependencies are ready."
}

Ensure-Tool -DisplayName "ripgrep" -CommandName "rg" -WingetId "BurntSushi.ripgrep.MSVC" -ChocolateyName "ripgrep" -ScoopName "ripgrep"

if (-not $SkipFd) {
  Ensure-Tool -DisplayName "fd" -CommandName "fd" -WingetId "sharkdp.fd" -ChocolateyName "fd" -ScoopName "fd"
}

Install-WorkspaceDependencies
Ensure-RecommendedVsCodeExtensions

if ($DryRun) {
  Write-Host "Dry run complete."
  exit 0
}

Write-Host "Machine setup is complete. Rerun vp run developer:setup-machine any time to bring tools, dependencies, and recommended VS Code extensions back up to date."