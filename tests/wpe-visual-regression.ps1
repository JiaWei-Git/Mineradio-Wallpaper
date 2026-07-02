param(
  [string]$WallpaperEngine = 'D:\Steam\steamapps\common\wallpaper_engine\wallpaper64.exe',
  [string]$ProjectJson = '',
  [string]$OutputDir = ''
)

$ErrorActionPreference = 'Stop'
$windowName = 'CodexOriginalPortRegression'
$projectRoot = Split-Path -Parent $PSScriptRoot
$workspaceRoot = Split-Path -Parent $projectRoot
$previewRoot = Join-Path $workspaceRoot '.wpe-original-port-preview'
if (-not $ProjectJson) {
  if (Test-Path -LiteralPath $previewRoot) { Remove-Item -LiteralPath $previewRoot -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $previewRoot | Out-Null
  Copy-Item -LiteralPath (Join-Path $projectRoot 'wallpaper') -Destination $previewRoot -Recurse -Force
  $ProjectJson = Join-Path $previewRoot 'wallpaper\project.json'
}
if (-not $OutputDir) { $OutputDir = Join-Path $projectRoot 'test-output\wpe' }
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class OriginalPortCapture {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  public delegate bool EnumChildProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr parent, EnumChildProc callback, IntPtr lParam);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdc, uint flags);
  public static IntPtr FindByTitle(string title) {
    IntPtr result = IntPtr.Zero;
    int bestArea = 0;
    EnumWindows(delegate (IntPtr hWnd, IntPtr lParam) {
      StringBuilder text = new StringBuilder(512);
      GetWindowText(hWnd, text, text.Capacity);
      if (text.ToString().IndexOf(title, StringComparison.OrdinalIgnoreCase) >= 0) {
        RECT rect;
        GetWindowRect(hWnd, out rect);
        int width = Math.Max(0, rect.Right - rect.Left);
        int height = Math.Max(0, rect.Bottom - rect.Top);
        int area = width * height;
        if (area > bestArea) {
          result = hWnd;
          bestArea = area;
        }
      }
      return true;
    }, IntPtr.Zero);
    return result;
  }
  public static IntPtr FindRenderChild(IntPtr parent) {
    IntPtr result = IntPtr.Zero;
    int bestArea = 0;
    EnumChildWindows(parent, delegate (IntPtr hWnd, IntPtr lParam) {
      StringBuilder cls = new StringBuilder(256);
      GetClassName(hWnd, cls, cls.Capacity);
      if (cls.ToString() == "Chrome_RenderWidgetHostHWND") {
        RECT rect;
        GetWindowRect(hWnd, out rect);
        int width = Math.Max(0, rect.Right - rect.Left);
        int height = Math.Max(0, rect.Bottom - rect.Top);
        int area = width * height;
        if (area > bestArea) {
          result = hWnd;
          bestArea = area;
        }
      }
      return true;
    }, IntPtr.Zero);
    return result;
  }
}
'@

function Get-PreviewHandle {
  $handle = [OriginalPortCapture]::FindByTitle($windowName)
  if ($handle -eq [IntPtr]::Zero) { throw 'Wallpaper Engine pop-out window was not found by title.' }
  return $handle
}

function Wait-PreviewHandle {
  $deadline = (Get-Date).AddSeconds(8)
  do {
    $handle = [OriginalPortCapture]::FindByTitle($windowName)
    if ($handle -ne [IntPtr]::Zero) {
      $rect = New-Object OriginalPortCapture+RECT
      [OriginalPortCapture]::GetWindowRect($handle, [ref]$rect) | Out-Null
      $width = $rect.Right - $rect.Left
      $height = $rect.Bottom - $rect.Top
      if ($width -ge 800 -and $height -ge 450) { return $handle }
    }
    Start-Sleep -Milliseconds 250
  } while ((Get-Date) -lt $deadline)
  throw 'Wallpaper Engine pop-out window did not reach the expected capture size.'
}

