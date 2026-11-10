param([switch]$SelfContained)
$ErrorActionPreference = 'Stop'
$project = Join-Path $PSScriptRoot 'Hitster.Recorder\Hitster.Recorder.csproj'
$output = Join-Path $PSScriptRoot 'publish'
if ($SelfContained) {
    dotnet publish $project --configuration Release --runtime win-x64 --self-contained true --output $output
} else {
    dotnet publish $project --configuration Release --self-contained false --output $output
}
if ($LASTEXITCODE -ne 0) { throw 'Die Windows-App konnte nicht erstellt werden.' }
Write-Host "Fertig: $output\Hitster.Recorder.exe"
