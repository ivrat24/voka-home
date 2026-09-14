import { getSiteBaseUrl } from "./layout.js";
import { isFileProtocol, isPublishedSite } from "./runtime.js";
import {
  createEmotionController,
  setCoreParamSafe,
} from "./live2d-emotion.js";

const MODEL_URL = "static/live2d/bear/model.model3.json";
const DEFAULT_EXPRESSION = "nowatermark";
/** 100% 滑块对应的基础布局（仅 CSS transform 负责用户缩放） */
const BASE_VISIBLE_FILL = 0.98;
const HEAD_PARAMS = {
  angleX: "ParamAngleX",
  angleY: "ParamAngleY",
  angleZ: "ParamAngleZ",
  bodyX: "ParamBodyAngleX",
  bodyY: "ParamBodyAngleY2",
  eyeX: "ParamEyeBallX",
  eyeY: "ParamEyeBallY",
};
const KNEE_LINE_RATIO = 0.72;
const LOOK_LERP = 0.14;
const SCRIPT_FILES = [
  "static/libs/live2dcubismcore.min.js",
  "static/libs/live2d.min.js",
  "static/libs/pixi.min.js",
  "static/libs/index.min.js",
];

const USER_MODEL_IDB_NAME = "voka-live2d";
const USER_MODEL_IDB_STORE = "userModel";
const USER_MODEL_IDB_KEY = "current";
const USER_MODEL_NAME_KEY = "voka-live2d-user-model-name";

/** @type {null | object} */
let petState = null;
let initPromise = null;
/** @type {string | null} */
let userModelName = null;

export function shouldUseBundledLive2DModel() {
  return !isPublishedSite();
}

export function hasUserLive2DModel() {
  return Boolean(petState?.model && petState?.modelSource === "user");
}

export function getUserLive2DModelName() {
  if (userModelName) return userModelName;
  return localStorage.getItem(USER_MODEL_NAME_KEY) || "";
}

function resolveAsset(basePath, file) {
  const base = basePath ? new URL(basePath, window.location.href).href : getSiteBaseUrl();
  return new URL(file, base).href;
}

function mimeForAssetKey(key) {
  if (key.endsWith(".png")) return "image/png";
  if (key.endsWith(".moc3")) return "application/octet-stream";
  return "application/json";
}

function base64ToBlobUrl(base64, key) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return URL.createObjectURL(new Blob([bytes], { type: mimeForAssetKey(key) }));
}