function Capture-Preview([IntPtr]$Handle, [string]$Name) {
  $captureHandle = [OriginalPortCapture]::FindRenderChild($Handle)
  if ($captureHandle -eq [IntPtr]::Zero) { $captureHandle = $Handle }
  $rect = New-Object OriginalPortCapture+RECT
  [OriginalPortCapture]::GetWindowRect($captureHandle, [ref]$rect) | Out-Null
  $width = [Math]::Max(1, $rect.Right - $rect.Left)
  $height = [Math]::Max(1, $rect.Bottom - $rect.Top)
  $bitmap = New-Object System.Drawing.Bitmap $width, $height
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $hdc = $graphics.GetHdc()
  $captured = [OriginalPortCapture]::PrintWindow($captureHandle, $hdc, 2)
  $graphics.ReleaseHdc($hdc)
  $graphics.Dispose()
  if (-not $captured) { $bitmap.Dispose(); throw "PrintWindow failed for $Name." }
  $path = Join-Path $OutputDir ($Name + '.png')
  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $lit = 0
  $brightness = 0.0
  $samples = 0
  $minLitX = $width
  $maxLitX = -1
  $minLitY = $height
  $maxLitY = -1
  for ($y = 32; $y -lt ($height - 8); $y += 6) {
    for ($x = 8; $x -lt ($width - 8); $x += 6) {
      $color = $bitmap.GetPixel($x, $y)
      $value = ($color.R + $color.G + $color.B) / 3.0
      if ($value -gt 8) {
        $lit += 1
        $minLitX = [Math]::Min($minLitX, $x)
        $maxLitX = [Math]::Max($maxLitX, $x)
        $minLitY = [Math]::Min($minLitY, $y)
        $maxLitY = [Math]::Max($maxLitY, $y)
      }
      $brightness += $value
      $samples += 1
    }
  }
  $bitmap.Dispose()
  [PSCustomObject]@{
    Name = $Name
    Path = $path
    Hash = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash
    LitRatio = [Math]::Round($lit / [Math]::Max(1, $samples), 5)
    MeanBrightness = [Math]::Round($brightness / [Math]::Max(1, $samples), 3)
    LitWidthRatio = if ($maxLitX -ge 0) { [Math]::Round(($maxLitX - $minLitX + 1) / $width, 4) } else { 0 }
    LitHeightRatio = if ($maxLitY -ge 0) { [Math]::Round(($maxLitY - $minLitY + 1) / $height, 4) } else { 0 }
  }
}

function Apply-Case([IntPtr]$Handle, [string]$Name, [hashtable]$Properties) {
  $json = $Properties | ConvertTo-Json -Compress
  $raw = 'RAW~(' + $json + ')~END'
  Wait-PreviewHandle | Out-Null
  & $WallpaperEngine -control applyProperties -location $windowName -properties $raw
  Start-Sleep -Milliseconds 900
  & $WallpaperEngine -control play
  Wait-PreviewHandle | Out-Null
  & $WallpaperEngine -control applyProperties -location $windowName -properties $raw
  Start-Sleep -Milliseconds 3200
  $handle = Wait-PreviewHandle
  Capture-Preview $handle $Name
}

& $WallpaperEngine -control closeWallpaper -location $windowName
$virtualScreen = [System.Windows.Forms.SystemInformation]::VirtualScreen
$previewX = [Math]::Max($virtualScreen.Left + 20, $virtualScreen.Right - 1320)
$previewY = $virtualScreen.Top + 80
& $WallpaperEngine -control openWallpaper -file $ProjectJson -playInWindow $windowName -width 1280 -height 720 -x $previewX -y $previewY
Start-Sleep -Seconds 8
& $WallpaperEngine -control play
$handle = Wait-PreviewHandle

