[CmdletBinding()]
param(
    [string]$OutputDirectory,
    [switch]$VerifyOnly
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Version = 'v1.0.0'
$BundleName = "Mineradio-Wallpaper-$Version"

if (-not $OutputDirectory) {
    if ($VerifyOnly) {
        $OutputDirectory = Join-Path $ProjectRoot "test-output\release-verify-$PID"
    }
    else {
        $OutputDirectory = Join-Path $ProjectRoot 'release'
    }
}
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
$StageRoot = Join-Path $OutputDirectory ".stage-$PID"
$BundleRoot = Join-Path $StageRoot $BundleName
$ZipPath = Join-Path $OutputDirectory "$BundleName.zip"
$ChecksumPath = Join-Path $OutputDirectory 'SHA256SUMS.txt'

function Assert-True([bool]$Condition, [string]$Message) {
    if (-not $Condition) {
        throw $Message
    }
}

function Get-RelativeHashes([string]$Root) {
    $normalized = [IO.Path]::GetFullPath($Root).TrimEnd('\')
    $result = [ordered]@{}
    foreach ($file in Get-ChildItem -LiteralPath $normalized -Recurse -File | Sort-Object FullName) {
        $relative = $file.FullName.Substring($normalized.Length).TrimStart('\').Replace('\', '/')
        $result[$relative] = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
    }
    return $result
}

if (Test-Path -LiteralPath $StageRoot) {
    Remove-Item -LiteralPath $StageRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $BundleRoot -Force | Out-Null

try {
    foreach ($directory in @('wallpaper', 'installer', 'third_party')) {
        Copy-Item -LiteralPath (Join-Path $ProjectRoot $directory) -Destination (Join-Path $BundleRoot $directory) -Recurse
    }

    New-Item -ItemType Directory -Path (Join-Path $BundleRoot 'docs') -Force | Out-Null
    foreach ($file in @(
        'README.md',
        'LICENSE',
        'NOTICE.md',
        'THIRD_PARTY_LICENSES.md',
        'SECURITY.md',
        'install.cmd',
        'uninstall.cmd'
    )) {
        Copy-Item -LiteralPath (Join-Path $ProjectRoot $file) -Destination (Join-Path $BundleRoot $file)
    }
    foreach ($file in @('INSTALLATION.md', 'NETEASE_ENHANCEMENT.md')) {
        Copy-Item -LiteralPath (Join-Path $ProjectRoot "docs\$file") -Destination (Join-Path $BundleRoot "docs\$file")
    }

    $pluginPath = Join-Path $BundleRoot 'third_party\inflink-rs\InfLink-rs-v3.2.11-ncm-3.1.36.plugin'
    $sourcePath = Join-Path $BundleRoot 'third_party\inflink-rs\InfLink-rs-v3.2.11-ncm-3.1.36-source.zip'
    $manifest = [ordered]@{
        name = 'Mineradio Wallpaper 发布版 1.0'
        version = $Version
        generatedAtUtc = [DateTime]::UtcNow.ToString('o')
        wallpaperFiles = (Get-ChildItem -LiteralPath (Join-Path $BundleRoot 'wallpaper') -Recurse -File).Count
        pluginSha256 = (Get-FileHash -LiteralPath $pluginPath -Algorithm SHA256).Hash
        pluginSourceSha256 = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash
        infLinkUpstreamCommit = '0dfa9f5cb2eddddeb76435642e5527352f593bb7'
        betterNcmInstaller = [ordered]@{
            version = '1.2.0'
            url = 'https://github.com/std-microblock/BetterNCM-Installer/releases/download/1.2.0/betterncm_installer.exe'
            sha256 = 'F4AABE8FBC09BB78AD66AAA28DBD26F2FB01D782CBA0611152CF8F5CC6CB1468'
            bundled = $false
        }
        files = Get-RelativeHashes $BundleRoot
    }
    $manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $BundleRoot 'RELEASE-MANIFEST.json') -Encoding UTF8

    New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
    Compress-Archive -LiteralPath $BundleRoot -DestinationPath $ZipPath -CompressionLevel Optimal -Force
    $zipHash = (Get-FileHash -LiteralPath $ZipPath -Algorithm SHA256).Hash
    "$zipHash *$([IO.Path]::GetFileName($ZipPath))" | Set-Content -LiteralPath $ChecksumPath -Encoding Ascii

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [IO.Compression.ZipFile]::OpenRead($ZipPath)
    try {
        $entries = @($archive.Entries | ForEach-Object { $_.FullName.Replace('\', '/') })
        foreach ($required in @(
            "$BundleName/install.cmd",
            "$BundleName/wallpaper/project.json",
            "$BundleName/installer/install.ps1",
            "$BundleName/third_party/inflink-rs/InfLink-rs-v3.2.11-ncm-3.1.36.plugin",
            "$BundleName/third_party/inflink-rs/InfLink-rs-v3.2.11-ncm-3.1.36-source.zip",
            "$BundleName/docs/INSTALLATION.md",
            "$BundleName/RELEASE-MANIFEST.json"
        )) {
            Assert-True ($entries -contains $required) "Release 压缩包缺少：$required"
        }
        Assert-True (-not ($entries | Where-Object { $_ -match '/(test-output|\.git|release)/' })) 'Release 压缩包混入开发或临时目录'
    }
    finally {
        $archive.Dispose()
    }

    $extractRoot = Join-Path $OutputDirectory ".extract-$PID"
    Expand-Archive -LiteralPath $ZipPath -DestinationPath $extractRoot -Force
    try {
        $extracted = Join-Path $extractRoot $BundleName
        $expectedWallpaper = Get-RelativeHashes (Join-Path $ProjectRoot 'wallpaper')
        $actualWallpaper = Get-RelativeHashes (Join-Path $extracted 'wallpaper')
        Assert-True ($expectedWallpaper.Count -eq $actualWallpaper.Count) 'Release 解压后的壁纸文件数量错误'
        foreach ($key in $expectedWallpaper.Keys) {
            Assert-True ($actualWallpaper.Contains($key)) "Release 解压后缺少壁纸文件：$key"
            Assert-True ($expectedWallpaper[$key] -eq $actualWallpaper[$key]) "Release 解压后壁纸哈希错误：$key"
        }
        Assert-True ((Get-FileHash -LiteralPath (Join-Path $extracted 'third_party\inflink-rs\InfLink-rs-v3.2.11-ncm-3.1.36.plugin') -Algorithm SHA256).Hash -eq '9154B5BB666FD1E72A0F788F4405A1A00C6DE418BFE7B74C30B5036CC26E9F57') 'Release 插件哈希错误'
    }
    finally {
        Remove-Item -LiteralPath $extractRoot -Recurse -Force
    }

    Write-Host "Release package verified: $ZipPath" -ForegroundColor Green
}
finally {
    if (Test-Path -LiteralPath $StageRoot) {
        Remove-Item -LiteralPath $StageRoot -Recurse -Force
    }
    if ($VerifyOnly -and (Test-Path -LiteralPath $OutputDirectory)) {
        Remove-Item -LiteralPath $OutputDirectory -Recurse -Force
    }
}
