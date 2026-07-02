$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Installer = Join-Path $ProjectRoot 'installer\install.ps1'
$Plugin = Join-Path $ProjectRoot 'third_party\inflink-rs\InfLink-rs-v3.2.11-ncm-3.1.36.plugin'
$SourceArchive = Join-Path $ProjectRoot 'third_party\inflink-rs\InfLink-rs-v3.2.11-ncm-3.1.36-source.zip'
$ExpectedPluginHash = '9154B5BB666FD1E72A0F788F4405A1A00C6DE418BFE7B74C30B5036CC26E9F57'
$TestRoot = Join-Path $ProjectRoot "test-output\release-installer-$PID"

function Assert-True([bool]$Condition, [string]$Message) {
    if (-not $Condition) {
        throw $Message
    }
}

function Get-ZipEntryText([string]$ArchivePath, [string]$EntryName) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [IO.Compression.ZipFile]::OpenRead($ArchivePath)
    try {
        $entry = $archive.Entries | Where-Object { $_.FullName.Replace('\', '/') -eq $EntryName } | Select-Object -First 1
        if (-not $entry) {
            throw "压缩包缺少：$EntryName"
        }
        $reader = [IO.StreamReader]::new($entry.Open())
        try {
            return $reader.ReadToEnd()
        }
        finally {
            $reader.Dispose()
        }
    }
    finally {
        $archive.Dispose()
    }
}

New-Item -ItemType Directory -Path $TestRoot -Force | Out-Null
try {
    foreach ($script in Get-ChildItem -LiteralPath (Join-Path $ProjectRoot 'installer') -Filter *.ps1) {
        $tokens = $null
        $errors = $null
        [void][Management.Automation.Language.Parser]::ParseFile($script.FullName, [ref]$tokens, [ref]$errors)
        Assert-True ($errors.Count -eq 0) "PowerShell 语法错误：$($script.FullName) $($errors -join '; ')"
    }

    Assert-True (Test-Path -LiteralPath $Plugin -PathType Leaf) '缺少 InfLink-rs 插件包'
    Assert-True (Test-Path -LiteralPath $SourceArchive -PathType Leaf) '缺少 InfLink-rs 对应源码包'
    Assert-True ((Get-FileHash -LiteralPath $Plugin -Algorithm SHA256).Hash -eq $ExpectedPluginHash) 'InfLink-rs 插件哈希不匹配'

    $pluginManifest = Get-ZipEntryText $Plugin 'manifest.json'
    Assert-True ($pluginManifest -match 'vendors~app~subApp\.chunk') 'InfLink-rs manifest 缺少旧网易云路径'
    Assert-True ($pluginManifest -match 'orpheus/pub/hybrid/app\.chunk') 'InfLink-rs manifest 缺少网易云 3.1.36 路径'

    $sourceManifest = Get-ZipEntryText $SourceArchive 'packages/frontend/manifest.json'
    Assert-True ($sourceManifest -eq $pluginManifest) '源码包 manifest 与插件包 manifest 不一致'
    [void](Get-ZipEntryText $SourceArchive 'LICENSE')

    $fakeEngine = Join-Path $TestRoot 'wallpaper_engine'
    $fakeNetease = Join-Path $TestRoot 'CloudMusic'
    $fakeBetterNcm = Join-Path $TestRoot 'betterncm'
    New-Item -ItemType Directory -Path (Join-Path $fakeEngine 'projects'),$fakeNetease,$fakeBetterNcm -Force | Out-Null
    Set-Content -LiteralPath (Join-Path $fakeNetease 'cloudmusic.exe') -Value 'test executable placeholder' -Encoding Ascii
    Set-Content -LiteralPath (Join-Path $fakeNetease 'msimg32.dll') -Value 'test BetterNCM placeholder' -Encoding Ascii

    $riskRejected = $false
    try {
        & $Installer -Mode Full -WallpaperEnginePath $fakeEngine -NeteasePath $fakeNetease -BetterNcmDataPath $fakeBetterNcm -NonInteractive -NoLaunch
    }
    catch {
        $riskRejected = $_.Exception.Message -match 'AcceptUnsignedPluginRisk'
    }
    Assert-True $riskRejected '完整非交互模式在未接受风险时没有停止'
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $fakeEngine 'projects\myprojects\mineradio-wallpaper'))) '风险确认前不应写入壁纸目录'

    & $Installer -Mode WallpaperOnly -WallpaperEnginePath $fakeEngine -NonInteractive -NoLaunch
    $target = Join-Path $fakeEngine 'projects\myprojects\mineradio-wallpaper'
    Assert-True (Test-Path -LiteralPath (Join-Path $target 'project.json') -PathType Leaf) '仅壁纸模式未安装 project.json'

    & $Installer -Mode WallpaperOnly -WallpaperEnginePath $fakeEngine -NonInteractive -NoLaunch
    $backups = @(Get-ChildItem -LiteralPath (Split-Path -Parent $target) -Directory -Filter 'mineradio-wallpaper.backup-*')
    Assert-True ($backups.Count -ge 1) '重复安装未创建壁纸备份'

    & $Installer -Mode Full -WallpaperEnginePath $fakeEngine -NeteasePath $fakeNetease -BetterNcmDataPath $fakeBetterNcm -AcceptUnsignedPluginRisk -NonInteractive -NoLaunch
    $installedPlugin = Join-Path $fakeBetterNcm 'plugins\InfLink-rs.plugin'
    Assert-True (Test-Path -LiteralPath $installedPlugin -PathType Leaf) '完整模式未安装 InfLink-rs'
    Assert-True ((Get-FileHash -LiteralPath $installedPlugin -Algorithm SHA256).Hash -eq $ExpectedPluginHash) '完整模式安装后的插件哈希错误'

    $sourceFiles = @(Get-ChildItem -LiteralPath (Join-Path $ProjectRoot 'wallpaper') -Recurse -File)
    $targetFiles = @(Get-ChildItem -LiteralPath $target -Recurse -File)
    Assert-True ($sourceFiles.Count -eq $targetFiles.Count) '安装后的壁纸文件数量错误'

    Write-Host 'Mineradio release installer tests passed' -ForegroundColor Green
}
finally {
    if (Test-Path -LiteralPath $TestRoot) {
        Remove-Item -LiteralPath $TestRoot -Recurse -Force
    }
}
