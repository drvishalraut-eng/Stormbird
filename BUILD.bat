@echo off
setlocal
cd /d "%~dp0"
echo.
echo  ====================================================
echo   STORMBIRD BUILD
echo  ====================================================
echo.
echo [1/3] Installing dependencies...
call npm install --ignore-scripts
if %ERRORLEVEL% NEQ 0 ( echo FAILED: npm install & pause & exit /b 1 )
echo.
echo [2/3] Building UI...
call npm run build
if %ERRORLEVEL% NEQ 0 ( echo FAILED: npm build & pause & exit /b 1 )
echo.
echo [3/3] Packaging...
call npx electron-packager . Stormbird --platform=win32 --arch=x64 --out=dist-win --overwrite --no-asar --icon=build-assets/icon.ico --prune=true --ignore=src --ignore=dist-win
if %ERRORLEVEL% NEQ 0 ( echo FAILED: packaging & pause & exit /b 1 )
echo.
echo  ====================================================
echo   DONE: dist-win\Stormbird-win32-x64\Stormbird.exe
echo  ====================================================
echo.
pause
