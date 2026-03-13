"""
DBAI Launcher -- starts the backend and optionally the frontend.
Performs pre-flight checks before launching:
  - Python version
  - Required packages installed
  - .env file exists and has at least one AI key
  - Node / npm available (for frontend)

Usage:
  python launch.py              # Start backend + open browser
  python launch.py --backend    # Backend only
  python launch.py --electron   # Backend + Electron desktop app
  python launch.py --check      # Pre-flight check only (no launch)
"""
import subprocess
import sys
import os
import time
import argparse
import threading
from pathlib import Path

# ── Force UTF-8 stdout/stderr on Windows (avoids cp1252 UnicodeEncodeError) ──
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# ── Paths ─────────────────────────────────────────────────────────────────────
ROOT        = Path(__file__).parent
BACKEND     = ROOT / "backend"
FRONTEND    = ROOT / "frontend"
ENV_FILE    = ROOT / ".env"
ENV_EXAMPLE = ROOT / ".env.example"

# ── Status tags -- plain ASCII, no colour codes (safe in any terminal) ────────
OK   = "[ OK ]"
WARN = "[ !! ]"
ERR  = "[ XX ]"
INFO = "[ .. ]"


# =============================================================================
# Pre-flight checks
# =============================================================================

def check_python_version() -> bool:
    major, minor = sys.version_info[:2]
    ok = major >= 3 and minor >= 11
    tag = OK if ok else ERR
    print(f"  {tag}  Python {major}.{minor}  (need 3.11+)")
    return ok


def check_packages() -> bool:
    """Verify critical Python packages are importable by the active interpreter."""
    packages = [
        ("fastapi",    "fastapi"),
        ("uvicorn",    "uvicorn"),
        ("sqlalchemy", "sqlalchemy"),
        ("dotenv",     "python-dotenv"),
        ("anthropic",  "anthropic"),
        ("openai",     "openai"),
    ]
    # Use sys.executable so the fix command always targets the right Python / venv
    pip_cmd = f'"{sys.executable}" -m pip install -r backend/requirements.txt'
    all_ok = True
    for module, pip_name in packages:
        try:
            __import__(module)
            print(f"  {OK}  {pip_name}")
        except ImportError:
            print(f"  {ERR}  {pip_name}  <-- run: {pip_cmd}")
            all_ok = False
    return all_ok


def check_env_file() -> bool:
    """Ensure .env exists and has at least one AI key set."""
    if not ENV_FILE.exists():
        if ENV_EXAMPLE.exists():
            import shutil
            shutil.copy(ENV_EXAMPLE, ENV_FILE)
            print(f"  {WARN}  .env created from template -- add your API key(s) before continuing")
        else:
            print(f"  {ERR}  .env not found")
        return False

    content = ENV_FILE.read_text(encoding="utf-8")
    ai_vars = [
        "ANTHROPIC_API_KEY", "OPENAI_API_KEY",
        "GEMINI_API_KEY",    "OPENROUTER_API_KEY",
    ]
    has_key = any(
        f"{var}=" in content and
        content.split(f"{var}=")[1].split("\n")[0].strip() not in ("", "your_key_here")
        for var in ai_vars
    )

    if has_key:
        print(f"  {OK}  .env found with at least one AI key set")
    else:
        print(f"  {WARN}  .env found but no AI provider key is configured")
        print(f"         Edit .env and set e.g.  ANTHROPIC_API_KEY=sk-ant-...")

    return True  # Missing key is a warning, not a hard blocker


def _find_npm() -> str:
    """Return the npm executable path, searching common Windows locations if needed."""
    # 1. Try npm on PATH first (works on macOS/Linux and correctly-configured Windows)
    try:
        subprocess.run(["npm", "--version"], capture_output=True, check=True)
        return "npm"
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass

    # 2. Search common Windows Node.js install locations
    candidates = [
        Path(os.environ.get("ProgramFiles", r"C:\Program Files")) / "nodejs" / "npm.cmd",
        Path(os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")) / "nodejs" / "npm.cmd",
        Path(os.environ.get("APPDATA", "")) / "npm" / "npm.cmd",
        Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "nodejs" / "npm.cmd",
        # nvm for Windows puts Node here by default
        Path(os.environ.get("APPDATA", "")) / "nvm" / "current" / "npm.cmd",
    ]
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)

    return ""  # Not found


_NPM_CMD: str = "npm"  # overwritten by check_npm() if found via fallback path


def check_npm() -> bool:
    """Check if npm is available and cache its path for later use."""
    global _NPM_CMD
    npm = _find_npm()
    if npm:
        try:
            result = subprocess.run(
                [npm, "--version"], capture_output=True, text=True, check=True,
            )
            _NPM_CMD = npm
            label = "" if npm == "npm" else f"  ({npm})"
            print(f"  {OK}  npm {result.stdout.strip()}{label}")
            return True
        except subprocess.CalledProcessError:
            pass
    print(f"  {WARN}  npm not found -- frontend unavailable (backend-only mode still works)")
    print(f"         Install Node.js from https://nodejs.org and ensure it is on your PATH")
    return False


def check_node_modules() -> bool:
    """Check if frontend dependencies are installed."""
    nm = FRONTEND / "node_modules"
    if nm.exists():
        print(f"  {OK}  frontend/node_modules installed")
        return True
    print(f"  {WARN}  frontend/node_modules missing -- run:  cd frontend && npm install")
    return False


