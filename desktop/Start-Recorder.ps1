$ErrorActionPreference = 'Stop'
$project = Join-Path $PSScriptRoot 'Hitster.Recorder\Hitster.Recorder.csproj'
$executable = Join-Path $PSScriptRoot 'publish\Hitster.Recorder.exe'
if (Test-Path -LiteralPath $executable) {
    Start-Process -FilePath $executable -WorkingDirectory (Split-Path $PSScriptRoot -Parent) -WindowStyle Hidden
} else {
    dotnet run --project $project --configuration Release
    if ($LASTEXITCODE -ne 0) { throw 'Die App konnte nicht gestartet werden. Siehe Fehlermeldung oben.' }
}
