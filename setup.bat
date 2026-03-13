@echo off
REM DBAI Setup — installs all dependencies

echo === DBAI Setup ===
echo.

REM ── Python backend ──────────────────────────────────────────────────────────
echo [1/3] Installing Python dependencies...
python -m pip install -r backend/requirements.txt
if errorlevel 1 (echo ERROR: pip install failed & pause & exit /b 1)
echo Python dependencies installed.
echo.

REM ── Frontend ────────────────────────────────────────────────────────────────
echo [2/3] Installing frontend dependencies...
cd frontend
npm install
if errorlevel 1 (echo ERROR: npm install failed & pause & exit /b 1)
cd ..
echo Frontend dependencies installed.
echo.

REM ── .env ────────────────────────────────────────────────────────────────────
echo [3/3] Checking .env...
if not exist ".env" (
  copy ".env.example" ".env"
  echo .env created from .env.example. Please edit it and add your API keys.
) else (
  echo .env already exists.
)
echo.

echo === Setup complete! ===
echo.
echo Next steps:
echo  1. Edit .env and add your AI provider API key(s)
echo  2. Run start.bat to launch DBAI
echo.
pause
