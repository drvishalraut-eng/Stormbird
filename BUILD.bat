@echo off
setlocal enabledelayedexpansion

echo.
echo  ====================================================
echo   STORMBIRD BUILD SCRIPT - v0.1.0
echo  ====================================================
echo.

:: Move to the directory where this bat file lives
cd /d "%~dp0"
echo  Working directory: %CD%
echo.

:: Check Node
echo  Checking Node.js...
node --version
if %ERRORLEVEL% NEQ 0 (
  echo  [ERROR] Node.js not found or not in PATH.
  echo  Install from https://nodejs.org then restart Command Prompt.
  goto :fail
)

:: Check npm
echo  Checking npm...
npm --version
if %ERRORLEVEL% NEQ 0 (
  echo  [ERROR] npm not found.
  goto :fail
)

echo.
echo  [1/4] Installing dependencies...
call npm install --ignore-scripts
if %ERRORLEVEL% NEQ 0 (
  echo  [ERROR] npm install failed.
  goto :fail
)
echo  [OK] Dependencies installed.
echo.

echo  [2/4] Building React UI...
call npm run build
if %ERRORLEVEL% NEQ 0 (
  echo  [ERROR] Vite build failed.
  goto :fail
)
echo  [OK] UI built to dist/
echo.

echo  [3/4] Packaging Electron app...
call npx electron-packager . Stormbird --platform=win32 --arch=x64 --out=dist-win --overwrite --no-asar --icon=build-assets/icon.ico --prune=true --ignore=src --ignore=\.git --ignore=dist-win --ignore=node_modules/electron$ --ignore=node_modules/electron-packager --ignore=node_modules/vite --ignore=node_modules/@vitejs --ignore=node_modules/concurrently --ignore=node_modules/wait-on --ignore=node_modules/react$ --ignore=node_modules/react-dom --ignore=node_modules/esbuild --ignore=node_modules/rollup
if %ERRORLEVEL% NEQ 0 (
  echo  [ERROR] Packaging failed.
  goto :fail
)
echo  [OK] App packaged.
echo.

echo  [4/4] Verifying output...
if not exist "dist-win\Stormbird-win32-x64\Stormbird.exe" (
  echo  [ERROR] Stormbird.exe not found in output.
  goto :fail
)
if not exist "dist\index.html" (
  echo  [ERROR] dist\index.html not found.
  goto :fail
)
echo  [OK] Stormbird.exe found.
echo  [OK] dist\index.html found.
echo.

echo  ====================================================
echo   BUILD COMPLETE
echo   Output: dist-win\Stormbird-win32-x64\Stormbird.exe
echo  ====================================================
echo.
echo  Copy the entire Stormbird-win32-x64 folder to your USB drive.
echo  Run Stormbird.exe to launch.
echo.
goto :end

:fail
echo.
echo  BUILD FAILED - see error above.
echo.

:end
pause
