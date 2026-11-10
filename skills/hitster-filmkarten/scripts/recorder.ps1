param(
    [Parameter(Mandatory=$true)][string]$Project,
    [Parameter(Mandatory=$true)][ValidateSet('build','devices','record','session','inspect','cut','import','import-batch')][string]$Command,
    [Parameter(ValueFromRemainingArguments=$true)][string[]]$CliArgs
)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path -LiteralPath $Project).Path
if (-not (Test-Path -LiteralPath (Join-Path $repo 'desktop/Hitster.Recorder/Hitster.Recorder.csproj'))) {
    throw 'Hitster-Projekt mit desktop/Hitster.Recorder erforderlich.'
}
$artifacts = Join-Path $repo '.local/filmaufnahme/build'
$cliProject = Join-Path $PSScriptRoot 'RecorderCli/RecorderCli.csproj'
if ($Command -eq 'build') {
    & dotnet build $cliProject --configuration Release --artifacts-path $artifacts "-p:HitsterProject=$repo" --nologo
    if ($LASTEXITCODE -ne 0) { throw 'Recorder-CLI konnte nicht gebaut werden.' }
    exit 0
}
$dll = Join-Path $artifacts 'bin/RecorderCli/release/RecorderCli.dll'
if (-not (Test-Path -LiteralPath $dll)) { throw 'Zuerst recorder.ps1 -Command build ausführen.' }
& dotnet $dll $Command --project $repo @CliArgs
exit $LASTEXITCODE
