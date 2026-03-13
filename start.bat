@echo off
REM DBAI — Quick Start
REM Runs launch.py which performs pre-flight checks then starts backend + frontend.
REM
REM Modes:
REM   start.bat              → backend + browser (Vite dev server)
REM   start.bat electron     → backend + Electron desktop app
REM   start.bat backend      → backend only (headless / API mode)
REM   start.bat check        → pre-flight checks only

cd /d %~dp0

if "%1"=="electron" (
    python launch.py --electron
) else if "%1"=="backend" (
    python launch.py --backend
) else if "%1"=="check" (
    python launch.py --check
) else (
    python launch.py
)
