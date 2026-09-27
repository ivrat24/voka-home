#!/usr/bin/env python3
"""
Voka 本地开发服务：静态站点 + 笔记读写 API + GitHub 同步。

用法: python sync/server.py
打开: http://127.0.0.1:8765/index.html
"""

from __future__ import annotations

import base64
import binascii
import json
import mimetypes
import re
import shutil
import subprocess
import sys
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
NOTE_DIR = SITE / "note_content"
DIARY_DIR = SITE / "content" / "mouse-diary"
DIARY_CATEGORIES = {"备忘", "闲聊", "碎碎念", "更新计划", "更新公告", "心情贴", "待办"}
PLAN_CATEGORY = "更新计划"
TODO_CATEGORY = "待办"
TODO_TYPES = {"课程", "实验室", "组织", "生活"}
ANNOUNCE_CATEGORY = "更新公告"
MOOD_CATEGORY = "心情贴"
MOOD_MAX_LENGTH = 50
PUBLISH_SCRIPT = ROOT / "sync" / "publish.ps1"
BUILD_NOTES = ROOT / "sync" / "build-notes.py"
BUILD_ALL = ROOT / "sync" / "build-all.py"
BUILD_SITE_DATA = ROOT / "sync" / "build-site-data.py"
PORT = 8765
MATERIALS_DIR_NAME = "materials"

mimetypes.add_type("application/x-ipynb+json", ".ipynb")
mimetypes.add_type("application/zip", ".zip")
# Windows 默认常把 .mjs 判成 text/plain，浏览器会拒绝作为 ES module 执行
mimetypes.add_type("text/javascript", ".mjs")
mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("application/wasm", ".wasm")
MAX_MATERIAL_BYTES = 50 * 1024 * 1024
ALLOWED_MATERIAL_EXTENSIONS = {
    ".ipynb",
    ".pdf",
    ".zip",
    ".md",
    ".txt",
    ".doc",
    ".docx",
    ".ppt",
    ".pptx",
    ".xls",
    ".xlsx",
    ".csv",
    ".json",
    ".py",
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
}


def safe_note_path(rel: str) -> Path | None:
    rel = rel.replace("\\", "/").strip().lstrip("/")
    if not rel or ".." in rel.split("/"):
        return None
    if not rel.lower().endswith(".md"):
        rel = f"{rel}.md"
    target = (NOTE_DIR / rel).resolve()
    try:
        target.relative_to(NOTE_DIR.resolve())
    except ValueError:
        return None
    return target


def safe_folder_path(rel: str) -> Path | None:
    rel = rel.replace("\\", "/").strip().strip("/")
    if not rel or ".." in rel.split("/"):
        return None
    target = (NOTE_DIR / rel).resolve()
    try:
        target.relative_to(NOTE_DIR.resolve())
    except ValueError:
        return None
    return target


def safe_material_path(course: str, filename: str) -> Path | None:
    course = course.replace("\\", "/").strip().strip("/")
    filename = filename.replace("\\", "/").split("/")[-1].strip()
    if not course or not filename or ".." in course.split("/") or filename in (".", ".."):
        return None
    if Path(filename).suffix.lower() not in ALLOWED_MATERIAL_EXTENSIONS:
        return None
    target = (NOTE_DIR / course / MATERIALS_DIR_NAME / filename).resolve()
    materials_root = (NOTE_DIR / course / MATERIALS_DIR_NAME).resolve()
    try:
        target.relative_to(materials_root)
    except ValueError:
        return None
    return target


def collect_materials_for_course(course: str) -> list[dict]:
    course = course.replace("\\", "/").strip().strip("/")
    mat_dir = NOTE_DIR / course / MATERIALS_DIR_NAME
    items: list[dict] = []
    if not mat_dir.exists():
        return items
    for path in sorted(mat_dir.iterdir()):
        if not path.is_file():
            continue
        items.append(
            {
                "course": course,
                "filename": path.name,
                "path": f"note_content/{course}/{MATERIALS_DIR_NAME}/{path.name}",
                "size": path.stat().st_size,
            }
        )
    return items


def maybe_rebuild() -> None:
    try:
        rebuild_notes()
    except subprocess.CalledProcessError:
        pass


def maybe_rebuild_diary_export() -> None:
    try:
        subprocess.run([sys.executable, str(BUILD_SITE_DATA)], check=True, cwd=str(ROOT))
    except subprocess.CalledProcessError:
        pass


