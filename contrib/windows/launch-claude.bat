@echo off
rem AgentProxy — launch Claude Code pointed at the local AgentProxy server (Windows).
rem Wraps the source-checkout CLI so no global install is needed.
rem
rem Usage: launch-claude.bat [project-folder] [AgentProxy launch args...]
setlocal enabledelayedexpansion
title Claude Code via AgentProxy
set "AGENTPROXY_ROOT=%~dp0..\.."

if exist "%~1\" (
  cd /d "%~1"
  shift
) else (
  set "PROJ="
  set /p "PROJ=Project folder (Enter = current: %CD%): "
  if not "!PROJ!"=="" cd /d "!PROJ!"
)

set "ARGS="
:collect
if "%~1"=="" goto run
set "ARGS=!ARGS! %1"
shift
goto collect

:run
rem bin/omniroute.mjs remains the source entrypoint for the current compatibility CLI.
node "%AGENTPROXY_ROOT%\bin\omniroute.mjs" launch!ARGS!
endlocal
pause
