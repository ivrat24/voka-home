#!/usr/bin/env python3
"""Import diary memos from a JSON export into content/mouse-diary/."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "sync"))

from server import BUILD_SITE_DATA, import_diary_memos_for_sync  # noqa: E402


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python sync/import-diary-json.py <diary-export.json>")
        print("Export in browser console on http://127.0.0.1:8765 :")
        print("  copy(localStorage.getItem('voka-mouse-diary-memos'))")
        raise SystemExit(1)

    source = Path(sys.argv[1])
    raw = json.loads(source.read_text(encoding="utf-8"))
    memos = raw if isinstance(raw, list) else raw.get("memos") or raw.get("diaryMemos") or []
    if not isinstance(memos, list):
        raise SystemExit("JSON must be an array or contain memos/diaryMemos")

    imported = import_diary_memos_for_sync(memos)
    print(f"Imported {imported} diary memo(s).")

    subprocess.run([sys.executable, str(BUILD_SITE_DATA)], check=True, cwd=str(ROOT))
    print("Rebuilt announcements.json and site-data.js.")


if __name__ == "__main__":
    main()
