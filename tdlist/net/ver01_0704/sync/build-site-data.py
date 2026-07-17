#!/usr/bin/env python3
"""Bundle JSON configs into js/site-data.js for file:// (offline) usage."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
OUT = SITE / "js" / "site-data.js"
CSS_DIR = SITE / "css"
HOME_ANNOUNCEMENTS_LIMIT = 5

SOURCES = {
    "siteConfig": SITE / "config" / "site.json",
    "noteManifest": SITE / "note_content" / "manifest.json",
    "agentUpdates": SITE / "content" / "agent-lab" / "updates.json",
    "playlist": SITE / "static" / "music" / "playlist.json",
}


def read_json(path: Path):
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def collect_note_sources() -> dict[str, str]:
    sources: dict[str, str] = {}
    note_dir = SITE / "note_content"
    if not note_dir.exists():
        return sources
    for path in sorted(note_dir.rglob("*.md")):
        rel = path.relative_to(note_dir).as_posix()
        sources[rel] = path.read_text(encoding="utf-8")
    return sources


def collect_pdf_export_css() -> str:
    parts: list[str] = []
    katex = CSS_DIR / "katex.min.css"
    pdf = CSS_DIR / "pdf-export.css"
    if katex.exists():
        parts.append(katex.read_text(encoding="utf-8"))
    if pdf.exists():
        parts.append(pdf.read_text(encoding="utf-8"))
    return "\n".join(parts).strip()


def _parse_diary_md(path: Path, diary_dir: Path, category: str) -> dict:
    raw = path.read_text(encoding="utf-8")
    meta: dict = {}
    body = raw
    if raw.startswith("---"):
        parts = raw.split("---", 2)
        if len(parts) >= 3:
            body = parts[2].lstrip("\n")
            for line in parts[1].splitlines():
                if ":" not in line:
                    continue
                key, value = line.split(":", 1)
                key = key.strip()
                value = value.strip().strip("'\"")
                if value.lower() in ("true", "false"):
                    meta[key] = value.lower() == "true"
                else:
                    meta[key] = value
    rel = path.relative_to(diary_dir).as_posix()
    return {
        "id": str(meta.get("id") or rel),
        "path": rel,
        "title": str(meta.get("title") or path.stem),
        "category": category,
        "favorite": bool(meta.get("favorite")),
        "featured": bool(meta.get("featured")),
        "plannedAt": str(meta.get("planned") or ""),
        "createdAt": str(meta.get("created") or ""),
        "updatedAt": str(meta.get("updated") or meta.get("created") or ""),
        "content": body.strip(),
    }


def _diary_timestamp(item: dict) -> float:
    raw = item.get("updatedAt") or item.get("createdAt") or ""
    try:
        return datetime.fromisoformat(str(raw).replace("Z", "+00:00")).timestamp()
    except ValueError:
        return 0.0


HOME_ANNOUNCEMENTS_LIMIT = 5
DIARY_CONTENT_DIR = SITE / "content" / "mouse-diary"


def collect_all_diary_announcements() -> list[dict]:
    items: list[dict] = []
    if not DIARY_CONTENT_DIR.exists():
        return items

    for path in sorted(DIARY_CONTENT_DIR.rglob("*.md")):
        if path.name == "welcome.md" and path.parent == DIARY_CONTENT_DIR:
            continue
        item = _parse_diary_md(path, DIARY_CONTENT_DIR, path.parent.name)
        category = str(item.get("category") or path.parent.name)
        if category != "更新公告":
            continue
        item["category"] = "更新公告"
        items.append(item)

    items.sort(key=lambda item: (0 if item.get("favorite") else 1, -_diary_timestamp(item)))
    return items


def collect_diary_announcements(limit: int = HOME_ANNOUNCEMENTS_LIMIT) -> list[dict]:
    return collect_all_diary_announcements()[: max(1, limit)]


def write_diary_public_json(announcements: list[dict], mood: dict | None) -> None:
    DIARY_CONTENT_DIR.mkdir(parents=True, exist_ok=True)
    generated_at = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
    (DIARY_CONTENT_DIR / "announcements.json").write_text(
        json.dumps(
            {"generatedAt": generated_at, "announcements": announcements},
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    (DIARY_CONTENT_DIR / "mood-board.json").write_text(
        json.dumps({"generatedAt": generated_at, "mood": mood}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"Wrote {DIARY_CONTENT_DIR / 'announcements.json'}")
    print(f"Wrote {DIARY_CONTENT_DIR / 'mood-board.json'}")


def collect_diary_mood_board() -> dict | None:
    mood_dir = DIARY_CONTENT_DIR / "心情贴"
    if not mood_dir.exists():
        return None

    moods = [_parse_diary_md(path, DIARY_CONTENT_DIR, "心情贴") for path in mood_dir.rglob("*.md")]
    if not moods:
        return None

    featured = [m for m in moods if m.get("featured")]
    if featured:
        return featured[0]
    return max(moods, key=_diary_timestamp)


def main() -> None:
    all_announcements = collect_all_diary_announcements()
    home_announcements = all_announcements[:HOME_ANNOUNCEMENTS_LIMIT]
    mood_board = collect_diary_mood_board()
    # 读者端首页只读最多 5 条（收藏/置顶优先，再按时间）
    write_diary_public_json(home_announcements, mood_board)

    payload = {
        "generatedAt": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
        "siteConfig": read_json(SOURCES["siteConfig"]),
        "noteManifest": read_json(SOURCES["noteManifest"]),
        "agentUpdates": read_json(SOURCES["agentUpdates"]),
        "playlist": read_json(SOURCES["playlist"]),
        "noteSources": collect_note_sources(),
        "pdfExportCss": collect_pdf_export_css(),
        "diaryAnnouncements": home_announcements,
        "diaryMoodBoard": mood_board,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    body = json.dumps(payload, ensure_ascii=False, indent=2)
    OUT.write_text(
        "/** Auto-generated by sync/build-site-data.py — do not edit */\n"
        f"export const SITE_DATA = {body};\n",
        encoding="utf-8",
    )
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
