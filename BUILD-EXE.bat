@echo off
title Build BeerFlow POS EXE
cd /d "%~dp0"
echo.
echo ========================================
echo   BeerFlow POS - Windows EXE Build
echo ========================================
echo.
echo Step 1/4: npm install (pehli baar der lag sakti hai)...
call npm install
if errorlevel 1 goto fail

echo.
echo Step 2/4: Production build...
call npm run build
if errorlevel 1 goto fail

echo.
echo Step 3/4: Prepare web assets...
call node scripts\prepare-electron-web.mjs
if errorlevel 1 (
  echo prepare-web warning - continuing...
)

echo.
echo Step 4/4: electron-builder NSIS installer...
echo Installer thoda bada hoga (node_modules include) - intezar karein.
call npx electron-builder --win nsis
if errorlevel 1 goto fail

echo.
echo ========================================
echo   DONE
echo ========================================
echo.
echo Installer yahan hai:
echo   %cd%\release\BeerFlowPOS-Setup-1.1.0.exe
echo.
echo Install karke desktop icon se kholo.
echo Agar black screen aaye to pehle yeh folder mein npm run build
echo dubara chala kar BUILD-EXE.bat run karo.
echo.
explorer release
goto end

:fail
echo.
echo BUILD FAILED - upar error padhein.
pause
exit /b 1

:end
pause