def collect_tree() -> dict:
    folders: set[str] = set()
    files: list[dict] = []

    if not NOTE_DIR.exists():
        return {"folders": [], "files": []}

    for path in sorted(NOTE_DIR.rglob("*.md")):
        rel = path.relative_to(NOTE_DIR).as_posix()
        if f"/{MATERIALS_DIR_NAME}/" in f"/{rel}/":
            continue
        slug = rel[:-3] if rel.endswith(".md") else rel
        parent = str(Path(rel).parent)
        if parent and parent != ".":
            parts = parent.split("/")
            for i in range(1, len(parts) + 1):
                folders.add("/".join(parts[:i]))
        raw = path.read_text(encoding="utf-8")
        title = slug.split("/")[-1]
        if raw.startswith("---"):
            parts = raw.split("---", 2)
            if len(parts) >= 3:
                for line in parts[1].splitlines():
                    if line.strip().startswith("title:"):
                        title = line.split(":", 1)[1].strip().strip("'\"")
                        break
        files.append({"path": rel, "slug": slug, "title": title})

    return {"folders": sorted(folders), "files": files}


def rebuild_notes() -> None:
    subprocess.run([sys.executable, str(BUILD_NOTES)], check=True, cwd=str(ROOT))


def rebuild_site() -> None:
    subprocess.run([sys.executable, str(BUILD_ALL)], check=True, cwd=str(ROOT))


def parse_frontmatter(raw: str) -> tuple[dict, str]:
    if not raw.startswith("---"):
        return {}, raw
    parts = raw.split("---", 2)
    if len(parts) < 3:
        return {}, raw
    meta: dict = {}
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
    return meta, parts[2].lstrip("\n")


def build_memo_markdown(meta: dict, body: str) -> str:
    lines = ["---"]
    for key in ("id", "title", "category", "favorite", "featured", "planned", "todoType", "created", "updated", "zone"):
        if key in meta and meta[key] is not None:
            value = meta[key]
            if isinstance(value, bool):
                lines.append(f"{key}: {'true' if value else 'false'}")
            else:
                lines.append(f"{key}: {value}")
    lines.append("---")
    lines.append("")
    lines.append(body.rstrip())
    lines.append("")
    return "\n".join(lines)


def safe_diary_path(rel: str) -> Path | None:
    rel = rel.replace("\\", "/").strip().lstrip("/")
    if not rel or ".." in rel.split("/"):
        return None
    if not rel.lower().endswith(".md"):
        rel = f"{rel}.md"
    target = (DIARY_DIR / rel).resolve()
    try:
        target.relative_to(DIARY_DIR.resolve())
    except ValueError:
        return None
    return target


def collect_diary_memos() -> list[dict]:
    memos: list[dict] = []
    if not DIARY_DIR.exists():
        return memos
    for path in sorted(DIARY_DIR.rglob("*.md")):
        if path.name == "welcome.md" and path.parent == DIARY_DIR:
            continue
        rel = path.relative_to(DIARY_DIR).as_posix()
        raw = path.read_text(encoding="utf-8")
        meta, body = parse_frontmatter(raw)
        category = str(meta.get("category") or path.parent.name)
        if category not in DIARY_CATEGORIES and path.parent != DIARY_DIR:
            category = path.parent.name
        memos.append(
            {
                "id": str(meta.get("id") or rel),
                "path": rel,
                "title": str(meta.get("title") or path.stem),
                "category": category,
                "favorite": bool(meta.get("favorite")),
                "featured": bool(meta.get("featured")),
                "plannedAt": str(meta.get("planned") or ""),
                "todoType": str(meta.get("todoType") or ""),
                "createdAt": str(meta.get("created") or ""),
                "updatedAt": str(meta.get("updated") or meta.get("created") or ""),
                "content": body.strip(),
            }
        )

    def memo_timestamp(item: dict) -> float:
        raw = item.get("updatedAt") or item.get("createdAt") or ""
        try:
            return datetime.fromisoformat(str(raw).replace("Z", "+00:00")).timestamp()
        except ValueError:
            return 0.0

    def planned_timestamp(item: dict) -> float:
        raw = item.get("plannedAt") or item.get("updatedAt") or item.get("createdAt") or ""
        try:
            return datetime.fromisoformat(str(raw).replace("Z", "+00:00")).timestamp()
        except ValueError:
            return float("inf")

    def sort_default(items: list[dict]) -> None:
        items.sort(
            key=lambda item: (
                0 if item.get("favorite") else 1,
                -memo_timestamp(item),
            )
        )

    def sort_plans(items: list[dict]) -> None:
        items.sort(
            key=lambda item: (
                0 if item.get("favorite") else 1,
                planned_timestamp(item),
            )
        )

    plans = [m for m in memos if m.get("category") == PLAN_CATEGORY]
    todos = [m for m in memos if m.get("category") == TODO_CATEGORY]
    announcements = [m for m in memos if m.get("category") == ANNOUNCE_CATEGORY]
    moods = [m for m in memos if m.get("category") == MOOD_CATEGORY]
    others = [
        m
        for m in memos
        if m.get("category") not in (PLAN_CATEGORY, TODO_CATEGORY, ANNOUNCE_CATEGORY, MOOD_CATEGORY)
    ]

    sort_plans(plans)
    sort_plans(todos)
    sort_default(announcements)
    moods.sort(key=lambda item: -memo_timestamp(item))
    sort_default(others)

    return plans + todos + announcements + moods + others


