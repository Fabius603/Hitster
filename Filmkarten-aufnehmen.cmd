@echo off
rem Nimmt Filmszenen aus einer Tabelle (wie filmquiz-vorbereitung\filme-150.html) nacheinander auf
rem und legt nach jeder Aufnahme die Hitster-Karte an.
rem Aufruf: HTML-Datei auf diese Datei ziehen, doppelklicken (nimmt die Liste fuer Version 2) oder
rem   Filmkarten-aufnehmen.cmd <datei.html> [--eintraege 1-5,8] [--trocken]
setlocal
where node >nul 2>nul
if errorlevel 1 (
    echo Fuer die Aufnahme wird Node.js benoetigt: https://nodejs.org/
    pause
    exit /b 1
)
if not "%~1"=="" (
    node "%~dp0filmquiz-vorbereitung\karten-aus-tabelle.mjs" %*
) else (
    node "%~dp0filmquiz-vorbereitung\karten-aus-tabelle.mjs"
)
echo.
pause
