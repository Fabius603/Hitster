@echo off
rem Nimmt Filmszenen aus einer Tabelle (wie filmquiz-vorbereitung\filme-150.html) nacheinander auf
rem und legt nach jeder Aufnahme die Hitster-Karte an.
rem Aufruf: HTML-Datei auf diese Datei ziehen, doppelklicken (fragt nach dem Pfad) oder
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
    set /p "HTML=Pfad zur HTML-Tabelle: "
    call node "%~dp0filmquiz-vorbereitung\karten-aus-tabelle.mjs" "%%HTML:"=%%"
)
echo.
pause
