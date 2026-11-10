@echo off
setlocal
where node >nul 2>nul
if errorlevel 1 (
    echo Zum lokalen Drucken wird Node.js benoetigt: https://nodejs.org/
    pause
    exit /b 1
)
cd /d "%~dp0"
node scripts\serve.cjs --open-cards
if errorlevel 1 pause
