import { collectDiaryMemosForSync, migrateLocalDiaryToServerIfNeeded } from "./mouse-diary-api.js";

const SYNC_API = "http://127.0.0.1:8765/sync";

let syncBound = false;

export function initGitHubSync(config) {
  const dialog = document.getElementById("github-sync-dialog");
  const form = document.getElementById("github-sync-form");
  const statusEl = document.getElementById("sync-status");
  const repoInput = document.getElementById("gh-repo");

  if (!dialog || !form) return;

  const suggestedRepo = config?.github?.repoNameSuggestion ?? "voka-home";
  if (repoInput && !repoInput.value) repoInput.value = suggestedRepo;

  if (syncBound) return;
  syncBound = true;

  document.addEventListener("click", (event) => {
    if (event.target.closest("#open-sync-btn, #open-sync-btn-2")) {
      dialog.showModal();
      setStatus(statusEl, "", "");
    }
    if (event.target.closest("#close-sync-dialog, #cancel-sync")) {
      dialog.close();
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const username = document.getElementById("gh-username")?.value?.trim();
    const password = document.getElementById("gh-password")?.value?.trim();
    const repo = document.getElementById("gh-repo")?.value?.trim() || suggestedRepo;
    const createRepo = document.getElementById("gh-create-repo")?.checked ?? true;
    const enablePages = document.getElementById("gh-enable-pages")?.checked ?? true;

    if (!username || !password) {
      setStatus(statusEl, "请填写用户名与 Token。", "error");
      return;
    }

    setStatus(statusEl, "正在收集事件簿数据…", "info");

    let diaryMemos = [];
    try {
      diaryMemos = await collectDiaryMemosForSync();
      const migration = await migrateLocalDiaryToServerIfNeeded();
      if (migration.migrated > 0) {
        setStatus(
          statusEl,
          `已迁移 ${migration.migrated} 条事件簿记录，正在构建并发布…`,
          "info",
        );
      } else if (diaryMemos.length > 0) {
        setStatus(
          statusEl,
          `已收集 ${diaryMemos.length} 条事件簿记录（含公告），正在构建并发布…`,
          "info",
        );
      }
    } catch (err) {
      setStatus(statusEl, err.message || "事件簿收集失败", "error");
      return;
    }

    const payload = {
      username,
      password,
      repo,
      createRepo,
      enablePages,
      sitePath: "tdlist/net/ver01_0704/site",
      projectRoot: "Voka",
      diaryMemos,
    };

    try {
      const res = await fetch(SYNC_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || `同步失败 (${res.status})`);
      }

      const pagesUrl = data.pagesUrl || "";
      const importHint =
        data.importedDiary > 0 ? `已导入 ${data.importedDiary} 条事件簿记录到仓库。` : "";
      const successMessage = [
        data.message || "同步并发布成功",
        importHint,
        pagesUrl ? `读者端：${pagesUrl}` : "",
        "GitHub Actions 部署完成后读者即可看到最新内容（通常 1–3 分钟）。",
      ]
        .filter(Boolean)
        .join("\n");

      setStatus(statusEl, successMessage, "success");
    } catch (err) {
      const isNetwork = err instanceof TypeError;
      if (isNetwork) {
        setStatus(
          statusEl,
          "本地同步服务未运行。请将凭据发送给 Agent，或运行：python sync/server.py",
          "error",
        );
        console.info("[Voka Sync] 凭据已准备（请勿在公开环境打印）", {
          username,
          repo,
          createRepo,
          enablePages,
        });
      } else {
        setStatus(statusEl, err.message || "同步失败", "error");
      }
    }
  });
}

function setStatus(el, message, type) {
  if (!el) return;
  el.textContent = message;
  el.className = "sync-status visible" + (type ? ` ${type}` : "");
  if (!message) el.classList.remove("visible");
}
