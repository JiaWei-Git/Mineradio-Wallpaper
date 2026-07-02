param(
  [string]$WindowTitle = 'MR51Diag',
  [string]$Output = ''
)

$ErrorActionPreference = 'Stop'
if (-not $Output) {
  $Output = Join-Path (Split-Path -Parent $PSScriptRoot) 'test-output\wpe\diagnostics.png'
}
$outputDir = Split-Path -Parent $Output
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class MineradioDiagnosticCapture {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdc, uint flags);
  public static IntPtr FindByTitle(string title) {
    IntPtr result = IntPtr.Zero;
    EnumWindows(delegate (IntPtr hWnd, IntPtr lParam) {
      StringBuilder text = new StringBuilder(512);
      GetWindowText(hWnd, text, text.Capacity);
      if (text.ToString().IndexOf(title, StringComparison.OrdinalIgnoreCase) >= 0) result = hWnd;
      return result == IntPtr.Zero;
    }, IntPtr.Zero);
    return result;
  }
}
'@

$handle = [MineradioDiagnosticCapture]::FindByTitle($WindowTitle)
if ($handle -eq [IntPtr]::Zero) { throw "Window '$WindowTitle' not found." }
$rect = New-Object MineradioDiagnosticCapture+RECT
[MineradioDiagnosticCapture]::GetWindowRect($handle, [ref]$rect) | Out-Null
$width = [Math]::Max(1, $rect.Right - $rect.Left)
$height = [Math]::Max(1, $rect.Bottom - $rect.Top)
$bitmap = New-Object System.Drawing.Bitmap $width, $height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$hdc = $graphics.GetHdc()
$captured = [MineradioDiagnosticCapture]::PrintWindow($handle, $hdc, 2)
$graphics.ReleaseHdc($hdc)
$graphics.Dispose()
if (-not $captured) { $bitmap.Dispose(); throw 'PrintWindow failed.' }
$bitmap.Save($Output, [System.Drawing.Imaging.ImageFormat]::Png)
$bitmap.Dispose()
Write-Output $Output
