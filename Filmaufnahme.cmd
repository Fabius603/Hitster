@echo off
if exist "%~dp0desktop\publish\Hitster.Recorder.exe" (
    start "" "%~dp0desktop\publish\Hitster.Recorder.exe"
) else (
    powershell.exe -NoProfile -File "%~dp0desktop\Start-Recorder.ps1"
    if errorlevel 1 pause
)
