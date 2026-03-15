"""
D.B.A.I distribution build script.

Produces a portable, no-install directory:
  - Windows : frontend/dist-electron/win-unpacked/D.B.A.I.exe
  - macOS   : frontend/dist-electron/D.B.A.I-<version>.dmg

The Python backend is NOT compiled — the app runs it with the system Python 3.12+.
Users must have Python 3.12+ installed (the app will show an error dialog if not).

Steps
-----
1. Compile Electron TypeScript  (tsc)
2. Bundle React/Vite frontend   (vite build)
3. Package with electron-builder (bundles Python source as extraResources)

Usage
-----
  python build.py
"""
import os
import subprocess
import sys
from pathlib import Path

ROOT     = Path(__file__).parent
FRONTEND = ROOT / "frontend"

OK   = "[ OK ]"
ERR  = "[ XX ]"
INFO = "[ .. ]"


def find_npm() -> str:
    for candidate in ["npm", "npm.cmd"]:
        try:
            subprocess.run([candidate, "--version"], capture_output=True, check=True)
            return candidate
        except (subprocess.CalledProcessError, FileNotFoundError):
            pass
    for path in [
        Path(os.environ.get("ProgramFiles", "")) / "nodejs" / "npm.cmd",
        Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "nodejs" / "npm.cmd",
        Path(os.environ.get("APPDATA", "")) / "nvm" / "current" / "npm.cmd",
    ]:
        if path.exists():
            return str(path)
    print(f"{ERR}  npm not found. Install Node.js from https://nodejs.org")
    sys.exit(1)


def main() -> None:
    print("\n+=============================================+")
    print("|  D.B.A.I -- Distribution Build             |")
    print("+=============================================+")
    print(f"\n{INFO}  Backend: bundled as Python source (requires Python 3.12+ on target machine)")

    npm = find_npm()

    env = {**os.environ, "CSC_IDENTITY_AUTO_DISCOVERY": "false"}
    print(f"\n{INFO}  Running: {npm} run electron:build")
    result = subprocess.run([npm, "run", "electron:build"], cwd=FRONTEND, env=env)
    if result.returncode != 0:
        print(f"\n{ERR}  Build failed (exit {result.returncode})")
        sys.exit(result.returncode)

    out = FRONTEND / "dist-electron" / "win-unpacked"
    print(f"\n{OK}  Done.  App folder: {out}")
    print(f"{INFO}  Run:   {out / 'D.B.A.I.exe'}\n")


if __name__ == "__main__":
    main()
