# Voka 个人主页 ver01_0704

基础个人主页 + GitHub 同步发布流程。兼容 Quartz 风格内容目录，并为后续扩展预留配置。

## 目录结构

```
ver01_0704/
├── site/           # 可部署静态站点（GitHub Pages 发布此目录）
│   ├── index.html
│   ├── css/
│   └── js/
├── content/        # Markdown 笔记（Quartz 兼容）
├── config/         # 站点配置 site.json
└── sync/           # GitHub 同步工具
    ├── publish.ps1
    └── server.py
```

## 本地预览

### 方式一：双击打开（离线，推荐）

1. 先构建离线资源（首次或更新笔记/音乐/桌宠后执行一次）：

```powershell
cd c:\Users\32967\Desktop\Voka\tdlist\net\ver01_0704
python sync/build-all.py
```

2. 用 **Chrome 或 Edge** 双击打开：

```
site/index.html
```

请从 `index.html` 进入站点，再通过导航访问课程、笔记等页面。离线模式下笔记编辑需连接 `note_content` 文件夹。

### 方式二：本地开发服务器（可编辑笔记）

```powershell
cd c:\Users\32967\Desktop\Voka\tdlist\net\ver01_0704
python sync/server.py
```

浏览器打开 `http://127.0.0.1:8765/index.html`

### 方式三：简易静态服务

```powershell
cd c:\Users\32967\Desktop\Voka\tdlist\net\ver01_0704\site
python -m http.server 8080
```

浏览器打开 `http://localhost:8080/index.html`

## GitHub 同步与发布

### 方式一：网页凭据窗口 + 本地服务

1. 在 [GitHub Settings > Tokens](https://github.com/settings/tokens) 创建 PAT（勾选 `repo`）
2. 启动同步服务：

```powershell
cd c:\Users\32967\Desktop\Voka\tdlist\net\ver01_0704
python sync/server.py
```

3. 打开主页，点击「GitHub 同步」，填入用户名与 Token

### 方式二：直接运行发布脚本

```powershell
cd c:\Users\32967\Desktop\Voka
.\tdlist\net\ver01_0704\sync\publish.ps1 -Username <用户名> -Token <PAT> -Repo voka-home -CreateRepo -EnablePages
```

### 方式三：将凭据发给 Agent

在对话中提供 GitHub 用户名与 PAT，由 Agent 执行发布脚本。

> **安全提示**：GitHub 已不支持账号密码进行 Git 操作，请使用 Personal Access Token。切勿将 Token 提交到仓库。

## GitHub Pages

推送后，在仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。

站点 URL：`https://<username>.github.io/<repo>/`

## 版本说明

- **ver01_0704 / v0.12.0**：四大功能分区、背景图适配、GitHub 同步窗口