async function loadLive2DModelFromInline(Live2DModel) {
  let bundle;
  try {
    const mod = await import("./live2d-inline.js");
    bundle = mod.getLive2DInlineBundle();
  } catch (error) {
    console.warn("[Live2D] 内联资源未找到，请运行 python sync/build-all.py", error);
    throw error;
  }

  const blobs = {};
  for (const [key, data] of Object.entries(bundle.files ?? {})) {
    blobs[key] = base64ToBlobUrl(data, key);
  }

  const settings = structuredClone(bundle.settings);
  const refs = settings.FileReferences;
  refs.Moc = blobs["model.moc3"];
  refs.Physics = blobs["model.physics3.json"];
  refs.Textures = [blobs["textures/texture_00.png"]];
  if (Array.isArray(refs.Expressions)) {
    refs.Expressions = refs.Expressions.map((exp) => {
      const fileKey = exp.File?.replace(/^\.\//, "") ?? `expressions/${exp.Name}.exp3.json`;
      return {
        ...exp,
        File: blobs[fileKey] ?? blobs[`expressions/${exp.Name}.exp3.json`] ?? exp.File,
      };
    });
  }

  const settingsUrl = URL.createObjectURL(
    new Blob([JSON.stringify(settings)], { type: "application/json" }),
  );
  const model = await Live2DModel.from(settingsUrl, { autoInteract: false });
  URL.revokeObjectURL(settingsUrl);
  return model;
}

async function loadLive2DModel(basePath, Live2DModel) {
  if (isPublishedSite()) {
    throw new Error("Published site requires a user-provided Live2D model");
  }

  // HTTP 本地服务只用静态资源；失败时不要回退 27MB 内联包（会拖死整页）
  if (!isFileProtocol()) {
    const modelUrl = resolveAsset(basePath, MODEL_URL);
    return await Live2DModel.from(modelUrl, { autoInteract: false });
  }
  return loadLive2DModelFromInline(Live2DModel);
}

function normalizeModelPath(path) {
  return String(path || "").replace(/\\/g, "/").replace(/^\/+/, "");
}

function findModelEntry(entries) {
  const preferred = entries.find((entry) => /(^|\/)model\.model3\.json$/i.test(entry.path));
  if (preferred) return preferred;
  return entries.find((entry) => entry.path.endsWith(".model3.json"));
}

function resolveModelFileEntry(entries, refPath, modelDir) {
  const clean = normalizeModelPath(refPath).replace(/^\.\//, "");
  const candidates = [
    modelDir + clean,
    clean,
    ...entries.map((entry) => entry.path).filter((path) => path.endsWith(`/${clean}`) || path === clean),
  ];

  for (const candidate of candidates) {
    const normalized = normalizeModelPath(candidate);
    const match = entries.find((entry) => entry.path === normalized);
    if (match) return match;
  }

  const baseName = clean.split("/").pop();
  return entries.find((entry) => entry.path.endsWith(`/${baseName}`) || entry.path === baseName) ?? null;
}

function revokeBlobUrls(blobUrls) {
  Object.values(blobUrls ?? {}).forEach((url) => {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  });
}

async function loadLive2DModelFromUserFiles(fileList, Live2DModel) {
  const files = Array.from(fileList ?? []);
  if (!files.length) {
    throw new Error("未选择模型文件");
  }

  const entries = files.map((file) => ({
    path: normalizeModelPath(file.webkitRelativePath || file.name),
    file,
  }));

  const modelEntry = findModelEntry(entries);
  if (!modelEntry) {
    throw new Error("请选择包含 .model3.json 的 Live2D 模型文件夹");
  }

  const modelDir = modelEntry.path.includes("/")
    ? `${modelEntry.path.slice(0, modelEntry.path.lastIndexOf("/") + 1)}`
    : "";
  const blobUrls = {};

  const registerBlob = (key, file) => {
    const normalized = normalizeModelPath(key);
    if (!blobUrls[normalized]) {
      blobUrls[normalized] = URL.createObjectURL(file);
    }
    return blobUrls[normalized];
  };

  for (const entry of entries) {
    registerBlob(entry.path, entry.file);
    if (modelDir && entry.path.startsWith(modelDir)) {
      registerBlob(entry.path.slice(modelDir.length), entry.file);
    }
  }

  const settings = JSON.parse(await modelEntry.file.text());
  const refs = settings.FileReferences;
  if (!refs?.Moc) {
    throw new Error("模型配置无效：缺少 Moc 引用");
  }

  const mapRef = (refPath) => {
    const match = resolveModelFileEntry(entries, refPath, modelDir);
    if (!match) {
      throw new Error(`模型缺少文件：${refPath}`);
    }
    const relative = modelDir && match.path.startsWith(modelDir)
      ? match.path.slice(modelDir.length)
      : match.path;
    return registerBlob(relative, match.file);
  };

  refs.Moc = mapRef(refs.Moc);
  if (refs.Physics) refs.Physics = mapRef(refs.Physics);
  if (Array.isArray(refs.Textures)) refs.Textures = refs.Textures.map(mapRef);
  if (refs.Motions) {
    for (const group of Object.values(refs.Motions)) {
      if (!Array.isArray(group)) continue;
      group.forEach((motion) => {
        if (motion?.File) motion.File = mapRef(motion.File);
      });
    }
  }
  if (Array.isArray(refs.Expressions)) {
    refs.Expressions = refs.Expressions.map((expression) => ({
      ...expression,
      File: expression.File ? mapRef(expression.File) : expression.File,
    }));
  }

  const settingsUrl = URL.createObjectURL(
    new Blob([JSON.stringify(settings)], { type: "application/json" }),
  );

  try {
    const model = await Live2DModel.from(settingsUrl, { autoInteract: false });
    const folderName = modelDir.replace(/\/$/, "").split("/").filter(Boolean).pop()
      || modelEntry.path.split("/").slice(-2, -1)[0]
      || "自定义模型";
    return { model, modelName: folderName, blobUrls };
  } finally {
    URL.revokeObjectURL(settingsUrl);
  }
}

function openUserModelDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(USER_MODEL_IDB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(USER_MODEL_IDB_STORE)) {
        db.createObjectStore(USER_MODEL_IDB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("无法打开 Live2D 模型存储"));
  });
}

