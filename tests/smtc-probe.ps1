param(
  [double]$SeekSeconds = -1,
  [switch]$Play,
  [switch]$Pause,
  [switch]$Next,
  [switch]$Previous
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Runtime.WindowsRuntime

$asTaskMethods = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq "AsTask" -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1
}

function Wait-WinRtOperation {
  param($Operation, [Type]$ResultType)
  $method = $asTaskMethods | Select-Object -First 1
  $task = $method.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
  $task.Wait()
  return $task.Result
}

$managerType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$sessionType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSession, Windows.Media.Control, ContentType = WindowsRuntime]
$mediaType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime]
$manager = Wait-WinRtOperation ($managerType::RequestAsync()) $managerType
$sessions = @($manager.GetSessions())
$rows = @()
$selected = $null
$currentSession = $manager.GetCurrentSession()
$currentSummary = $null

foreach ($session in $sessions) {
  $media = Wait-WinRtOperation ($session.TryGetMediaPropertiesAsync()) $mediaType
  $timeline = $session.GetTimelineProperties()
  $playback = $session.GetPlaybackInfo()
  $genres = @($media.Genres) -join ","
  $row = [ordered]@{
    source = $session.SourceAppUserModelId
    title = $media.Title
    artist = $media.Artist
    album = $media.AlbumTitle
    genres = $genres
    state = [string]$playback.PlaybackStatus
    position = [math]::Round($timeline.Position.TotalSeconds, 3)
    duration = [math]::Round($timeline.EndTime.TotalSeconds, 3)
    minSeek = [math]::Round($timeline.MinSeekTime.TotalSeconds, 3)
    maxSeek = [math]::Round($timeline.MaxSeekTime.TotalSeconds, 3)
  }
  $rows += [PSCustomObject]$row
  if (-not $selected -and $genres -match '(?:^|[,;\s])NCM-\d+(?:$|[,;\s])') { $selected = $session }
}

if ($currentSession) {
  $media = Wait-WinRtOperation ($currentSession.TryGetMediaPropertiesAsync()) $mediaType
  $timeline = $currentSession.GetTimelineProperties()
  $playback = $currentSession.GetPlaybackInfo()
  $currentSummary = [PSCustomObject][ordered]@{
    source = $currentSession.SourceAppUserModelId
    title = $media.Title
    artist = $media.Artist
    album = $media.AlbumTitle
    genres = @($media.Genres) -join ","
    state = [string]$playback.PlaybackStatus
    position = [math]::Round($timeline.Position.TotalSeconds, 3)
    duration = [math]::Round($timeline.EndTime.TotalSeconds, 3)
    minSeek = [math]::Round($timeline.MinSeekTime.TotalSeconds, 3)
    maxSeek = [math]::Round($timeline.MaxSeekTime.TotalSeconds, 3)
  }
}

if (-not $selected) { $selected = $currentSession }
if (($SeekSeconds -ge 0 -or $Play -or $Pause -or $Next -or $Previous) -and -not $selected) {
  throw "No active SMTC session is available."
}

$actions = [ordered]@{}
if ($Play) {
  $actions.play = Wait-WinRtOperation ($selected.TryPlayAsync()) ([bool])
}
if ($Pause) {
  $actions.pause = Wait-WinRtOperation ($selected.TryPauseAsync()) ([bool])
}
if ($Next) {
  $actions.next = Wait-WinRtOperation ($selected.TrySkipNextAsync()) ([bool])
}
if ($Previous) {
  $actions.previous = Wait-WinRtOperation ($selected.TrySkipPreviousAsync()) ([bool])
}
if ($SeekSeconds -ge 0) {
  $ticks = [long]([math]::Round($SeekSeconds * 10000000))
  $actions.seek = Wait-WinRtOperation ($selected.TryChangePlaybackPositionAsync($ticks)) ([bool])
  $actions.targetSeconds = $SeekSeconds
}

[PSCustomObject]@{
  sessions = $rows
  current = $currentSummary
  selectedSource = if ($selected) { $selected.SourceAppUserModelId } else { $null }
  actions = [PSCustomObject]$actions
} | ConvertTo-Json -Depth 6
