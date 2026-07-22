@echo off
setlocal
cd /d "%~dp0\.."

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or is not available in PATH.
  echo Install Node.js, then run this file again.
  pause
  exit /b 1
)

where hugo >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Hugo Extended is not installed or is not available in PATH.
  echo Install Hugo Extended, then run this file again.
  pause
  exit /b 1
)

echo Installing Wiki dependencies...
call npm install
if errorlevel 1 (
  echo [ERROR] npm install failed.
  pause
  exit /b 1
)

echo.
echo Setup complete.
pause
