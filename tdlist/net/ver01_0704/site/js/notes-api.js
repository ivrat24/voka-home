import { parseFrontmatter, titleFromSlug } from "./markdown.js";
import { getSiteBasePath } from "./layout.js";
import { fetchJson, isFileProtocol, loadEmbeddedJson, canEditNotes } from "./runtime.js";

function titleFromNoteContent(path, content) {
  const slug = path.replace(/\.md$/i, "");
  const { meta } = parseFrontmatter(content);
  return String(meta.title || titleFromSlug(slug));
}

const DEFAULT_DEV_ORIGIN = "http://127.0.0.1:8765";
const FS_DB_NAME = "voka-notes-fs";
const FS_STORE = "handles";

/** @type {"server" | "filesystem" | "embedded" | null} */
let storageMode = null;
/** @type {FileSystemDirectoryHandle | null} */
let fsRootHandle = null;
/** @type {FileSystemDirectoryHandle | null} */
let siteFsHandle = null;

export function getDevServerOrigin() {
  try {
    const { protocol, hostname, port } = window.location;
    if (protocol.startsWith("http") && (hostname === "127.0.0.1" || hostname === "localhost") && port === "8765") {
      return window.location.origin;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_DEV_ORIGIN;
}

function getNotesApiRoot() {
  return `${getDevServerOrigin()}/api/notes`;
}

export function canUseDevServerFetch() {
  if (isFileProtocol()) return false;
  try {
    const { protocol, hostname, port } = window.location;
    return (
      protocol.startsWith("http") &&
      (hostname === "127.0.0.1" || hostname === "localhost") &&
      port === "8765"
    );
  } catch {
    return false;
  }
}

export async function fetchDevManifestJson() {
  if (canUseDevServerFetch()) {
    try {
      const res = await fetch(`${getDevServerOrigin()}/note_content/manifest.json`, {
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) return res.json();
    } catch {
      /* fall through */
    }
  }
  return readOrLoadManifestJson();
}

export function resetNotesStorageCache() {
  storageMode = null;
}

async function apiFetch(path, options = {}) {
  let res;
  try {
    res = await fetch(`${getNotesApiRoot()}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    });
  } catch {
    resetNotesStorageCache();
    throw new Error("无法连接本地服务。请确认已运行 python sync/server.py，或通过「连接 note_content」上传。");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 404 && typeof data.error !== "string") {
      resetNotesStorageCache();
      throw new Error("本地服务版本过旧，请关闭旧进程后重新运行 python sync/server.py");
    }
    throw new Error(data.error || `请求失败 (${res.status})`);
  }
  return data;
}

async function probeDevServer() {
  if (!canUseDevServerFetch()) return false;
  try {
    const health = await fetch(`${getNotesApiRoot()}/health`, { signal: AbortSignal.timeout(2000) });
    if (!health.ok) return false;
    const materials = await fetch(`${getNotesApiRoot()}/materials?course=__probe__`, {
      signal: AbortSignal.timeout(2000),
    });
    const contentType = materials.headers.get("content-type") || "";
    return materials.ok && contentType.includes("json");
  } catch {
    return false;
  }
}

async function tryFilesystemStorage() {
  fsRootHandle = await restoreDirectoryHandle("note_content");
  siteFsHandle = await restoreDirectoryHandle("site");
  if (fsRootHandle) {
    storageMode = "filesystem";
    return storageMode;
  }
  return null;
}

async function tryServerStorage() {
  if (!(await probeDevServer())) return null;
  storageMode = "server";
  return storageMode;
}

export async function detectNotesStorage(force = false) {
  if (storageMode && !force) {
    if (storageMode === "filesystem" && !fsRootHandle) {
      await tryFilesystemStorage();
    }
    return storageMode;
  }

  if (isFileProtocol()) {
    if (await tryFilesystemStorage()) return storageMode;
    if (await tryServerStorage()) return storageMode;
  } else {
    if (await tryServerStorage()) return storageMode;
    if (await tryFilesystemStorage()) return storageMode;
  }

  storageMode = "embedded";
  return storageMode;
}

export async function ensureWritableNotesStorage() {
  if (!canEditNotes()) throw new Error("当前为只读模式，无法上传");

  resetNotesStorageCache();
  let mode = await detectNotesStorage(true);

  if (mode === "embedded" && window.showDirectoryPicker) {
    const connect = window.confirm(
      isFileProtocol()
        ? "双击打开站点时，请先连接 note_content 文件夹才能上传资料。\n\n是否现在选择 site/note_content 文件夹？"
        : "尚未连接存储。\n\n可选：\n1. 运行 python sync/server.py 后刷新页面\n2. 现在选择 note_content 文件夹\n\n是否现在连接 note_content 文件夹？"
    );
    if (connect) {
      await connectNotesDirectory();
      resetNotesStorageCache();
      mode = await detectNotesStorage(true);
    }
  }

  if (mode === "embedded") {
    throw new Error(
      isFileProtocol()
        ? "请先点击「连接 note_content」并选择 site/note_content 文件夹"
        : "请先运行 python sync/server.py 并刷新，或连接 note_content 文件夹"
    );
  }
  return mode;
}

export function getNotesStorageMode() {
  return storageMode;
}

export async function connectNotesDirectory() {
  if (!window.showDirectoryPicker) {
    throw new Error("请使用 Chrome 或 Edge 浏览器，并通过双击 HTML 打开站点");
  }
  const handle = await window.showDirectoryPicker({ mode: "readwrite", id: "voka-note-content" });
  fsRootHandle = handle;
  await persistDirectoryHandle(handle);
  resetNotesStorageCache();
  storageMode = "filesystem";
  return handle.name;
}

async function openFsDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(FS_DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(FS_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function persistDirectoryHandle(handle, key = "note_content") {
  const db = await openFsDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(FS_STORE, "readwrite");
    tx.objectStore(FS_STORE).put(handle, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function hasSiteDirectory() {
  return Boolean(siteFsHandle);
}

export async function connectSiteDirectory() {
  if (!window.showDirectoryPicker) {
    throw new Error("请使用 Chrome 或 Edge 浏览器");
  }
  const handle = await window.showDirectoryPicker({ mode: "readwrite", id: "voka-site-root" });
  siteFsHandle = handle;
  await persistDirectoryHandle(handle, "site");
  return handle.name;
}

async function restoreDirectoryHandle(key = "note_content") {
  if (!window.showDirectoryPicker) return null;
  try {
    const db = await openFsDb();
    const handle = await new Promise((resolve, reject) => {
      const tx = db.transaction(FS_STORE, "readonly");
      const req = tx.objectStore(FS_STORE).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
    if (!handle) return null;
    const perm = await handle.queryPermission({ mode: "readwrite" });
    if (perm === "granted") return handle;
    const req = await handle.requestPermission({ mode: "readwrite" });
    return req === "granted" ? handle : null;
  } catch {
    return null;
  }
}

async function walkFsDir(dirHandle, prefix = "") {
  const folders = new Set();
  const files = [];

  for await (const [name, handle] of dirHandle.entries()) {
    if (name === "manifest.json") continue;
    const rel = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === "directory") {
      folders.add(rel);
      const nested = await walkFsDir(handle, rel);
      nested.folders.forEach((f) => folders.add(f));
      files.push(...nested.files);
    } else if (handle.kind === "file" && name.endsWith(".md")) {
      let title = name.replace(/\.md$/i, "");
      try {
        const file = await handle.getFile();
        title = titleFromNoteContent(rel, await file.text());
      } catch {
        /* keep filename */
      }
      files.push({ path: rel, slug: rel.replace(/\.md$/i, ""), title });
    }
  }
  return { folders: [...folders].sort(), files };
}

async function readFsFile(path) {
  if (!fsRootHandle) throw new Error("未连接笔记文件夹");
  const parts = path.replace(/\\/g, "/").split("/");
  let dir = fsRootHandle;
  for (const part of parts.slice(0, -1)) {
    dir = await dir.getDirectoryHandle(part);
  }
  const fileHandle = await dir.getFileHandle(parts.at(-1));
  const file = await fileHandle.getFile();
  return file.text();
}

async function writeFsFile(path, content) {
  if (!fsRootHandle) throw new Error("未连接笔记文件夹");
  const parts = path.replace(/\\/g, "/").split("/");
  let dir = fsRootHandle;
  for (const part of parts.slice(0, -1)) {
    dir = await dir.getDirectoryHandle(part, { create: true });
  }
  const fileHandle = await dir.getFileHandle(parts.at(-1), { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

async function createFsFolder(folderPath) {
  if (!fsRootHandle) throw new Error("未连接笔记文件夹");
  const parts = folderPath.replace(/\\/g, "/").split("/").filter(Boolean);
  let dir = fsRootHandle;
  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part, { create: true });
  }
}

async function fsFileExists(path) {
  try {
    await readFsFile(path);
    return true;
  } catch {
    return false;
  }
}

async function getFsDirForPath(path, create = false) {
  if (!fsRootHandle) throw new Error("未连接笔记文件夹");
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  let dir = fsRootHandle;
  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part, create ? { create: true } : undefined);
  }
  return dir;
}

async function deleteFsFile(path) {
  const parts = path.replace(/\\/g, "/").split("/");
  const fileName = parts.pop();
  let dir = fsRootHandle;
  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part);
  }
  await dir.removeEntry(fileName);
}

async function deleteFsFolder(folderPath) {
  const parts = folderPath.replace(/\\/g, "/").split("/").filter(Boolean);
  const folderName = parts.pop();
  let dir = fsRootHandle;
  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part);
  }
  await dir.removeEntry(folderName, { recursive: true });
}

async function moveFsFile(fromPath, toFolder) {
  const normalized = fromPath.endsWith(".md") ? fromPath : `${fromPath}.md`;
  const fileName = normalized.split("/").pop();
  const dest = toFolder ? `${toFolder}/${fileName}` : fileName;
  if (await fsFileExists(dest)) {
    throw new Error("目标位置已存在同名文件");
  }
  const content = await readFsFile(normalized);
  await writeFsFile(dest, content);
  await deleteFsFile(normalized);
  return dest;
}

async function moveFsFolderContents(fromFolder, toFolder) {
  const dir = await getFsDirForPath(fromFolder, false);
  for await (const [name, handle] of dir.entries()) {
    const fromPath = `${fromFolder}/${name}`;
    const destPath = `${toFolder}/${name}`;
    if (handle.kind === "directory") {
      await createFsFolder(destPath);
      await moveFsFolderContents(fromPath, destPath);
      await deleteFsFolder(fromPath);
    } else {
      const file = await handle.getFile();
      await writeFsFile(destPath, await file.text());
      await deleteFsFile(fromPath);
    }
  }
}

async function renameFsFile(path, newName) {
  let name = newName.trim();
  if (!name.toLowerCase().endsWith(".md")) name = `${name}.md`;
  if (name.includes("/") || name.includes("\\")) {
    throw new Error("文件名不能包含路径分隔符");
  }
  const normalized = path.endsWith(".md") ? path : `${path}.md`;
  const parent = normalized.includes("/") ? normalized.split("/").slice(0, -1).join("/") : "";
  const dest = parent ? `${parent}/${name}` : name;
  if (dest === normalized) return dest;
  if (await fsFileExists(dest)) {
    throw new Error("目标位置已存在同名文件");
  }
  const content = await readFsFile(normalized);
  await writeFsFile(dest, content);
  await deleteFsFile(normalized);
  return dest;
}

async function renameFsFolder(folderPath, newName) {
  const name = newName.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!name || name.includes("/")) {
    throw new Error("文件夹名称不能包含 /");
  }
  const folder = folderPath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  const parts = folder.split("/").filter(Boolean);
  const parent = parts.slice(0, -1).join("/");
  const destFolder = parent ? `${parent}/${name}` : name;
  if (destFolder === folder) return destFolder;
  try {
    await getFsDirForPath(destFolder, false);
    throw new Error("目标文件夹已存在");
  } catch (error) {
    if (error.message === "目标文件夹已存在") throw error;
  }
  await createFsFolder(destFolder);
  await moveFsFolderContents(folder, destFolder);
  await deleteFsFolder(folder);
  return destFolder;
}

async function embeddedSources() {
  const bundle = await loadEmbeddedJson("noteSources");
  return bundle && typeof bundle === "object" ? bundle : {};
}

export async function fetchNotesTree() {
  await detectNotesStorage();

  if (storageMode === "server") {
    return apiFetch("/tree");
  }

  if (storageMode === "filesystem" && fsRootHandle) {
    return walkFsDir(fsRootHandle);
  }

  const manifest = await readOrLoadManifestJson();
  if (manifest?.notes?.length) {
    return treeFromManifest(manifest);
  }

  const sources = await embeddedSources();
  const files = Object.keys(sources).map((path) => ({
    path,
    slug: path.replace(/\.md$/i, ""),
    title: titleFromNoteContent(path, sources[path]),
  }));
  const folders = new Set();
  for (const path of Object.keys(sources)) {
    const parent = path.includes("/") ? path.split("/").slice(0, -1).join("/") : "";
    if (parent) {
      const parts = parent.split("/");
      for (let i = 1; i <= parts.length; i += 1) {
        folders.add(parts.slice(0, i).join("/"));
      }
    }
  }
  return { folders: [...folders].sort(), files };
}

export async function readNoteFile(path) {
  await detectNotesStorage();
  const normalized = path.endsWith(".md") ? path : `${path}.md`;

  if (storageMode === "server") {
    const data = await apiFetch(`/file?path=${encodeURIComponent(normalized)}`);
    return { path: data.path, content: data.content };
  }

  if (storageMode === "filesystem" && fsRootHandle) {
    const content = await readFsFile(normalized);
    return { path: normalized, content };
  }

  const fetched = await fetchLocalNoteText(normalized);
  if (fetched != null) {
    return { path: normalized, content: fetched };
  }

  const sources = await embeddedSources();
  if (sources[normalized] != null) {
    return { path: normalized, content: sources[normalized] };
  }
  throw new Error("无法读取笔记，请连接 note_content 文件夹或启动 python sync/server.py");
}

export async function saveNoteFile(path, content) {
  if (!canEditNotes()) {
    throw new Error("当前为只读模式，无法保存笔记");
  }
  await detectNotesStorage();
  const normalized = path.endsWith(".md") ? path : `${path}.md`;

  if (storageMode === "server") {
    return apiFetch("/file", { method: "PUT", body: JSON.stringify({ path: normalized, content }) });
  }

  if (storageMode === "filesystem" && fsRootHandle) {
    await writeFsFile(normalized, content);
    return { ok: true, path: normalized, slug: normalized.replace(/\.md$/i, "") };
  }

  downloadMarkdown(normalized, content);
  throw new Error("离线模式无法直接写入磁盘，已下载 .md 文件，请放入 note_content/ 后运行 build-all.py");
}

export async function createNoteFolder(folderPath) {
  if (!canEditNotes()) {
    throw new Error("当前为只读模式，无法创建文件夹");
  }
  await detectNotesStorage();
  const folder = folderPath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");

  if (storageMode === "server") {
    return apiFetch("/folder", { method: "POST", body: JSON.stringify({ path: folder }) });
  }

  if (storageMode === "filesystem" && fsRootHandle) {
    await createFsFolder(folder);
    return { ok: true, path: folder };
  }

  throw new Error("请连接 note_content 文件夹或启动 python sync/server.py 以创建文件夹");
}

export async function createNoteFile(path, content) {
  if (!canEditNotes()) {
    throw new Error("当前为只读模式，无法创建文档");
  }
  await detectNotesStorage();
  const normalized = path.endsWith(".md") ? path : `${path}.md`;

  if (storageMode === "server") {
    return apiFetch("/file", { method: "POST", body: JSON.stringify({ path: normalized, content }) });
  }

  if (storageMode === "filesystem" && fsRootHandle) {
    if (await fsFileExists(normalized)) {
      throw new Error("文件已存在");
    }
    await writeFsFile(normalized, content);
    return { ok: true, path: normalized, slug: normalized.replace(/\.md$/i, "") };
  }

  downloadMarkdown(normalized, content);
  return { ok: true, path: normalized, downloaded: true };
}

export async function deleteNoteFile(path) {
  if (!canEditNotes()) throw new Error("当前为只读模式，无法删除");
  await detectNotesStorage();
  const normalized = path.endsWith(".md") ? path : `${path}.md`;

  if (storageMode === "server") {
    return apiFetch(`/file?path=${encodeURIComponent(normalized)}`, { method: "DELETE" });
  }
  if (storageMode === "filesystem" && fsRootHandle) {
    await deleteFsFile(normalized);
    return { ok: true, path: normalized };
  }
  throw new Error("请连接 note_content 文件夹或启动 python sync/server.py");
}

export async function deleteNoteFolder(folderPath) {
  if (!canEditNotes()) throw new Error("当前为只读模式，无法删除");
  await detectNotesStorage();
  const folder = folderPath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");

  if (storageMode === "server") {
    return apiFetch(`/folder?path=${encodeURIComponent(folder)}`, { method: "DELETE" });
  }
  if (storageMode === "filesystem" && fsRootHandle) {
    await deleteFsFolder(folder);
    return { ok: true, path: folder };
  }
  throw new Error("请连接 note_content 文件夹或启动 python sync/server.py");
}

export async function moveNoteFile(fromPath, toFolder = "") {
  if (!canEditNotes()) throw new Error("当前为只读模式，无法移动");
  await detectNotesStorage();
  const normalized = fromPath.endsWith(".md") ? fromPath : `${fromPath}.md`;
  const targetFolder = toFolder.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");

  if (storageMode === "server") {
    return apiFetch("/move", {
      method: "POST",
      body: JSON.stringify({ from: normalized, toFolder: targetFolder }),
    });
  }
  if (storageMode === "filesystem" && fsRootHandle) {
    const dest = await moveFsFile(normalized, targetFolder);
    return { ok: true, path: dest, from: normalized };
  }
  throw new Error("请连接 note_content 文件夹或启动 python sync/server.py");
}

export async function renameNoteFile(path, newName) {
  if (!canEditNotes()) throw new Error("当前为只读模式，无法重命名");
  await detectNotesStorage();
  const normalized = path.endsWith(".md") ? path : `${path}.md`;

  if (storageMode === "server") {
    return apiFetch("/rename", {
      method: "POST",
      body: JSON.stringify({ type: "file", path: normalized, newName }),
    });
  }
  if (storageMode === "filesystem" && fsRootHandle) {
    const dest = await renameFsFile(normalized, newName);
    return { ok: true, path: dest, from: normalized, type: "file" };
  }
  throw new Error("请连接 note_content 文件夹或启动 python sync/server.py");
}

export async function renameNoteFolder(folderPath, newName) {
  if (!canEditNotes()) throw new Error("当前为只读模式，无法重命名");
  await detectNotesStorage();
  const folder = folderPath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");

  if (storageMode === "server") {
    return apiFetch("/rename", {
      method: "POST",
      body: JSON.stringify({ type: "folder", path: folder, newName }),
    });
  }
  if (storageMode === "filesystem" && fsRootHandle) {
    const dest = await renameFsFolder(folder, newName);
    return { ok: true, path: dest, from: folder, type: "folder" };
  }
  throw new Error("请连接 note_content 文件夹或启动 python sync/server.py");
}

export async function tryLocalRebuild() {
  if (!canUseDevServerFetch()) return null;
  try {
    const res = await fetch(`${getNotesApiRoot()}/rebuild`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) return res.json();
  } catch {
    /* local server not running */
  }
  return null;
}

export async function rebuildNotesIndex() {
  const local = await tryLocalRebuild();
  if (local) return local;
  if (storageMode === "server") {
    return apiFetch("/rebuild", { method: "POST", body: "{}" });
  }
  return null;
}

export async function writeFsManifest(jsonText) {
  if (!fsRootHandle) throw new Error("未连接 note_content 文件夹");
  const fileHandle = await fsRootHandle.getFileHandle("manifest.json", { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(jsonText);
  await writable.close();
}

async function writeSiteRelativePath(relativePath, content) {
  if (!siteFsHandle) return false;
  const parts = relativePath.replace(/\\/g, "/").split("/").filter(Boolean);
  let dir = siteFsHandle;
  for (let i = 0; i < parts.length - 1; i += 1) {
    dir = await dir.getDirectoryHandle(parts[i], { create: true });
  }
  const fileHandle = await dir.getFileHandle(parts.at(-1), { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
  return true;
}

export async function writeSiteNotePage(slug, html) {
  const rel = `pages/notes/${slug}.html`.replace(/\\/g, "/");
  return writeSiteRelativePath(rel, html);
}

export async function deleteSiteNotePage(slug) {
  if (!siteFsHandle) return false;
  const rel = `pages/notes/${slug}.html`.replace(/\\/g, "/");
  const parts = rel.split("/").filter(Boolean);
  try {
    let dir = siteFsHandle;
    for (let i = 0; i < parts.length - 1; i += 1) {
      dir = await dir.getDirectoryHandle(parts[i]);
    }
    await dir.removeEntry(parts.at(-1));
    return true;
  } catch {
    return false;
  }
}

function downloadMarkdown(path, content) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = path.split("/").pop() || "note.md";
  a.click();
  URL.revokeObjectURL(url);
}

export function storageModeLabel(mode) {
  if (mode === "server") return "本地服务（可保存至 note_content/）";
  if (mode === "filesystem") return "已连接 note_content（可保存）";
  if (isFileProtocol()) return "双击打开 · 请连接 note_content 文件夹后保存";
  return "只读 / 下载模式";
}

const MATERIALS_DIR = "materials";

export const MATERIAL_ALLOWED_EXTENSIONS = [
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
];

export function materialFileExtension(filename = "") {
  const base = filename.replace(/\\/g, "/").split("/").pop() || "";
  const idx = base.lastIndexOf(".");
  return idx > 0 ? base.slice(idx).toLowerCase() : "";
}

export function isAllowedMaterialFilename(filename = "") {
  const ext = materialFileExtension(filename);
  return Boolean(ext && MATERIAL_ALLOWED_EXTENSIONS.includes(ext));
}

export function materialUploadAccept() {
  return MATERIAL_ALLOWED_EXTENSIONS.join(",");
}

export function materialFormatLabel(filename = "") {
  if (isNotebookMaterial(filename)) return "Notebook";
  if (/\.pdf$/i.test(filename)) return "PDF";
  if (/\.zip$/i.test(filename)) return "ZIP";
  return "";
}

export function resolveMaterialUrl(materialPath, basePath = "") {
  const normalized = (materialPath || "").replace(/^\//, "");
  return `${basePath}${normalized}`;
}

export async function readCourseMaterialFile(courseSlug, filename, basePath = "") {
  await detectNotesStorage();
  const rel = `${courseSlug}/${MATERIALS_DIR}/${filename}`;

  if (storageMode === "filesystem" && fsRootHandle) {
    return readFsFile(rel);
  }

  const tryUrls = [];
  if (canUseDevServerFetch()) {
    tryUrls.push(
      `${getDevServerOrigin()}/note_content/${courseSlug}/${MATERIALS_DIR}/${encodeURIComponent(filename)}`
    );
  } else {
    tryUrls.push(`${getDevServerOrigin()}/note_content/${courseSlug}/${MATERIALS_DIR}/${encodeURIComponent(filename)}`);
  }
  tryUrls.push(resolveMaterialUrl(`note_content/${courseSlug}/${MATERIALS_DIR}/${filename}`, basePath));

  let lastError = null;
  for (const url of tryUrls) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) return res.text();
      lastError = new Error(`HTTP ${res.status}`);
    } catch (error) {
      lastError = error;
    }
  }

  if (isFileProtocol()) {
    throw new Error("无法读取 Notebook。请返回课程页点击「连接 note_content」，或使用 python sync/server.py 打开站点。");
  }
  throw lastError || new Error("无法读取资料文件");
}

export function isNotebookMaterial(filename = "") {
  return /\.ipynb$/i.test(filename);
}

export function resolveNotebookViewerHref(courseSlug, filename, fromUrl = window.location.href) {
  const path = new URL(fromUrl, window.location.href).pathname;
  const query = `notebook-view.html?course=${encodeURIComponent(courseSlug)}&file=${encodeURIComponent(filename)}`;
  if (path.includes("/pages/")) return query;
  return `pages/${query}`;
}

export function resolveMaterialOpenHref(item, courseSlug, basePath = "", fromUrl = window.location.href) {
  if (isNotebookMaterial(item.filename)) {
    return resolveNotebookViewerHref(courseSlug, item.filename, fromUrl);
  }
  return resolveMaterialUrl(item.path, basePath);
}

export function materialKindIcon(filename = "") {
  if (isNotebookMaterial(filename)) return "📓";
  if (/\.pdf$/i.test(filename)) return "📄";
  if (/\.zip$/i.test(filename)) return "🗜️";
  return "📎";
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("无法读取文件"));
        return;
      }
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error("无法读取文件"));
    reader.readAsDataURL(file);
  });
}

async function writeFsBinary(relativePath, arrayBuffer) {
  if (!fsRootHandle) throw new Error("未连接 note_content 文件夹");
  const parts = relativePath.replace(/\\/g, "/").split("/").filter(Boolean);
  let dir = fsRootHandle;
  for (let i = 0; i < parts.length - 1; i += 1) {
    dir = await dir.getDirectoryHandle(parts[i], { create: true });
  }
  const fileHandle = await dir.getFileHandle(parts.at(-1), { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(arrayBuffer);
  await writable.close();
}

async function deleteFsBinary(relativePath) {
  const parts = relativePath.replace(/\\/g, "/").split("/").filter(Boolean);
  const fileName = parts.pop();
  let dir = fsRootHandle;
  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part);
  }
  await dir.removeEntry(fileName);
}

async function renameFsBinary(fromPath, toPath) {
  const fromParts = fromPath.replace(/\\/g, "/").split("/").filter(Boolean);
  let fromDir = fsRootHandle;
  for (const part of fromParts.slice(0, -1)) {
    fromDir = await fromDir.getDirectoryHandle(part);
  }
  const fileHandle = await fromDir.getFileHandle(fromParts.at(-1));
  const file = await fileHandle.getFile();
  await writeFsBinary(toPath, await file.arrayBuffer());
  await deleteFsBinary(fromPath);
}

async function getFsCourseMaterialsDir(courseSlug, create = false) {
  if (!fsRootHandle) throw new Error("未连接 note_content 文件夹");
  let dir = fsRootHandle;
  dir = await dir.getDirectoryHandle(courseSlug, { create });
  return dir.getDirectoryHandle(MATERIALS_DIR, { create });
}

async function readFsManifestJson() {
  if (!fsRootHandle) return null;
  try {
    const fileHandle = await fsRootHandle.getFileHandle("manifest.json");
    const file = await fileHandle.getFile();
    return JSON.parse(await file.text());
  } catch {
    return null;
  }
}

async function appendMaterialToFsManifest(material) {
  await syncFsMaterialsManifest();
}

async function scanAllMaterialsFromFilesystem() {
  if (!fsRootHandle) return [];
  const items = [];
  for await (const [courseName, handle] of fsRootHandle.entries()) {
    if (handle.kind !== "directory") continue;
    try {
      const matDir = await handle.getDirectoryHandle(MATERIALS_DIR);
      for await (const [filename, fileHandle] of matDir.entries()) {
        if (fileHandle.kind !== "file") continue;
        const file = await fileHandle.getFile();
        items.push({
          course: courseName,
          filename,
          path: `note_content/${courseName}/${MATERIALS_DIR}/${filename}`,
          size: file.size,
        });
      }
    } catch {
      /* course has no materials folder */
    }
  }
  items.sort((a, b) => {
    const byCourse = a.course.localeCompare(b.course);
    return byCourse !== 0 ? byCourse : a.filename.localeCompare(b.filename);
  });
  return items;
}

async function readOrLoadManifestJson() {
  const fromFs = await readFsManifestJson();
  if (fromFs) return fromFs;
  try {
    const basePath = getSiteBasePath();
    return await fetchJson(`${basePath}note_content/manifest.json`, "noteManifest");
  } catch {
    const embedded = await loadEmbeddedJson("noteManifest");
    return embedded ? structuredClone(embedded) : null;
  }
}

async function fetchLocalNoteText(path) {
  const normalized = path.endsWith(".md") ? path : `${path}.md`;
  const basePath = getSiteBasePath();
  const encodedPath = normalized.split("/").map((segment) => encodeURIComponent(segment)).join("/");
  try {
    const res = await fetch(`${basePath}note_content/${encodedPath}`, { cache: "no-store" });
    if (res.ok) return res.text();
  } catch {
    /* ignore */
  }
  return null;
}

function treeFromManifest(manifest) {
  const notes = Array.isArray(manifest?.notes) ? manifest.notes : [];
  const folders = new Set();
  const files = notes.map((note) => {
    const slug = String(note.slug || "");
    if (slug.includes("/")) {
      const parts = slug.split("/");
      for (let i = 1; i < parts.length; i += 1) {
        folders.add(parts.slice(0, i).join("/"));
      }
    }
    return {
      path: `${slug}.md`,
      slug,
      title: String(note.title || titleFromSlug(slug)),
    };
  });
  return { folders: [...folders].sort(), files };
}

export async function syncFsMaterialsManifest() {
  if (!fsRootHandle) return null;
  const manifest = await readOrLoadManifestJson();
  if (!manifest) return null;
  manifest.materials = await scanAllMaterialsFromFilesystem();
  manifest.generatedAt = new Date().toISOString().slice(0, 19);
  await writeFsManifest(JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}

async function listMaterialsFromFilesystem(courseSlug) {
  if (!fsRootHandle) return null;
  try {
    const matDir = await getFsCourseMaterialsDir(courseSlug, false);
    const items = [];
    for await (const [name, handle] of matDir.entries()) {
      if (handle.kind !== "file") continue;
      const file = await handle.getFile();
      items.push({
        course: courseSlug,
        filename: name,
        path: `note_content/${courseSlug}/${MATERIALS_DIR}/${name}`,
        size: file.size,
      });
    }
    return items.sort((a, b) => a.filename.localeCompare(b.filename));
  } catch {
    return null;
  }
}

async function listMaterialsFromManifest(courseSlug) {
  const fsManifest = await readFsManifestJson();
  if (fsManifest) {
    const materials = Array.isArray(fsManifest.materials) ? fsManifest.materials : [];
    const filtered = materials.filter((item) => item.course === courseSlug);
    if (filtered.length) return filtered;
  }
  const manifest = await loadEmbeddedJson("noteManifest");
  const materials = Array.isArray(manifest?.materials) ? manifest.materials : [];
  return materials.filter((item) => item.course === courseSlug);
}

export async function listCourseMaterials(courseSlug) {
  await detectNotesStorage();

  if (storageMode === "filesystem" && fsRootHandle) {
    const fromFs = await listMaterialsFromFilesystem(courseSlug);
    if (fromFs) return fromFs;
    return listMaterialsFromManifest(courseSlug);
  }

  if (storageMode === "server") {
    try {
      const data = await apiFetch(`/materials?course=${encodeURIComponent(courseSlug)}`);
      return data.materials || [];
    } catch {
      resetNotesStorageCache();
      const fromFs = await listMaterialsFromFilesystem(courseSlug);
      if (fromFs) {
        storageMode = "filesystem";
        return fromFs;
      }
      return listMaterialsFromManifest(courseSlug);
    }
  }

  return listMaterialsFromManifest(courseSlug);
}

export async function uploadCourseMaterial(courseSlug, file) {
  if (!canEditNotes()) throw new Error("当前为只读模式，无法上传");
  await ensureWritableNotesStorage();
  const filename = file.name.replace(/\\/g, "/").split("/").pop();
  if (!filename) throw new Error("无效的文件名");
  if (!isAllowedMaterialFilename(filename)) {
    throw new Error(`不支持的文件格式，请上传：${MATERIAL_ALLOWED_EXTENSIONS.join(" ")}`);
  }

  if (storageMode === "server") {
    const contentBase64 = await fileToBase64(file);
    const data = await apiFetch("/materials", {
      method: "POST",
      body: JSON.stringify({ course: courseSlug, filename, contentBase64 }),
    });
    return data.material;
  }

  if (storageMode === "filesystem" && fsRootHandle) {
    const rel = `${courseSlug}/${MATERIALS_DIR}/${filename}`;
    await writeFsBinary(rel, await file.arrayBuffer());
    const material = {
      course: courseSlug,
      filename,
      path: `note_content/${rel}`,
      size: file.size,
    };
    await appendMaterialToFsManifest(material);
    await tryLocalRebuild();
    return material;
  }

  throw new Error("请先运行 python sync/server.py 并刷新，或连接 note_content 文件夹");
}

export async function renameCourseMaterial(courseSlug, oldName, newName) {
  if (!canEditNotes()) throw new Error("当前为只读模式，无法重命名");
  await detectNotesStorage();
  if (!isAllowedMaterialFilename(newName)) {
    throw new Error(`不支持的文件格式，请使用：${MATERIAL_ALLOWED_EXTENSIONS.join(" ")}`);
  }

  if (storageMode === "server") {
    const data = await apiFetch("/materials/rename", {
      method: "POST",
      body: JSON.stringify({ course: courseSlug, from: oldName, to: newName }),
    });
    return data.material;
  }

  if (storageMode === "filesystem" && fsRootHandle) {
    const from = `${courseSlug}/${MATERIALS_DIR}/${oldName}`;
    const to = `${courseSlug}/${MATERIALS_DIR}/${newName}`;
    await renameFsBinary(from, to);
    await syncFsMaterialsManifest();
    await tryLocalRebuild();
    return {
      course: courseSlug,
      filename: newName,
      path: `note_content/${to}`,
    };
  }

  throw new Error("请连接 note_content 文件夹或启动 python sync/server.py");
}

export async function deleteCourseMaterial(courseSlug, filename) {
  if (!canEditNotes()) throw new Error("当前为只读模式，无法删除");
  await detectNotesStorage();

  if (storageMode === "server") {
    return apiFetch(
      `/materials?course=${encodeURIComponent(courseSlug)}&file=${encodeURIComponent(filename)}`,
      { method: "DELETE" },
    );
  }

  if (storageMode === "filesystem" && fsRootHandle) {
    await deleteFsBinary(`${courseSlug}/${MATERIALS_DIR}/${filename}`);
    await syncFsMaterialsManifest();
    await tryLocalRebuild();
    return { ok: true };
  }

  throw new Error("请连接 note_content 文件夹或启动 python sync/server.py");
}
