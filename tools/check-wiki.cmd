@echo off
setlocal
cd /d "%~dp0\.."

echo Checking stable IDs, relationships, timeline data, and source references...
echo.

call npm run wiki:validate
if errorlevel 1 (
  echo.
  echo [ERROR] Validation found problems. Check the messages above.
  pause
  exit /b 1
)

echo.
echo All checks passed.
pause