def clear_mood_featured(except_path: str | None = None) -> None:
    mood_dir = DIARY_DIR / MOOD_CATEGORY
    if not mood_dir.exists():
        return
    for path in mood_dir.rglob("*.md"):
        rel = path.relative_to(DIARY_DIR).as_posix()
        if except_path and rel == except_path:
            continue
        raw = path.read_text(encoding="utf-8")
        meta, body = parse_frontmatter(raw)
        if not meta.get("featured"):
            continue
        meta["featured"] = False
        meta["updated"] = datetime.now().astimezone().isoformat(timespec="seconds")
        path.write_text(build_memo_markdown(meta, body), encoding="utf-8")


def collect_mood_stickers() -> list[dict]:
    return [m for m in collect_diary_memos() if m.get("category") == MOOD_CATEGORY]


HOME_ANNOUNCEMENTS_LIMIT = 5


def pick_announcements_for_home(announcements: list[dict], limit: int = HOME_ANNOUNCEMENTS_LIMIT) -> list[dict]:
    def ts(item: dict) -> float:
        raw = item.get("updatedAt") or item.get("createdAt") or ""
        try:
            return datetime.fromisoformat(str(raw).replace("Z", "+00:00")).timestamp()
        except ValueError:
            return 0.0

    sorted_items = sorted(
        announcements,
        key=lambda item: (0 if item.get("favorite") else 1, -ts(item)),
    )
    return sorted_items[: max(1, limit)]


def _memo_signature(memo: dict) -> str:
    return f"{memo.get('category')}::{memo.get('title')}::{(memo.get('content') or '')[:120]}"


def clear_announcement_files() -> int:
    announce_dir = DIARY_DIR / ANNOUNCE_CATEGORY
    if not announce_dir.exists():
        return 0
    removed = 0
    for path in announce_dir.glob("*.md"):
        path.unlink(missing_ok=True)
        removed += 1
    return removed


def import_diary_memos_for_sync(memos: list[dict], *, replace_announcements: bool = False) -> int:
    if not memos and not replace_announcements:
        return 0

    if replace_announcements:
        clear_announcement_files()

    existing = collect_diary_memos()
    existing_ids = {str(m.get("id")) for m in existing if m.get("id")}
    existing_sigs = {_memo_signature(m) for m in existing}

    imported = 0
    for raw in memos:
        if not isinstance(raw, dict):
            continue
        category = str(raw.get("category") or "备忘").strip()
        content = str(raw.get("content") or "").strip()
        if category not in DIARY_CATEGORIES or not content:
            continue
        if category == MOOD_CATEGORY and len(content) > MOOD_MAX_LENGTH:
            continue

        memo_id = str(raw.get("id") or "").strip() or f"memo-{datetime.now().strftime('%Y%m%d%H%M%S%f')}"
        signature = _memo_signature(
            {"category": category, "title": raw.get("title") or "", "content": content},
        )
        if memo_id in existing_ids or signature in existing_sigs:
            continue

        title = str(raw.get("title") or "").strip()
        if not title:
            if category == ANNOUNCE_CATEGORY:
                title = f"更新公告 {datetime.now().strftime('%Y-%m-%d %H:%M')}"
            elif category == MOOD_CATEGORY:
                title = f"心情贴 {datetime.now().strftime('%m-%d %H:%M')}"
            else:
                title = f"{category} {datetime.now().strftime('%Y-%m-%d %H:%M')}"

        now = datetime.now().astimezone().isoformat(timespec="seconds")
        created = str(raw.get("createdAt") or raw.get("created") or now)
        updated = str(raw.get("updatedAt") or raw.get("updated") or created)
        planned = str(raw.get("plannedAt") or raw.get("planned") or "").strip()
        todo_type = str(raw.get("todoType") or "").strip()
        featured = bool(raw.get("featured")) if category == MOOD_CATEGORY else False

        if category == TODO_CATEGORY:
            if not planned or todo_type not in TODO_TYPES:
                continue

        if category == MOOD_CATEGORY and featured:
            clear_mood_featured()

        rel = f"{category}/{new_diary_filename(title)}"
        target = safe_diary_path(rel)
        if not target:
            continue

        meta = {
            "id": memo_id,
            "title": title,
            "category": category,
            "favorite": bool(raw.get("favorite")),
            "created": created,
            "updated": updated,
            "zone": "mouse-diary",
        }
        if featured:
            meta["featured"] = True
        if planned:
            meta["planned"] = planned
        if category == TODO_CATEGORY and todo_type:
            meta["todoType"] = todo_type

        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(build_memo_markdown(meta, content), encoding="utf-8")
        existing_ids.add(memo_id)
        existing_sigs.add(signature)
        imported += 1

    if imported or replace_announcements:
        maybe_rebuild_diary_export()
    return imported


