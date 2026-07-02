param(
  [int]$MinimumWidth = 1400,
  [int]$MinimumHeight = 800
)

$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class MineradioDiagnosticExport {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc callback, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr parent, EnumProc callback, IntPtr lParam);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, uint message, IntPtr wParam, IntPtr lParam);
}
'@

$candidates = @()
[MineradioDiagnosticExport]::EnumWindows({
  param($top, $unused)
  [MineradioDiagnosticExport]::EnumChildWindows($top, {
    param($handle, $innerUnused)
    $class = New-Object System.Text.StringBuilder 256
    [MineradioDiagnosticExport]::GetClassName($handle, $class, $class.Capacity) | Out-Null
    if ($class.ToString() -ne 'Chrome_RenderWidgetHostHWND') { return $true }
    [uint32]$processId = 0
    [MineradioDiagnosticExport]::GetWindowThreadProcessId($handle, [ref]$processId) | Out-Null
    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if (-not $process -or $process.ProcessName -ne 'webwallpaper64') { return $true }
    $rect = New-Object MineradioDiagnosticExport+RECT
    [MineradioDiagnosticExport]::GetWindowRect($handle, [ref]$rect) | Out-Null
    $width = $rect.Right - $rect.Left
    $height = $rect.Bottom - $rect.Top
    if ($width -ge $MinimumWidth -and $height -ge $MinimumHeight) {
      $script:candidates += [PSCustomObject]@{ Handle = $handle; Area = $width * $height }
    }
    return $true
  }, [IntPtr]::Zero) | Out-Null
  return $true
}, [IntPtr]::Zero) | Out-Null

$target = $candidates | Sort-Object Area -Descending | Select-Object -First 1
if (-not $target) { throw 'Wallpaper Engine desktop render window was not found.' }

Set-Clipboard -Value 'MR_DIAGNOSTIC_EXPORT_PENDING'
$x = 692
$y = 39
$point = [IntPtr](($y -shl 16) -bor $x)
[MineradioDiagnosticExport]::PostMessage($target.Handle, 0x0200, [IntPtr]::Zero, $point) | Out-Null
[MineradioDiagnosticExport]::PostMessage($target.Handle, 0x0201, [IntPtr]1, $point) | Out-Null
Start-Sleep -Milliseconds 100
[MineradioDiagnosticExport]::PostMessage($target.Handle, 0x0202, [IntPtr]::Zero, $point) | Out-Null
Start-Sleep -Seconds 2
$text = Get-Clipboard -Raw
if (-not $text -or $text -eq 'MR_DIAGNOSTIC_EXPORT_PENDING') { throw 'Wallpaper diagnostic copy did not update the clipboard.' }
$text