async function readUserModelRecord() {
  const db = await openUserModelDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(USER_MODEL_IDB_STORE, "readonly");
    const store = tx.objectStore(USER_MODEL_IDB_STORE);
    const request = store.get(USER_MODEL_IDB_KEY);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error ?? new Error("无法读取 Live2D 模型"));
    tx.oncomplete = () => db.close();
    tx.onerror = () => reject(tx.error ?? new Error("无法读取 Live2D 模型"));
  });
}

async function writeUserModelRecord(record) {
  const db = await openUserModelDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(USER_MODEL_IDB_STORE, "readwrite");
    const store = tx.objectStore(USER_MODEL_IDB_STORE);
    const request = store.put(record, USER_MODEL_IDB_KEY);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("无法保存 Live2D 模型"));
    tx.oncomplete = () => db.close();
    tx.onerror = () => reject(tx.error ?? new Error("无法保存 Live2D 模型"));
  });
}

async function deleteUserModelRecord() {
  const db = await openUserModelDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(USER_MODEL_IDB_STORE, "readwrite");
    const store = tx.objectStore(USER_MODEL_IDB_STORE);
    const request = store.delete(USER_MODEL_IDB_KEY);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("无法删除 Live2D 模型"));
    tx.oncomplete = () => db.close();
    tx.onerror = () => reject(tx.error ?? new Error("无法删除 Live2D 模型"));
  });
}

async function persistUserModelFiles(fileList, modelName) {
  const files = await Promise.all(
    Array.from(fileList).map(async (file) => ({
      path: normalizeModelPath(file.webkitRelativePath || file.name),
      type: file.type || "application/octet-stream",
      buffer: await file.arrayBuffer(),
    })),
  );

  await writeUserModelRecord({
    modelName,
    savedAt: new Date().toISOString(),
    files,
  });
  localStorage.setItem(USER_MODEL_NAME_KEY, modelName);
  userModelName = modelName;
}

function filesFromStoredRecord(record) {
  return record.files.map((item) => {
    const file = new File([item.buffer], item.path.split("/").pop() || "asset", {
      type: item.type || "application/octet-stream",
    });
    Object.defineProperty(file, "webkitRelativePath", {
      configurable: true,
      value: item.path,
    });
    return file;
  });
}

export async function tryRestoreUserLive2DModel(basePath = "", { visible = true, sizeScale = 1 } = {}) {
  if (!isPublishedSite()) return false;

  try {
    const record = await readUserModelRecord();
    if (!record?.files?.length) return false;
    userModelName = record.modelName || localStorage.getItem(USER_MODEL_NAME_KEY) || "";
    await loadUserLive2DModel(basePath, filesFromStoredRecord(record), {
      visible,
      sizeScale,
      persist: false,
    });
    return hasUserLive2DModel();
  } catch (error) {
    console.warn("[Live2D] 恢复读者模型失败:", error);
    return false;
  }
}

export async function loadUserLive2DModel(
  basePath = "",
  fileList,
  { visible = true, sizeScale = 1, persist = true } = {},
) {
  destroyLive2DPet();
  await bootLive2DPet(basePath, visible, sizeScale, {
    userFiles: fileList,
    useBundledModel: false,
  });

  if (!hasUserLive2DModel()) {
    throw new Error("模型加载失败");
  }

  if (persist && userModelName) {
    await persistUserModelFiles(fileList, userModelName);
  }
}