def pick_mood_for_home(moods: list[dict]) -> dict | None:
    if not moods:
        return None
    featured = [m for m in moods if m.get("featured")]
    if featured:
        return featured[0]

    def ts(item: dict) -> float:
        raw = item.get("createdAt") or item.get("updatedAt") or ""
        try:
            return datetime.fromisoformat(str(raw).replace("Z", "+00:00")).timestamp()
        except ValueError:
            return 0.0

    return max(moods, key=ts)


def slugify_name(text: str) -> str:
    cleaned = re.sub(r"[^\w\u4e00-\u9fff-]+", "-", text.strip())
    cleaned = re.sub(r"-{2,}", "-", cleaned).strip("-")
    return cleaned[:48] or "memo"


def new_diary_filename(title: str) -> str:
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    return f"{stamp}-{slugify_name(title)}.md"


class VokaHandler(BaseHTTPRequestHandler):
    server_version = "VokaDev/1.0"

    def log_message(self, fmt, *args):
        print(f"[dev] {fmt % args}")

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = unquote(parsed.path)

        if path == "/api/notes/health":
            return self._json(200, {"ok": True, "mode": "server"})
        if path == "/api/diary/health":
            return self._json(200, {"ok": True, "mode": "server"})
        if path == "/api/diary/memos":
            return self._json(200, {"memos": collect_diary_memos()})
        if path == "/api/diary/announcements":
            items = [m for m in collect_diary_memos() if m.get("category") == ANNOUNCE_CATEGORY]
            return self._json(200, {"announcements": pick_announcements_for_home(items)})
        if path == "/api/diary/mood-board":
            moods = collect_mood_stickers()
            picked = pick_mood_for_home(moods)
            return self._json(200, {"mood": picked, "moods": moods})
        if path == "/api/notes/tree":
            return self._json(200, collect_tree())
        if path.startswith("/api/notes/materials"):
            qs = parse_qs(parsed.query)
            course = (qs.get("course") or [""])[0]
            if not course:
                return self._json(400, {"error": "缺少 course 参数"})
            return self._json(200, {"materials": collect_materials_for_course(course)})
        if path.startswith("/api/notes/file"):
            qs = parse_qs(parsed.query)
            rel = (qs.get("path") or [""])[0]
            target = safe_note_path(rel)
            if not target or not target.exists():
                return self._json(404, {"error": "笔记不存在"})
            return self._json(200, {"path": target.relative_to(NOTE_DIR).as_posix(), "content": target.read_text(encoding="utf-8")})

        return self._serve_static(path)

    def do_POST(self):
        parsed = urlparse(self.path)
        path = unquote(parsed.path)
        data = self._read_json()

        if path == "/sync":
            return self._handle_sync(data)
        if path == "/api/notes/rebuild":
            try:
                rebuild_notes()
                return self._json(200, {"ok": True, "tree": collect_tree()})
            except subprocess.CalledProcessError as exc:
                return self._json(500, {"error": str(exc)})
        if path == "/api/diary/import-memos":
            memos = data.get("memos") or data.get("diaryMemos") or []
            if not isinstance(memos, list):
                return self._json(400, {"error": "memos 必须是数组"})
            replace = bool(data.get("replaceAnnouncements", True))
            announces = [m for m in memos if isinstance(m, dict) and m.get("category") == ANNOUNCE_CATEGORY]
            imported = import_diary_memos_for_sync(memos if not replace else announces, replace_announcements=replace)
            home = pick_announcements_for_home(
                [m for m in collect_diary_memos() if m.get("category") == ANNOUNCE_CATEGORY]
            )
            return self._json(
                200,
                {
                    "ok": True,
                    "imported": imported,
                    "announcementCount": len(home),
                    "announcements": home,
                },
            )
        if path == "/api/diary/memos":
            category = (data.get("category") or "备忘").strip()
            content = (data.get("content") or "").strip()
            if category not in DIARY_CATEGORIES:
                return self._json(400, {"error": "无效的栏目"})
            if not content:
                return self._json(400, {"error": "内容不能为空"})
            title = (data.get("title") or "").strip() or f"{category} {datetime.now().strftime('%Y-%m-%d %H:%M')}"
            now = datetime.now().astimezone().isoformat(timespec="seconds")
            memo_id = (data.get("id") or "").strip() or f"memo-{datetime.now().strftime('%Y%m%d%H%M%S%f')}"
            planned = (data.get("plannedAt") or data.get("planned") or "").strip()
            if category == PLAN_CATEGORY and not planned:
                return self._json(400, {"error": "更新计划需要填写计划时间"})
            todo_type = (data.get("todoType") or "").strip()
            if category == TODO_CATEGORY:
                if not planned:
                    return self._json(400, {"error": "待办需要填写日期"})
                if todo_type not in TODO_TYPES:
                    return self._json(400, {"error": "请选择待办类型：课程 / 实验室 / 组织 / 生活"})
            if category == ANNOUNCE_CATEGORY:
                title = (data.get("title") or "").strip() or f"更新公告 {datetime.now().strftime('%Y-%m-%d %H:%M')}"
            if category == MOOD_CATEGORY:
                if len(content) > MOOD_MAX_LENGTH:
                    return self._json(400, {"error": f"心情贴不能超过 {MOOD_MAX_LENGTH} 字"})
                title = f"心情贴 {datetime.now().strftime('%m-%d %H:%M')}"
            filename = new_diary_filename(title)
            rel = f"{category}/{filename}"
            target = safe_diary_path(rel)
            if not target:
                return self._json(400, {"error": "无效的文件路径"})
            featured = bool(data.get("featured")) if category == MOOD_CATEGORY else False
            if category == MOOD_CATEGORY and featured:
                clear_mood_featured()
            meta = {
                "id": memo_id,
                "title": title,
                "category": category,
                "favorite": bool(data.get("favorite")),
                "created": now,
                "updated": now,
                "zone": "mouse-diary",
            }
            if featured:
                meta["featured"] = True
            if planned:
                meta["planned"] = planned
            if category == TODO_CATEGORY and todo_type:
                meta["todoType"] = todo_type
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(build_memo_markdown(meta, content), encoding="utf-8")
            maybe_rebuild_diary_export()
            return self._json(
                201,
                {
                    "ok": True,
                    "memo": {
                        "id": memo_id,
                        "path": rel,
                        "title": title,
                        "category": category,
                        "favorite": bool(data.get("favorite")),
                        "featured": featured,
                        "plannedAt": planned,
                        "todoType": todo_type if category == TODO_CATEGORY else "",
                        "createdAt": now,
                        "updatedAt": now,
                        "content": content,
                    },
                },
            )
        if path == "/api/notes/materials":
            course = (data.get("course") or "").strip()
            filename = (data.get("filename") or "").strip()
            content_b64 = data.get("contentBase64") or ""
            if not course or not filename or not content_b64:
                return self._json(400, {"error": "缺少 course、filename 或 contentBase64"})
            if Path(filename).suffix.lower() not in ALLOWED_MATERIAL_EXTENSIONS:
                allowed = " ".join(sorted(ALLOWED_MATERIAL_EXTENSIONS))
                return self._json(400, {"error": f"不支持的文件格式，请上传：{allowed}"})
            target = safe_material_path(course, filename)
            if not target:
                return self._json(400, {"error": "无效的文件路径"})
            try:
                raw = base64.b64decode(content_b64)
            except (ValueError, binascii.Error):
                return self._json(400, {"error": "文件内容无效"})
            if len(raw) > MAX_MATERIAL_BYTES:
                return self._json(400, {"error": "文件过大（上限 50MB）"})
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(raw)
            maybe_rebuild()
            material = {
                "course": course,
                "filename": target.name,
                "path": f"note_content/{course}/{MATERIALS_DIR_NAME}/{target.name}",
                "size": target.stat().st_size,
            }
            return self._json(201, {"ok": True, "material": material})
        if path == "/api/notes/materials/rename":
            course = (data.get("course") or "").strip()
            old_name = (data.get("from") or data.get("oldName") or "").strip()
            new_name = (data.get("to") or data.get("newName") or "").strip()
            if not course or not old_name or not new_name:
                return self._json(400, {"error": "缺少 course、from 或 to"})
            src = safe_material_path(course, old_name)
            dst = safe_material_path(course, new_name)
            if not src or not dst or not src.exists():
                return self._json(404, {"error": "源文件不存在"})
            if dst.exists():
                return self._json(409, {"error": "目标文件名已存在"})
            dst.parent.mkdir(parents=True, exist_ok=True)
            src.rename(dst)
            maybe_rebuild()
            return self._json(
                200,
                {
                    "ok": True,
                    "material": {
                        "course": course,
                        "filename": dst.name,
                        "path": f"note_content/{course}/{MATERIALS_DIR_NAME}/{dst.name}",
                        "size": dst.stat().st_size,
                    },
                },
            )
        if path == "/api/notes/folder":
            folder = (data.get("path") or "").replace("\\", "/").strip().strip("/")
            if not folder or ".." in folder.split("/"):
                return self._json(400, {"error": "无效的文件夹路径"})
            target = NOTE_DIR / folder
            target.mkdir(parents=True, exist_ok=True)
            return self._json(200, {"ok": True, "path": folder})
        if path == "/api/notes/file":
            rel = (data.get("path") or "").replace("\\", "/").strip()
            target = safe_note_path(rel)
            if not target:
                return self._json(400, {"error": "无效的文件路径"})
            if target.exists():
                return self._json(409, {"error": "文件已存在"})
            content = data.get("content") or ""
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content, encoding="utf-8")
            try:
                rebuild_notes()
            except subprocess.CalledProcessError:
                pass
            rel_posix = target.relative_to(NOTE_DIR).as_posix()
            return self._json(201, {"ok": True, "path": rel_posix, "slug": rel_posix[:-3]})
        if path == "/api/notes/move":
            from_path = (data.get("from") or "").replace("\\", "/").strip()
            to_folder = (data.get("toFolder") or "").replace("\\", "/").strip().strip("/")
            if ".." in from_path.split("/") or ".." in to_folder.split("/"):
                return self._json(400, {"error": "无效的路径"})
            src = safe_note_path(from_path)
            if not src or not src.exists():
                return self._json(404, {"error": "源文件不存在"})
            name = src.name
            dest_rel = f"{to_folder}/{name}" if to_folder else name
            dest = safe_note_path(dest_rel)
            if not dest:
                return self._json(400, {"error": "无效的目标路径"})
            if dest.exists():
                return self._json(409, {"error": "目标位置已存在同名文件"})
            dest.parent.mkdir(parents=True, exist_ok=True)
            src.rename(dest)
            maybe_rebuild()
            rel_posix = dest.relative_to(NOTE_DIR).as_posix()
            return self._json(200, {"ok": True, "path": rel_posix, "from": from_path})
        if path == "/api/notes/rename":
            kind = (data.get("type") or "file").strip().lower()
            rel = (data.get("path") or "").replace("\\", "/").strip().strip("/")
            new_name = (data.get("newName") or "").replace("\\", "/").strip().strip("/")
            if not rel or not new_name or ".." in rel.split("/") or ".." in new_name.split("/"):
                return self._json(400, {"error": "无效的路径"})
            if kind == "folder":
                if "/" in new_name:
                    return self._json(400, {"error": "文件夹名称不能包含 /"})
                src = safe_folder_path(rel)
                if not src or not src.exists() or not src.is_dir():
                    return self._json(404, {"error": "文件夹不存在"})
                dest = src.parent / new_name
                try:
                    dest.resolve().relative_to(NOTE_DIR.resolve())
                except ValueError:
                    return self._json(400, {"error": "无效的目标路径"})
                if dest.exists():
                    return self._json(409, {"error": "目标文件夹已存在"})
                src.rename(dest)
                maybe_rebuild()
                dest_rel = dest.relative_to(NOTE_DIR).as_posix()
                return self._json(200, {"ok": True, "path": dest_rel, "from": rel, "type": "folder"})
            new_name = new_name.split("/")[-1]
            if not new_name.lower().endswith(".md"):
                new_name = f"{new_name}.md"
            src = safe_note_path(rel)
            if not src or not src.exists() or not src.is_file():
                return self._json(404, {"error": "源文件不存在"})
            dest = src.parent / new_name
            try:
                dest.resolve().relative_to(NOTE_DIR.resolve())
            except ValueError:
                return self._json(400, {"error": "无效的目标路径"})
            if dest.exists():
                return self._json(409, {"error": "目标位置已存在同名文件"})
            src.rename(dest)
            maybe_rebuild()
            dest_rel = dest.relative_to(NOTE_DIR).as_posix()
            return self._json(200, {"ok": True, "path": dest_rel, "from": rel, "type": "file"})

        return self.send_error(404)

    def do_DELETE(self):
        parsed = urlparse(self.path)
        path = unquote(parsed.path)
        qs = parse_qs(parsed.query)

        if path == "/api/notes/file":
            rel = (qs.get("path") or [""])[0]
            target = safe_note_path(rel)
            if not target or not target.exists():
                return self._json(404, {"error": "笔记不存在"})
            target.unlink()
            maybe_rebuild()
            return self._json(200, {"ok": True, "path": rel})
        if path == "/api/diary/memos":
            rel = (qs.get("path") or [""])[0]
            target = safe_diary_path(rel)
            if not target or not target.exists():
                return self._json(404, {"error": "备忘不存在"})
            target.unlink()
            maybe_rebuild_diary_export()
            return self._json(200, {"ok": True, "path": rel})
        if path == "/api/notes/materials":
            qs = parse_qs(parsed.query)
            course = (qs.get("course") or [""])[0]
            filename = (qs.get("file") or qs.get("filename") or [""])[0]
            target = safe_material_path(course, filename)
            if not target or not target.exists():
                return self._json(404, {"error": "资料不存在"})
            target.unlink()
            maybe_rebuild()
            return self._json(200, {"ok": True, "path": target.relative_to(NOTE_DIR).as_posix()})
        if path == "/api/notes/folder":
            rel = (qs.get("path") or [""])[0]
            target = safe_folder_path(rel)
            if not target or not target.exists():
                return self._json(404, {"error": "文件夹不存在"})
            if not target.is_dir():
                return self._json(400, {"error": "不是文件夹"})
            shutil.rmtree(target)
            maybe_rebuild()
            return self._json(200, {"ok": True, "path": rel})

        return self.send_error(404)

    def do_PUT(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/diary/memos":
            data = self._read_json()
            rel = (data.get("path") or "").replace("\\", "/").strip()
            target = safe_diary_path(rel)
            if not target or not target.exists():
                return self._json(404, {"error": "备忘不存在"})
            raw = target.read_text(encoding="utf-8")
            meta, body = parse_frontmatter(raw)
            content = data.get("content")
            if content is not None:
                body = str(content)
            if data.get("title") is not None:
                meta["title"] = str(data.get("title") or meta.get("title") or target.stem)
            if data.get("favorite") is not None:
                meta["favorite"] = bool(data.get("favorite"))
            if data.get("featured") is not None:
                featured = bool(data.get("featured"))
                category = str(meta.get("category") or data.get("category") or "备忘")
                if featured and category == MOOD_CATEGORY:
                    clear_mood_featured(rel)
                    meta["featured"] = True
                else:
                    meta["featured"] = featured
            if data.get("plannedAt") is not None or data.get("planned") is not None:
                planned = (data.get("plannedAt") or data.get("planned") or "").strip()
                if planned:
                    meta["planned"] = planned
                elif "planned" in meta:
                    del meta["planned"]
            if data.get("todoType") is not None:
                todo_type = str(data.get("todoType") or "").strip()
                if todo_type:
                    meta["todoType"] = todo_type
                elif "todoType" in meta:
                    del meta["todoType"]
            category = (data.get("category") or meta.get("category") or "备忘").strip()
            if category not in DIARY_CATEGORIES:
                return self._json(400, {"error": "无效的栏目"})
            if category == TODO_CATEGORY:
                planned_check = str(meta.get("planned") or "").strip()
                type_check = str(meta.get("todoType") or "").strip()
                if not planned_check:
                    return self._json(400, {"error": "待办需要填写日期"})
                if type_check not in TODO_TYPES:
                    return self._json(400, {"error": "请选择待办类型：课程 / 实验室 / 组织 / 生活"})
            if category == MOOD_CATEGORY and content is not None and len(str(content)) > MOOD_MAX_LENGTH:
                return self._json(400, {"error": f"心情贴不能超过 {MOOD_MAX_LENGTH} 字"})
            meta["category"] = category
            meta["updated"] = datetime.now().astimezone().isoformat(timespec="seconds")
            meta.setdefault("zone", "mouse-diary")
            meta.setdefault("id", target.stem)
            new_rel = f"{category}/{target.name}"
            new_target = safe_diary_path(new_rel)
            if not new_target:
                return self._json(400, {"error": "无效的目标路径"})
            new_target.parent.mkdir(parents=True, exist_ok=True)
            new_target.write_text(build_memo_markdown(meta, body), encoding="utf-8")
            if new_target.resolve() != target.resolve():
                target.unlink()
            maybe_rebuild_diary_export()
            return self._json(
                200,
                {
                    "ok": True,
                    "memo": {
                        "id": str(meta.get("id")),
                        "path": new_rel,
                        "title": str(meta.get("title")),
                        "category": category,
                        "favorite": bool(meta.get("favorite")),
                        "featured": bool(meta.get("featured")),
                        "plannedAt": str(meta.get("planned") or ""),
                        "todoType": str(meta.get("todoType") or ""),
                        "createdAt": str(meta.get("created") or ""),
                        "updatedAt": str(meta.get("updated") or ""),
                        "content": body.strip(),
                    },
                },
            )
        if parsed.path != "/api/notes/file":
            return self.send_error(404)
        data = self._read_json()
        rel = (data.get("path") or "").replace("\\", "/").strip()
        content = data.get("content")
        if content is None:
            return self._json(400, {"error": "缺少 content"})
        target = safe_note_path(rel)
        if not target:
            return self._json(400, {"error": "无效的文件路径"})
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        try:
            rebuild_notes()
        except subprocess.CalledProcessError:
            pass
        rel_posix = target.relative_to(NOTE_DIR).as_posix()
        return self._json(200, {"ok": True, "path": rel_posix, "slug": rel_posix[:-3]})

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", 0))
        if not length:
            return {}
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except json.JSONDecodeError:
            return {}

    def _handle_sync(self, data: dict):
        username = (data.get("username") or "").strip()
        password = (data.get("password") or "").strip()
        repo = (data.get("repo") or "voka-home").strip()
        create_repo = data.get("createRepo", True)
        enable_pages = data.get("enablePages", True)

        if not username or not password:
            return self._json(400, {"error": "缺少用户名或 Token"})

        diary_memos = data.get("diaryMemos")
        imported_diary = 0
        if isinstance(diary_memos, list) and diary_memos:
            imported_diary = import_diary_memos_for_sync(
                diary_memos,
                replace_announcements=True,
            )

        try:
            rebuild_site()
        except subprocess.CalledProcessError as exc:
            return self._json(500, {"error": f"站点构建失败，请检查本地笔记与 sync/build-all.py 输出（exit {exc.returncode}）"})

        project_root = ROOT.parent.parent.parent
        cmd = [
            "powershell", "-ExecutionPolicy", "Bypass",
            "-File", str(PUBLISH_SCRIPT),
            "-Username", username, "-Token", password, "-Repo", repo,
        ]
        if create_repo:
            cmd.append("-CreateRepo")
        if enable_pages:
            cmd.append("-EnablePages")

        try:
            result = subprocess.run(
                cmd,
                cwd=str(project_root),
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=300,
            )
            if result.returncode != 0:
                err = (result.stderr or "").strip() or (result.stdout or "").strip() or "发布脚本执行失败"
                return self._json(500, {"error": err})
            pages_url = f"https://{username}.github.io/{repo}/"
            if repo.endswith(".github.io"):
                pages_url = f"https://{username}.github.io/"
            return self._json(200, {
                "message": "已根据本地内容构建并发布，GitHub Actions 将更新读者端站点",
                "pagesUrl": pages_url,
                "repoUrl": f"https://github.com/{username}/{repo}",
                "built": True,
                "importedDiary": imported_diary,
            })
        except subprocess.TimeoutExpired:
            return self._json(500, {"error": "同步超时（>5 分钟）"})
        except Exception as exc:
            return self._json(500, {"error": str(exc)})

    def _json(self, code: int, payload: dict):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _serve_static(self, url_path: str):
        if url_path in ("", "/"):
            url_path = "/index.html"
        rel = url_path.lstrip("/")
        target = (SITE / rel).resolve()
        try:
            target.relative_to(SITE.resolve())
        except ValueError:
            return self.send_error(403)
        if target.is_dir():
            target = target / "index.html"
        if not target.exists() or not target.is_file():
            return self.send_error(404)
        mime, _ = mimetypes.guess_type(str(target))
        suffix = target.suffix.lower()
        if suffix in {".js", ".mjs"}:
            mime = "text/javascript; charset=utf-8"
        elif suffix == ".css":
            mime = "text/css; charset=utf-8"
        elif suffix == ".json":
            mime = "application/json; charset=utf-8"
        elif suffix == ".wasm":
            mime = "application/wasm"
        content = target.read_bytes()
        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", mime or "application/octet-stream")
        self.send_header("Content-Length", str(len(content)))
        if suffix in {".js", ".mjs", ".css", ".html"}:
            self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(content)


def main():
    NOTE_DIR.mkdir(parents=True, exist_ok=True)
    DIARY_DIR.mkdir(parents=True, exist_ok=True)
    for name in DIARY_CATEGORIES:
        (DIARY_DIR / name).mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(("127.0.0.1", PORT), VokaHandler)
    print(f"Voka dev server: http://127.0.0.1:{PORT}/")
    print(f"  站点目录: {SITE}")
    print(f"  笔记 API: http://127.0.0.1:{PORT}/api/notes/")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
        sys.exit(0)


if __name__ == "__main__":
    main()
