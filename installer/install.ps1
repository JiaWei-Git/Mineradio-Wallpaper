[CmdletBinding()]
param(
    [ValidateSet('Interactive', 'Full', 'WallpaperOnly')]
    [string]$Mode = 'Interactive',
    [string]$WallpaperEnginePath,
    [string]$NeteasePath,
    [string]$BetterNcmDataPath = 'C:\betterncm',
    [string]$BetterNcmInstallerPath,
    [switch]$AcceptUnsignedPluginRisk,
    [switch]$NonInteractive,
    [switch]$NoLaunch
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$WallpaperSource = Join-Path $ProjectRoot 'wallpaper'
$PluginSource = Join-Path $ProjectRoot 'third_party\inflink-rs\InfLink-rs-v3.2.11-ncm-3.1.36.plugin'
$BetterNcmInstallerUrl = 'https://github.com/std-microblock/BetterNCM-Installer/releases/download/1.2.0/betterncm_installer.exe'
$BetterNcmInstallerSha256 = 'F4AABE8FBC09BB78AD66AAA28DBD26F2FB01D782CBA0611152CF8F5CC6CB1468'
$PluginSha256 = '9154B5BB666FD1E72A0F788F4405A1A00C6DE418BFE7B74C30B5036CC26E9F57'

function Write-Step([string]$Message) {
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Get-NormalizedPath([string]$Path) {
    return [IO.Path]::GetFullPath($Path).TrimEnd('\')
}

function Assert-ChildPath([string]$Parent, [string]$Child) {
    $parentPath = (Get-NormalizedPath $Parent) + '\'
    $childPath = Get-NormalizedPath $Child
    if (-not $childPath.StartsWith($parentPath, [StringComparison]::OrdinalIgnoreCase)) {
        throw "拒绝操作边界外路径：$childPath"
    }
}

function Get-SteamRoots {
    $roots = [Collections.Generic.List[string]]::new()
    foreach ($registryPath in @(
        'HKCU:\Software\Valve\Steam',
        'HKLM:\Software\WOW6432Node\Valve\Steam',
        'HKLM:\Software\Valve\Steam'
    )) {
        $item = Get-ItemProperty -LiteralPath $registryPath -ErrorAction SilentlyContinue
        foreach ($name in @('SteamPath', 'InstallPath')) {
            $property = if ($item) { $item.PSObject.Properties[$name] } else { $null }
            if ($property -and $property.Value) {
                $roots.Add([string]$property.Value)
            }
        }
    }

    foreach ($fallback in @(
        "${env:ProgramFiles(x86)}\Steam",
        "$env:ProgramFiles\Steam",
        'D:\Steam'
    )) {
        if ($fallback) {
            $roots.Add($fallback)
        }
    }

    $libraryRoots = [Collections.Generic.List[string]]::new()
    foreach ($root in @($roots)) {
        if (-not (Test-Path -LiteralPath $root -PathType Container)) {
            continue
        }
        $libraryRoots.Add($root)
        $vdf = Join-Path $root 'steamapps\libraryfolders.vdf'
        if (-not (Test-Path -LiteralPath $vdf -PathType Leaf)) {
            continue
        }
        $content = Get-Content -LiteralPath $vdf -Raw -ErrorAction SilentlyContinue
        foreach ($match in [regex]::Matches([string]$content, '"path"\s+"([^"]+)"')) {
            $libraryRoots.Add($match.Groups[1].Value.Replace('\\', '\'))
        }
    }

    return @($libraryRoots | Select-Object -Unique)
}

function Resolve-WallpaperEnginePath([string]$ExplicitPath) {
    if ($ExplicitPath -and (Test-Path -LiteralPath (Join-Path $ExplicitPath 'projects') -PathType Container)) {
        return Get-NormalizedPath $ExplicitPath
    }
    $candidates = [Collections.Generic.List[string]]::new()
    if ($ExplicitPath) {
        $candidates.Add($ExplicitPath)
    }
    foreach ($steamRoot in Get-SteamRoots) {
        $candidates.Add((Join-Path $steamRoot 'steamapps\common\wallpaper_engine'))
    }

    foreach ($candidate in @($candidates | Select-Object -Unique)) {
        if (Test-Path -LiteralPath (Join-Path $candidate 'projects') -PathType Container) {
            return Get-NormalizedPath $candidate
        }
    }
    throw '未找到 Wallpaper Engine。请先通过 Steam 安装并启动一次，或使用 -WallpaperEnginePath 指定目录。'
}

function Resolve-NeteasePath([string]$ExplicitPath) {
    if ($ExplicitPath -and (Test-Path -LiteralPath (Join-Path $ExplicitPath 'cloudmusic.exe') -PathType Leaf)) {
        return Get-NormalizedPath $ExplicitPath
    }
    $candidates = [Collections.Generic.List[string]]::new()
    if ($ExplicitPath) {
        $candidates.Add($ExplicitPath)
    }

    foreach ($registryRoot in @(
        'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
    )) {
        foreach ($item in Get-ItemProperty $registryRoot -ErrorAction SilentlyContinue) {
            $displayName = $item.PSObject.Properties['DisplayName']
            if (-not $displayName -or [string]$displayName.Value -notmatch '网易云|NetEase|CloudMusic') {
                continue
            }
            $installLocation = $item.PSObject.Properties['InstallLocation']
            $uninstallString = $item.PSObject.Properties['UninstallString']
            if ($installLocation -and $installLocation.Value) {
                $candidates.Add([string]$installLocation.Value)
            }
            if ($uninstallString -and $uninstallString.Value) {
                $uninstall = [string]$uninstallString.Value
                $uninstall = $uninstall.Trim('"')
                $candidates.Add((Split-Path -Parent $uninstall))
            }
        }
    }

    foreach ($fallback in @(
        'C:\Program Files (x86)\Netease\CloudMusic',
        'C:\Program Files\Netease\CloudMusic',
        'D:\CloudMusic'
    )) {
        $candidates.Add($fallback)
    }

    foreach ($candidate in @($candidates | Where-Object { $_ } | Select-Object -Unique)) {
        if (Test-Path -LiteralPath (Join-Path $candidate 'cloudmusic.exe') -PathType Leaf) {
            return Get-NormalizedPath $candidate
        }
    }
    throw '未找到网易云音乐 Win32 客户端。完整增强仅支持桌面 Win32 客户端，可使用 -NeteasePath 指定目录。'
}

function Get-TreeHashMap([string]$Root) {
    $rootPath = Get-NormalizedPath $Root
    $map = @{}
    foreach ($file in Get-ChildItem -LiteralPath $rootPath -Recurse -File) {
        $relative = $file.FullName.Substring($rootPath.Length).TrimStart('\').Replace('\', '/')
        $map[$relative] = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
    }
    return $map
}

function Assert-TreeMatches([string]$Source, [string]$Destination) {
    $sourceMap = Get-TreeHashMap $Source
    $destinationMap = Get-TreeHashMap $Destination
    if ($sourceMap.Count -ne $destinationMap.Count) {
        throw "壁纸文件数量不一致：源 $($sourceMap.Count)，目标 $($destinationMap.Count)"
    }
    foreach ($key in $sourceMap.Keys) {
        if (-not $destinationMap.ContainsKey($key) -or $sourceMap[$key] -ne $destinationMap[$key]) {
            throw "壁纸文件校验失败：$key"
        }
    }
}

function Install-Wallpaper([string]$EnginePath) {
    if (-not (Test-Path -LiteralPath (Join-Path $WallpaperSource 'project.json') -PathType Leaf)) {
        throw "发布包缺少 wallpaper/project.json：$WallpaperSource"
    }

    $myProjects = Join-Path $EnginePath 'projects\myprojects'
    New-Item -ItemType Directory -Path $myProjects -Force | Out-Null
    $target = Join-Path $myProjects 'mineradio-wallpaper'
    Assert-ChildPath $myProjects $target

    $backup = $null
    if (Test-Path -LiteralPath $target) {
        $backup = "$target.backup-$(Get-Date -Format 'yyyyMMdd-HHmmss-fff')"
        Move-Item -LiteralPath $target -Destination $backup
        Write-Host "已备份旧壁纸：$backup"
    }

    try {
        Copy-Item -LiteralPath $WallpaperSource -Destination $target -Recurse
        Assert-TreeMatches $WallpaperSource $target
    }
    catch {
        if (Test-Path -LiteralPath $target) {
            Remove-Item -LiteralPath $target -Recurse -Force
        }
        if ($backup -and (Test-Path -LiteralPath $backup)) {
            Move-Item -LiteralPath $backup -Destination $target
        }
        throw
    }

    Write-Host "壁纸安装完成：$target" -ForegroundColor Green
    return $target
}

function Confirm-PluginRisk {
    Write-Host ''
    Write-Host '网易云完整增强会安装 BetterNCM，并向网易云进程加载未签名 DLL。' -ForegroundColor Yellow
    Write-Host '它可能触发杀毒软件告警、在网易云升级后失效，或导致客户端无法启动。' -ForegroundColor Yellow
    Write-Host '安装器会固定来源与 SHA-256，并在覆盖插件前创建备份，但风险不能归零。' -ForegroundColor Yellow

    if ($AcceptUnsignedPluginRisk) {
        return
    }
    if ($NonInteractive) {
        throw '非交互完整安装必须显式传入 -AcceptUnsignedPluginRisk。'
    }
    $answer = Read-Host '如理解并同意，请输入 INSTALL'
    if ($answer -cne 'INSTALL') {
        throw '用户未同意未签名 DLL 注入风险，已停止增强安装。'
    }
}

function Stop-NeteaseIfNeeded {
    $processes = @(Get-Process -Name cloudmusic -ErrorAction SilentlyContinue)
    if ($processes.Count -eq 0) {
        return
    }
    if ($NonInteractive) {
        throw '网易云音乐正在运行。请关闭后重试完整安装。'
    }
    $answer = Read-Host '网易云正在运行，输入 Y 允许安装器关闭它'
    if ($answer -notmatch '^(?i)y$') {
        throw '网易云未关闭，已停止增强安装。'
    }
    $processes | Stop-Process -Force
    Start-Sleep -Milliseconds 800
}

function Install-BetterNcmIfMissing([string]$CloudMusicPath) {
    $loader = Join-Path $CloudMusicPath 'msimg32.dll'
    if (Test-Path -LiteralPath $loader -PathType Leaf) {
        Write-Host "检测到 BetterNCM：$loader"
        return
    }

    $installer = $BetterNcmInstallerPath
    if (-not $installer) {
        $downloadDirectory = Join-Path $env:TEMP 'Mineradio-Wallpaper'
        New-Item -ItemType Directory -Path $downloadDirectory -Force | Out-Null
        $installer = Join-Path $downloadDirectory 'betterncm_installer-1.2.0.exe'
        Write-Step '下载 BetterNCM 官方安装器 1.2.0'
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $BetterNcmInstallerUrl -OutFile $installer -UseBasicParsing
    }

    if (-not (Test-Path -LiteralPath $installer -PathType Leaf)) {
        throw "BetterNCM 安装器不存在：$installer"
    }
    $actualHash = (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash
    if ($actualHash -ne $BetterNcmInstallerSha256) {
        throw "BetterNCM 安装器 SHA-256 不匹配。期望 $BetterNcmInstallerSha256，实际 $actualHash"
    }

    Write-Host '即将启动 BetterNCM 官方安装器；请在窗口中选择当前网易云安装目录。'
    $process = Start-Process -FilePath $installer -Wait -PassThru
    if ($process.ExitCode -ne 0) {
        throw "BetterNCM 安装器退出码：$($process.ExitCode)"
    }
    if (-not (Test-Path -LiteralPath $loader -PathType Leaf)) {
        throw "BetterNCM 安装完成后仍未找到 $loader。请检查安装器选择的网易云目录。"
    }
}

function Install-InfLink([string]$DataPath) {
    if (-not (Test-Path -LiteralPath $PluginSource -PathType Leaf)) {
        throw "发布包缺少 InfLink-rs：$PluginSource"
    }
    $actualSourceHash = (Get-FileHash -LiteralPath $PluginSource -Algorithm SHA256).Hash
    if ($actualSourceHash -ne $PluginSha256) {
        throw "InfLink-rs 发布包 SHA-256 不匹配。期望 $PluginSha256，实际 $actualSourceHash"
    }

    $pluginDirectory = Join-Path $DataPath 'plugins'
    New-Item -ItemType Directory -Path $pluginDirectory -Force | Out-Null
    $target = Join-Path $pluginDirectory 'InfLink-rs.plugin'
    Assert-ChildPath $pluginDirectory $target
    if (Test-Path -LiteralPath $target) {
        $backup = "$target.backup-$(Get-Date -Format 'yyyyMMdd-HHmmss-fff')"
        Copy-Item -LiteralPath $target -Destination $backup
        Write-Host "已备份旧 InfLink-rs：$backup"
    }
    Copy-Item -LiteralPath $PluginSource -Destination $target -Force
    $actualTargetHash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash
    if ($actualTargetHash -ne $PluginSha256) {
        throw "InfLink-rs 安装后校验失败：$target"
    }
    Write-Host "InfLink-rs 安装完成：$target" -ForegroundColor Green
}

if ($Mode -eq 'Interactive') {
    Write-Host 'Mineradio Wallpaper 发布版 1.0' -ForegroundColor Green
    Write-Host '[1] 完整安装：壁纸 + 网易云精准时间轴增强'
    Write-Host '[2] 仅安装壁纸：不修改网易云'
    Write-Host '[3] 退出'
    $choice = Read-Host '请选择'
    switch ($choice) {
        '1' { $Mode = 'Full' }
        '2' { $Mode = 'WallpaperOnly' }
        default { Write-Host '已退出。'; exit 0 }
    }
}

if ($Mode -eq 'Full') {
    Confirm-PluginRisk
}

Write-Step '定位并安装 Wallpaper Engine 壁纸'
$enginePath = Resolve-WallpaperEnginePath $WallpaperEnginePath
$wallpaperTarget = Install-Wallpaper $enginePath

if ($Mode -eq 'Full') {
    Write-Step '定位网易云并安装可选增强'
    $cloudMusicPath = Resolve-NeteasePath $NeteasePath
    Stop-NeteaseIfNeeded
    Install-BetterNcmIfMissing $cloudMusicPath
    Install-InfLink $BetterNcmDataPath
    if (-not $NoLaunch) {
        Start-Process -FilePath (Join-Path $cloudMusicPath 'cloudmusic.exe')
    }
}

if (-not $NoLaunch) {
    $wallpaperExecutable = @(
        (Join-Path $enginePath 'wallpaper64.exe'),
        (Join-Path $enginePath 'wallpaper32.exe')
    ) | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
    if ($wallpaperExecutable) {
        $projectFileArgument = '"{0}"' -f (Join-Path $wallpaperTarget 'project.json')
        Start-Process -FilePath $wallpaperExecutable -ArgumentList @(
            '-control', 'openWallpaper', '-file', $projectFileArgument, '-monitor', '0'
        )
    }
}

Write-Host ''
if ($Mode -eq 'Full') {
    Write-Host '安装完成。请播放歌曲并在壁纸诊断面板确认状态为 netease-enhanced。' -ForegroundColor Green
}
else {
    Write-Host '壁纸安装完成。当前未修改网易云音乐。' -ForegroundColor Green
}
