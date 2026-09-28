@echo off
rem AgentProxy — start the dev server from a source checkout (Windows).
rem Double-click, or run from any directory. Resolves the repo root from this file's location.
setlocal
title AgentProxy Server
cd /d "%~dp0..\.."
echo Starting AgentProxy on http://localhost:20128 ...
echo (Leave this window open. Close it to stop the server.)
call npm run dev
endlocal
pause