try {
  $common = @{ shelf='off'; backgroundcolormode='black'; backgroundopacity=1; performancequality='high'; coverresolution=1.55; floatlayer=$false; backcover=$false; bloom=$false; aidepth=$false; edge=$false }
  $results = @()
  foreach ($preset in @('classicplane','emily','tunnel','orbit','void','vinyl','galaxy','skull')) {
    $properties = $common.Clone()
    $properties.visualpreset = $preset
    $results += Apply-Case $handle ("preset-" + $preset) $properties
  }
  $results += Apply-Case $handle 'orbit-near' @{ visualpreset='orbit'; shelf='off'; cameradistance=4.8; backgroundcolormode='black'; backgroundopacity=1; floatlayer=$false; backcover=$false; bloom=$false }
  $results += Apply-Case $handle 'orbit-far' @{ visualpreset='orbit'; shelf='off'; cameradistance=13.0; backgroundcolormode='black'; backgroundopacity=1; floatlayer=$false; backcover=$false; bloom=$false }
  $results += Apply-Case $handle 'shelf-stage' @{ visualpreset='classicplane'; shelf='stage'; shelfsize=1; backgroundcolormode='black'; backgroundopacity=1; floatlayer=$false; backcover=$false; bloom=$false }

  foreach ($result in $results | Where-Object { $_.Name -notin @('preset-void','shelf-stage') }) {
    if ($result.LitRatio -lt 0.0002) { throw "$($result.Name) rendered blank." }
  }
  $void = $results | Where-Object Name -eq 'preset-void'
  if ($void.LitRatio -gt 0.0002) { throw 'Void preset with black background should render empty.' }
  $presetHashes = $results | Where-Object { $_.Name -like 'preset-*' } | Select-Object -ExpandProperty Hash -Unique
  if ($presetHashes.Count -ne 8) { throw 'Visual presets did not produce eight distinct frames.' }
  $tunnel = $results | Where-Object Name -eq 'preset-tunnel'
  $orbit = $results | Where-Object Name -eq 'preset-orbit'
  $galaxy = $results | Where-Object Name -eq 'preset-galaxy'
  $skull = $results | Where-Object Name -eq 'preset-skull'
  if ($tunnel.LitWidthRatio -lt 0.55 -or $tunnel.LitHeightRatio -lt 0.85) { throw 'Tunnel preset lost its radial full-height structure.' }
  if ($orbit.LitWidthRatio -lt 0.20 -or $orbit.LitWidthRatio -gt 0.50 -or $orbit.LitHeightRatio -lt 0.35 -or $orbit.LitHeightRatio -gt 0.75) { throw 'Orbit preset lost its centered sphere structure.' }
  if ($galaxy.LitWidthRatio -lt 0.90 -or $galaxy.LitHeightRatio -lt 0.85) { throw 'Galaxy preset no longer spans the viewport.' }
  if ($skull.LitWidthRatio -lt 0.20 -or $skull.LitWidthRatio -gt 0.50 -or $skull.LitHeightRatio -lt 0.65) { throw 'Skull preset did not load the expected tall point-cloud silhouette.' }
  if (($results | Where-Object Name -eq 'orbit-near').Hash -eq ($results | Where-Object Name -eq 'orbit-far').Hash) {
    throw 'Camera distance did not change the rendered frame.'
  }

  $report = Join-Path $OutputDir 'report.json'
  $results | ConvertTo-Json | Set-Content -LiteralPath $report -Encoding UTF8
  $results | Format-Table Name, LitRatio, MeanBrightness, LitWidthRatio, LitHeightRatio, Path -AutoSize
  Write-Output "REPORT=$report"
}
finally {
  & $WallpaperEngine -control closeWallpaper -location $windowName
  if (Test-Path -LiteralPath $previewRoot) {
    $resolvedPreview = (Resolve-Path -LiteralPath $previewRoot).Path
    if ($resolvedPreview.StartsWith($workspaceRoot, [StringComparison]::OrdinalIgnoreCase)) {
      Remove-Item -LiteralPath $resolvedPreview -Recurse -Force
    }
  }
}