export async function clearUserLive2DModel() {
  destroyLive2DPet();
  userModelName = null;
  localStorage.removeItem(USER_MODEL_NAME_KEY);
  try {
    await deleteUserModelRecord();
  } catch (error) {
    console.warn("[Live2D] 删除本地模型缓存失败:", error);
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-live2d-src="${src}"]`)) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.dataset.live2dSrc = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`无法加载 ${src}`));
    document.head.appendChild(script);
  });
}

async function ensureLive2DScripts(basePath) {
  if (window.__live2dScriptsReady) return;
  for (const file of SCRIPT_FILES) {
    await loadScript(resolveAsset(basePath, file));
  }
  window.__live2dScriptsReady = true;
}

function waitForDomPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
}

async function createPixiApp(canvas, width, height) {
  const options = {
    view: canvas,
    width,
    height,
    backgroundAlpha: 0,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
  };

  const Application = window.PIXI.Application;

  try {
    const syncApp = new Application(options);
    if (syncApp?.stage && syncApp?.renderer) {
      return syncApp;
    }
  } catch {
    // fall through to async init
  }

  const app = new Application();
  if (typeof app.init === "function") {
    await app.init(options);
    if (app?.stage) return app;
  }

  throw new Error("PIXI Application 不可用");
}

function addListener(state, target, type, handler) {
  target.addEventListener(type, handler);
  state.listeners.push({ target, type, handler });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getHostSize(host) {
  const width = Math.max(host.clientWidth, 200);
  const height = Math.max(host.clientHeight, 240);
  return { width, height };
}

function placeModel(model, app) {
  try {
    model.internalModel?.update?.(0);
  } catch {
    // ignore pre-layout update errors
  }

  const bounds = model.getLocalBounds();
  if (bounds.width <= 0 || bounds.height <= 0) return;

  const kneeLocalY = bounds.y + bounds.height * KNEE_LINE_RATIO;
  const visibleHeight = kneeLocalY - bounds.y;
  const targetVisibleHeight = app.screen.height * BASE_VISIBLE_FILL;
  const scale = targetVisibleHeight / visibleHeight;
  model.scale.set(scale);

  const padX = Math.max(app.screen.width * 0.05, 10);
  model.x = padX - bounds.x * scale;
  model.y = app.screen.height - kneeLocalY * scale;
}

function getPointerInCanvas(app, clientX, clientY) {
  const rect = app.view.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return { x: app.screen.width * 0.5, y: app.screen.height * 0.35 };
  }
  return {
    x: ((clientX - rect.left) / rect.width) * app.screen.width,
    y: ((clientY - rect.top) / rect.height) * app.screen.height,
  };
}

function computeLookAngles(model, pointerX, pointerY) {
  const bounds = model.getBounds();
  if (!bounds.width || !bounds.height) {
    return { angleX: 0, angleY: 0 };
  }

  const headX = bounds.x + bounds.width * 0.5;
  const headY = bounds.y + bounds.height * 0.24;
  const normX = clamp((pointerX - headX) / (bounds.width * 0.32), -1, 1);
  const normY = clamp((pointerY - headY) / (bounds.height * 0.26), -1, 1);

  return {
    angleX: normX * 30,
    angleY: -normY * 30,
  };
}

function applyHeadTracking(model, angleX, angleY) {
  const core = model.internalModel?.coreModel;
  if (!core) return;

  setCoreParamSafe(core, HEAD_PARAMS.angleX, angleX);
  setCoreParamSafe(core, HEAD_PARAMS.angleY, angleY);
  setCoreParamSafe(core, HEAD_PARAMS.angleZ, angleX * 0.12);
  setCoreParamSafe(core, HEAD_PARAMS.bodyX, angleX * 0.42);
  setCoreParamSafe(core, HEAD_PARAMS.bodyY, angleY * 0.28);
  setCoreParamSafe(core, HEAD_PARAMS.eyeX, angleX / 30);
  setCoreParamSafe(core, HEAD_PARAMS.eyeY, angleY / 30);
}

function updateLookAtState(state, pointerX, pointerY) {
  const angles = computeLookAngles(state.model, pointerX, pointerY);
  state.lookTarget = angles;
}

function tickLookAt(state) {
  if (!state.lookTarget || !state.lookCurrent) return;

  const lerp = LOOK_LERP;
  state.lookCurrent.angleX += (state.lookTarget.angleX - state.lookCurrent.angleX) * lerp;
  state.lookCurrent.angleY += (state.lookTarget.angleY - state.lookCurrent.angleY) * lerp;
  applyHeadTracking(state.model, state.lookCurrent.angleX, state.lookCurrent.angleY);
}

function resetLookAt(state) {
  state.lookTarget = { angleX: 0, angleY: 0 };
  state.lookCurrent = { angleX: 0, angleY: 0 };

  try {
    if (state.model.internalModel?.focusController) {
      state.model.internalModel.focusController.targetX = 0;
      state.model.internalModel.focusController.targetY = 0;
    }
  } catch {
    // ignore
  }

  applyHeadTracking(state.model, 0, 0);
}

async function applyNoWatermark(model) {
  try {
    if (typeof model.expression === "function") {
      await model.expression(DEFAULT_EXPRESSION);
      return;
    }
  } catch {
    // fall through to parameter override
  }

  try {
    const core = model.internalModel?.coreModel;
    setCoreParamSafe(core, "fase105", 1.0);
  } catch {
    // optional expression
  }
}

function bindInteraction(state) {
  const { app, model } = state;

  const onTicker = () => {
    if (!state.visible) return;
    const delta = Math.min(app.ticker.deltaMS / 1000, 0.05);
    try {
      if (typeof model.update === "function") {
        model.update(delta);
      } else {
        model.internalModel?.update?.(delta);
      }
    } catch {
      // ignore frame update errors
    }
    state.emotion?.tick(delta);
    tickLookAt(state);
  };

  const onPointerMove = (event) => {
    if (!state.visible) return;
    const pointer = getPointerInCanvas(app, event.clientX, event.clientY);
    try {
      model.focus(pointer.x, pointer.y);
    } catch {
      // focus 辅助视线，头部参数由 tickLookAt 驱动
    }
    updateLookAtState(state, pointer.x, pointer.y);
    state.emotion?.notePointerActivity(0.12);
  };

  const onBlur = () => {
    resetLookAt(state);
  };

  const onResize = () => {
    if (!state.visible) return;
    const { width, height } = getHostSize(state.host);
    app.renderer.resize(width, height);
    placeModel(model, app);
  };

  state.ticker = onTicker;
  app.ticker.add(onTicker);

  addListener(state, window, "pointermove", onPointerMove);
  addListener(state, window, "blur", onBlur);
  addListener(state, window, "resize", onResize);

  onResize();
}

function ensureHost() {
  let host = document.getElementById("live2d-pet");
  if (host) return host;

  host = document.createElement("div");
  host.id = "live2d-pet";
  host.className = "live2d-pet";
  host.setAttribute("aria-hidden", "true");
  host.innerHTML = '<canvas id="live2d-pet-canvas"></canvas>';
  document.body.appendChild(host);
  return host;
}

function applyHostScale(host, sizeScale) {
  host.style.setProperty("--live2d-scale", String(sizeScale));
}

export function setLive2DPetVisible(visible) {
  const host = document.getElementById("live2d-pet");
  if (host) {
    host.classList.toggle("is-hidden", !visible);
    host.setAttribute("aria-hidden", visible ? "false" : "true");
  }
  if (petState) {
    petState.visible = visible;
    petState.emotion?.setActive(visible);
  }
}

export function setLive2DPetScale(sizeScale) {
  const scale = Math.min(1.5, Math.max(0.5, sizeScale));
  const host = ensureHost();
  applyHostScale(host, scale);

  if (petState) {
    petState.sizeScale = scale;
  }
}

export function refreshLive2DPetLayout() {
  if (!petState?.model || !petState.app) return;
  const { width, height } = getHostSize(petState.host);
  petState.app.renderer.resize(width, height);
  placeModel(petState.model, petState.app);
}

export async function initLive2DPet(basePath = "", { visible = true, sizeScale = 1 } = {}) {
  if (isPublishedSite() && !hasUserLive2DModel()) {
    setLive2DPetVisible(false);
    return;
  }

  if (petState?.model) {
    setLive2DPetVisible(visible);
    setLive2DPetScale(sizeScale);
    return;
  }

  if (!initPromise) {
    initPromise = bootLive2DPet(basePath, visible, sizeScale, {
      useBundledModel: shouldUseBundledLive2DModel(),
    })
      .catch((error) => {
        console.warn("[Live2D] 初始化失败:", error);
      })
      .finally(() => {
        initPromise = null;
      });
  }

  await initPromise;

  if (petState?.model) {
    setLive2DPetVisible(visible);
    setLive2DPetScale(sizeScale);
  }
}

async function bootLive2DPet(basePath, visible, sizeScale, { userFiles = null, useBundledModel = true } = {}) {
  try {
    await ensureLive2DScripts(basePath);
  } catch (error) {
    console.warn("[Live2D] 依赖加载失败:", error);
    return;
  }

  const Live2DModel = window.PIXI?.live2d?.Live2DModel;
  if (!Live2DModel) {
    console.warn("[Live2D] PIXI.live2d 未就绪");
    return;
  }

  const host = ensureHost();
  applyHostScale(host, sizeScale);
  host.classList.toggle("is-hidden", !visible);
  await waitForDomPaint();

  const { width, height } = getHostSize(host);
  const canvas = host.querySelector("#live2d-pet-canvas");

  let app;
  try {
    app = await createPixiApp(canvas, width, height);
  } catch (error) {
    console.warn("[Live2D] PIXI 初始化失败:", error);
    host.remove();
    return;
  }

  if (!app?.stage) {
    console.warn("[Live2D] PIXI 初始化失败");
    host.remove();
    return;
  }

  petState = {
    host,
    app,
    model: null,
    visible,
    sizeScale,
    modelSource: userFiles ? "user" : "bundled",
    blobUrls: {},
    lookTarget: { angleX: 0, angleY: 0 },
    lookCurrent: { angleX: 0, angleY: 0 },
    listeners: [],
    ticker: null,
    emotion: null,
  };

  try {
    let model;
    if (userFiles) {
      const loaded = await loadLive2DModelFromUserFiles(userFiles, Live2DModel);
      model = loaded.model;
      userModelName = loaded.modelName;
      petState.blobUrls = loaded.blobUrls;
    } else if (useBundledModel) {
      model = await loadLive2DModel(basePath, Live2DModel);
    } else {
      destroyLive2DPet();
      return;
    }

    app.stage.addChild(model);
    petState.model = model;
    setLive2DPetVisible(visible);
    if (!userFiles) {
      try {
        await applyNoWatermark(model);
      } catch {
        // 无水印表情失败时不影响模型显示
      }
    }
    petState.emotion = createEmotionController(model);
    petState.emotion.setActive(visible);
    placeModel(model, app);
    bindInteraction(petState);
    requestAnimationFrame(() => {
      if (!petState?.model || !petState.app) return;
      placeModel(petState.model, petState.app);
    });
  } catch (error) {
    console.warn("[Live2D] 模型加载失败:", error);
    if (isFileProtocol()) {
      console.warn("[Live2D] 离线模式请先运行: python sync/build-all.py");
    }
    destroyLive2DPet();
  }
}

export function destroyLive2DPet() {
  if (!petState) {
    document.getElementById("live2d-pet")?.remove();
    return;
  }

  petState.emotion?.destroy();
  petState.emotion = null;

  petState.listeners.forEach(({ target, type, handler }) => {
    target.removeEventListener(type, handler);
  });

  if (petState.ticker && petState.app?.ticker) {
    petState.app.ticker.remove(petState.ticker);
  }

  try {
    petState.model?.destroy?.();
    petState.app?.destroy?.(true, {
      children: true,
      texture: true,
      baseTexture: true,
    });
  } catch {
    // ignore teardown errors
  }

  revokeBlobUrls(petState.blobUrls);
  petState.host?.remove();
  petState = null;
  initPromise = null;
}

export function isLive2DPetReady() {
  return Boolean(petState?.model);
}
