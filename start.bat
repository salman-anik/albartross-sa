@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js 20.9 or newer, then run this file again.
  pause
  exit /b 1
)

if not exist "node_modules\next\dist\bin\next" (
  echo Next.js packages are missing. Run npm install in this folder first.
  pause
  exit /b 1
)

start "Albatross Next.js" /min cmd /c "npm run dev"
endlocal
