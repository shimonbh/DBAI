"""
PyInstaller entry point for the DBAI backend.
Do NOT use --reload here; frozen executables cannot hot-reload.
"""
import multiprocessing
import os
import sys


def main() -> None:
    import uvicorn
    from backend.main import app  # noqa: PLC0415

    host = os.getenv("DBAI_HOST", "127.0.0.1")
    port = int(os.getenv("DBAI_PORT", "8000"))
    uvicorn.run(app, host=host, port=port, log_level="warning")


if __name__ == "__main__":
    # freeze_support() must be the first call in __main__ on Windows
    multiprocessing.freeze_support()
    main()
