# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec for the DBAI backend.
Run from the project root:  pyinstaller dbai.spec
"""
from PyInstaller.utils.hooks import collect_all, collect_submodules

block_cipher = None

# ── Collect packages that use dynamic/lazy imports ────────────────────────────
datas, binaries, hiddenimports = [], [], []

for pkg in ["uvicorn", "starlette", "fastapi", "anyio", "h11", "httptools", "websockets"]:
    d, b, h = collect_all(pkg)
    datas    += d
    binaries += b
    hiddenimports += h

# SQLAlchemy loads dialects dynamically
hiddenimports += collect_submodules("sqlalchemy")

# DB drivers
hiddenimports += [
    "pyodbc",
    "mysql.connector",
    "mysql.connector.plugins",
    "psycopg2",
    "sqlite3",
]

# AI provider SDKs (heavy packages — collect_all handles sub-modules)
for pkg in ["anthropic", "openai", "google.generativeai", "google.ai.generativelanguage"]:
    d, b, h = collect_all(pkg)
    datas    += d
    binaries += b
    hiddenimports += h

# Misc runtime deps
hiddenimports += [
    "dotenv",
    "pydantic",
    "pydantic.deprecated.class_validators",
    "multipart",
    "email.mime.text",
    "email.mime.multipart",
]

a = Analysis(
    ["run_server.py"],
    pathex=["."],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter", "matplotlib", "numpy", "pandas", "PIL"],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="dbai-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,  # No terminal window in production
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="dbai-backend",
)
