@echo off
title BeerFlow POS
cd /d "%~dp0"
echo.
echo  BeerFlow POS starting...
echo  Browser will open at http://localhost:8080
echo  Is window ko band mat karna jab tak shop chalti ho.
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js install nahi hai.
  echo Download: https://nodejs.org
  pause
  exit /b 1
)
if not exist "node_modules\" (
  echo Pehli baar: packages install ho rahe hain...
  call npm install
)
start "" http://localhost:8080
call npm run dev
pause
