@echo off
setlocal
cd /d "%~dp0\.."

echo Preparing Wiki data, building Hugo, and starting search preview...
echo Close this window or press Ctrl+C to stop the preview.
echo.

call npm run wiki:preview-search
if errorlevel 1 (
  echo.
  echo [ERROR] Preview failed. Check the messages above.
  pause
  exit /b 1
)