def _npm_cmd() -> list[str]:
    """Return the npm executable as a list suitable for subprocess."""
    return [_NPM_CMD] if _NPM_CMD else ["npm"]


def run_preflight() -> dict:
    """Run all checks and return a results dict.

    Keys in 'critical' must all be True for the launcher to proceed.
    Keys in 'optional' produce warnings only (npm/frontend unavailable is non-fatal).
    """
    print("\n--- Pre-flight checks -------------------------------------------")
    results = {
        # Critical -- backend cannot start without these
        "python":   check_python_version(),
        "packages": check_packages(),
        "env":      check_env_file(),
        # Optional -- only needed for the frontend
        "npm":      check_npm(),
        "modules":  check_node_modules(),
    }
    print("-----------------------------------------------------------------\n")
    return results


# =============================================================================
# Launchers
# =============================================================================

def start_backend(blocking: bool = False):
    """Start the FastAPI backend with uvicorn.

    --reload-dir backend  restricts file-watching to the backend/ folder only,
    preventing launch.py / frontend changes from triggering spurious reloads.
    """
    cmd = [
        sys.executable, "-m", "uvicorn",
        "backend.main:app",
        "--host",       _env("DBAI_HOST", "127.0.0.1"),
        "--port",       _env("DBAI_PORT", "8000"),
        "--reload",
        "--reload-dir", str(BACKEND),   # <-- watch backend/ only
    ]
    print(f"{INFO}  Starting backend:  {' '.join(cmd)}")
    proc = subprocess.Popen(cmd, cwd=ROOT)
    if blocking:
        proc.wait()
        return None
    return proc


def wait_for_backend(timeout: int = 15) -> bool:
    """Poll /health until the backend responds."""
    import urllib.request
    port = _env("DBAI_PORT", "8000")
    url  = f"http://127.0.0.1:{port}/health"
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            urllib.request.urlopen(url, timeout=1)
            print(f"{OK}  Backend is ready at http://127.0.0.1:{port}")
            return True
        except Exception:
            time.sleep(0.5)
    print(f"{ERR}  Backend did not start within {timeout}s")
    return False


def start_frontend_dev(electron: bool = False):
    """Start the Vite dev server or Electron dev mode."""
    cmd   = _npm_cmd() + ["run", "electron:dev"] if electron else _npm_cmd() + ["run", "dev"]
    label = "Electron" if electron else "Vite dev server"
    print(f"{INFO}  Starting {label}: {' '.join(cmd)}")
    return subprocess.Popen(cmd, cwd=FRONTEND, shell=True)


def open_browser() -> None:
    """Open the default browser to the Vite dev URL."""
    import webbrowser
    url = "http://localhost:15173"
    time.sleep(3)   # Give Vite a moment to start
    print(f"{INFO}  Opening browser: {url}")
    webbrowser.open(url)


# =============================================================================
# Main
# =============================================================================

def main():
    parser = argparse.ArgumentParser(description="D.B.A.I Launcher")
    parser.add_argument("--backend",  action="store_true", help="Start backend only")
    parser.add_argument("--electron", action="store_true", help="Start backend + Electron")
    parser.add_argument("--check",    action="store_true", help="Pre-flight check only")
    args = parser.parse_args()

    print("\n+=========================================+")
    print("|  D.B.A.I -- Database IDE with AI Agent  |")
    print("+=========================================+")

    results = run_preflight()

    # Critical checks determine the exit code; npm/modules are warnings only
    critical_ok = results["python"] and results["packages"] and results["env"]

    if args.check:
        if critical_ok:
            print(f"{OK}  All critical checks passed.\n")
        else:
            print(f"{ERR}  Critical checks failed -- see above.\n")
        sys.exit(0 if critical_ok else 1)

    if not critical_ok:
        print(f"{ERR}  Critical checks failed. Fix the issues above and retry.\n")
        sys.exit(1)

    procs = []

    try:
        # Always start the backend
        backend_proc = start_backend(blocking=args.backend)
        if args.backend:
            return
        procs.append(backend_proc)

        # Wait for backend to be ready before starting frontend
        if not wait_for_backend():
            raise RuntimeError("Backend failed to start")

        if args.electron:
            if not results["npm"] or not results["modules"]:
                print(f"{WARN}  Electron not available -- try: cd frontend && npm install")
            else:
                procs.append(start_frontend_dev(electron=True))
        else:
            # Default: browser mode via Vite dev server
            if results["npm"] and results["modules"]:
                procs.append(start_frontend_dev(electron=False))
                threading.Thread(target=open_browser, daemon=True).start()
            else:
                port = _env("DBAI_PORT", "8000")
                print(f"{INFO}  Frontend unavailable. API docs: http://127.0.0.1:{port}/docs")

        print(f"\n{OK}  D.B.A.I is running. Press Ctrl+C to stop.\n")

        for p in procs:
            p.wait()

    except KeyboardInterrupt:
        print(f"\n{INFO}  Shutting down...")
    finally:
        for p in procs:
            try:
                p.terminate()
            except Exception:
                pass


def _env(key: str, default: str) -> str:
    """Read a value from .env (UTF-8) falling back to the OS environment."""
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith(f"{key}="):
                return line.split("=", 1)[1].strip()
    return os.getenv(key, default)


if __name__ == "__main__":
    main()
