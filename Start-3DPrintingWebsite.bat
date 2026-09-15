@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title 3D Printing Website - Development Server

echo.
echo ==============================================
echo   3D Printing Website - Local Development
echo ==============================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js was not found.
  echo Install Node.js 22 LTS or newer from https://nodejs.org/
  echo Then close this window and run this launcher again.
  echo.
  pause
  exit /b 1
)

for /f "tokens=1,2 delims=." %%a in ('node -p "process.versions.node"') do (
  set NODE_MAJOR=%%a
  set NODE_MINOR=%%b
)

if %NODE_MAJOR% LSS 22 (
  echo [ERROR] Node.js 22.5 or newer is required.
  echo Your installed version is:
  node --version
  echo.
  pause
  exit /b 1
)

if %NODE_MAJOR% EQU 22 if %NODE_MINOR% LSS 5 (
  echo [ERROR] Node.js 22.5 or newer is required for the built-in SQLite database.
  echo Your installed version is:
  node --version
  echo.
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm was not found even though Node.js is installed.
  echo Reinstall Node.js and make sure npm is included.
  echo.
  pause
  exit /b 1
)

if not exist "package.json" (
  echo [ERROR] package.json was not found next to this launcher.
  echo Keep Start-3DPrintingWebsite.bat in the website's main folder.
  echo.
  pause
  exit /b 1
)

if not exist ".env.local" if exist ".env.example" (
  echo [SETUP] Creating .env.local from .env.example...
  copy /y ".env.example" ".env.local" >nul
)

if not exist "node_modules" (
  echo [SETUP] First run detected. Installing website dependencies...
  echo This only needs to happen once unless dependencies change.
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo [ERROR] npm install failed. Review the messages above.
    echo.
    pause
    exit /b 1
  )
  echo.
)

echo [START] Starting the website at http://localhost:3000
echo [INFO]  Your browser will open automatically when the site is ready.
echo [INFO]  Leave this window open while testing.
echo [INFO]  Press Ctrl+C here to stop the website.
echo.

start "" /b powershell.exe -NoProfile -WindowStyle Hidden -Command "$u='http://localhost:3000'; for($i=0; $i -lt 90; $i++){ try { $r=Invoke-WebRequest -UseBasicParsing -Uri $u -TimeoutSec 2; if($r.StatusCode -ge 200){ Start-Process $u; exit 0 } } catch {}; Start-Sleep -Seconds 1 }"

call npm run dev

if errorlevel 1 (
  echo.
  echo [ERROR] The development server stopped with an error.
  echo.
  pause
)

endlocal
