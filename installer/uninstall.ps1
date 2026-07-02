[CmdletBinding()]
param(
    [string]$WallpaperEnginePath,
    [string]$BetterNcmDataPath = 'C:\betterncm',
    [switch]$RemoveInfLink,
    [switch]$NonInteractive
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-NormalizedPath([string]$Path) {
    return [IO.Path]::GetFullPath($Path).TrimEnd('\')
}

function Resolve-WallpaperEnginePath([string]$ExplicitPath) {
    if ($ExplicitPath -and (Test-Path -LiteralPath (Join-Path $ExplicitPath 'projects'))) {
        return Get-NormalizedPath $ExplicitPath
    }

    $steamRoots = [Collections.Generic.List[string]]::new()
    foreach ($registryPath in @(
        'HKCU:\Software\Valve\Steam',
        'HKLM:\Software\WOW6432Node\Valve\Steam',
        'HKLM:\Software\Valve\Steam'
    )) {
        $item = Get-ItemProperty -LiteralPath $registryPath -ErrorAction SilentlyContinue
        foreach ($name in @('SteamPath', 'InstallPath')) {
            $property = if ($item) { $item.PSObject.Properties[$name] } else { $null }
            if ($property -and $property.Value) {
                $steamRoots.Add([string]$property.Value)
            }
        }
    }
    foreach ($fallback in @("${env:ProgramFiles(x86)}\Steam", "$env:ProgramFiles\Steam", 'D:\Steam')) {
        if ($fallback) {
            $steamRoots.Add($fallback)
        }
    }

    $libraryRoots = [Collections.Generic.List[string]]::new()
    foreach ($root in @($steamRoots | Select-Object -Unique)) {
        if (-not (Test-Path -LiteralPath $root -PathType Container)) {
            continue
        }
        $libraryRoots.Add($root)
        $vdf = Join-Path $root 'steamapps\libraryfolders.vdf'
        if (Test-Path -LiteralPath $vdf -PathType Leaf) {
            $content = Get-Content -LiteralPath $vdf -Raw -ErrorAction SilentlyContinue
            foreach ($match in [regex]::Matches([string]$content, '"path"\s+"([^"]+)"')) {
                $libraryRoots.Add($match.Groups[1].Value.Replace('\\', '\'))
            }
        }
    }

    foreach ($root in @($libraryRoots | Select-Object -Unique)) {
        $candidate = Join-Path $root 'steamapps\common\wallpaper_engine'
        if (Test-Path -LiteralPath (Join-Path $candidate 'projects')) {
            return Get-NormalizedPath $candidate
        }
    }
    throw '未找到 Wallpaper Engine，请使用 -WallpaperEnginePath 指定目录。'
}

$enginePath = Resolve-WallpaperEnginePath $WallpaperEnginePath
$myProjects = Join-Path $enginePath 'projects\myprojects'
$target = Join-Path $myProjects 'mineradio-wallpaper'
if (Test-Path -LiteralPath $target) {
    $removed = "$target.removed-$(Get-Date -Format 'yyyyMMdd-HHmmss-fff')"
    Move-Item -LiteralPath $target -Destination $removed
    Write-Host "壁纸已移出使用目录，可从此位置恢复：$removed" -ForegroundColor Green
}
else {
    Write-Host '未找到已安装的 Mineradio Wallpaper。'
}

if ($RemoveInfLink) {
    $plugin = Join-Path $BetterNcmDataPath 'plugins\InfLink-rs.plugin'
    if (Test-Path -LiteralPath $plugin) {
        if (-not $NonInteractive) {
            $answer = Read-Host '将停用 InfLink-rs，但不会卸载 BetterNCM。输入 REMOVE 继续'
            if ($answer -cne 'REMOVE') {
                Write-Host '已保留 InfLink-rs。'
                exit 0
            }
        }
        $removedPlugin = "$plugin.removed-$(Get-Date -Format 'yyyyMMdd-HHmmss-fff')"
        Move-Item -LiteralPath $plugin -Destination $removedPlugin
        Write-Host "InfLink-rs 已停用，可从此位置恢复：$removedPlugin" -ForegroundColor Green
    }
}

Write-Host '卸载处理完成。BetterNCM 可能被其他插件使用，因此不会自动删除。'
