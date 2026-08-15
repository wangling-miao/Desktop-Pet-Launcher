<p align="center">
  <img src="website/assets/desktop-pet-launcher-icon.png" width="140" alt="Desktop Pet Launcher logo">
</p>

<h1 align="center">Desktop Pet Launcher</h1>

<p align="center">
  <strong>把喜欢的角色，留在桌面一角。</strong><br>
  跨平台 · 高清 · 本地优先的桌宠启动器
</p>

<p align="center">
  <a href="https://github.com/wangling-miao/Desktop-Pet-Launcher/actions/workflows/ci.yml"><img src="https://github.com/wangling-miao/Desktop-Pet-Launcher/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/wangling-miao/Desktop-Pet-Launcher/releases"><img src="https://img.shields.io/github/v/release/wangling-miao/Desktop-Pet-Launcher?include_prereleases&label=release" alt="Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg" alt="License"></a>
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey" alt="Platform">
  <img src="https://img.shields.io/badge/tech-Tauri%202%20%2B%20React%20%2B%20TypeScript-orange" alt="Stack">
</p>

<p align="center">
  <a href="https://pet.nether.top">官网</a> ·
  <a href="https://pet.nether.top/gallery/">桌宠图鉴</a> ·
  <a href="https://github.com/wangling-miao/Desktop-Pet-Launcher/releases/latest">下载最新版</a> ·
  <a href="https://github.com/wangling-miao/Desktop-Pet-Launcher-skill">制作 Skill</a>
</p>

---

## 项目简介

Desktop Pet Launcher 是一个基于 **Tauri 2 + React + TypeScript** 的开源高清桌宠启动器。  
它把透明置顶窗口、托盘控制、宠物包管理和可选 AI 对话装进一个安静的小窗口里——默认不联网、不需要账号，也不会把可爱桌宠做成复杂的控制中心。

兼容传统 `hatch-pet` / Codex 宠物包，同时支持 2× / 4× 高清图集，运行时会根据窗口尺寸与屏幕倍率自动选择更清晰的素材。

应用标识：`top.nether.pet`

---

## 核心特性

| 特性 | 说明 |
|------|------|
| **透明置顶桌宠** | 无边框、跳过任务栏、可拖拽、可锁定，真正住在桌面上 |
| **系统托盘** | 显示 / 隐藏、打开设置、锁定、刷新宠物、退出 |
| **高清素材** | 自动按 1× / 2× / 4× 加载图集，放大也尽量清晰 |
| **宠物来源自由** | 扫描 `~/.codex/pets`、应用数据目录，也可添加任意本地文件夹 |
| **在线图鉴** | 一键浏览并导入社区宠物包（来自 [awesome-desktop-pets](https://github.com/wangling-miao/awesome-desktop-pets)） |
| **可选 AI 对话** | 接入任意 OpenAI 兼容接口后，桌宠旁才会出现聊天入口 |
| **开机自启** | 支持系统级自启动，配置持久化 |
| **跨平台** | Windows / macOS / Linux 原生安装包 |

更多细节与设计理念见官网：[https://pet.nether.top](https://pet.nether.top)

---

## 下载与安装

前往 **[Releases](https://github.com/wangling-miao/Desktop-Pet-Launcher/releases/latest)** 下载对应系统安装包：

- **Windows**：`setup.exe`（推荐）或 MSI
- **macOS**：Apple Silicon / Intel 的 `.dmg`
- **Linux**：AppImage、deb、rpm

安装后从托盘打开设置，即可导入图鉴中的桌宠或本地宠物包。

> 未签名版本可能触发 Windows SmartScreen 或 macOS 安全提示，属正常现象，允许一次即可。

---

## 开发与构建

### 环境要求

- Node.js + npm
- Rust + Cargo
- 各平台对应的构建工具（Windows 需 WebView2）

### 常用命令

```bash
npm install          # 安装依赖
npm run check        # 前端检查 + 测试 + 构建校验
npm run tauri:dev    # 开发模式运行
npm run tauri:build  # 生产构建
```

### 项目结构（简要）

```text
.
├─ src/                  # React 前端（PetWindow / SettingsWindow）
├─ src-tauri/            # Tauri + Rust 后端、托盘、扫描逻辑
├─ website/              # 官网与图鉴源码（GitHub Pages）
├─ scripts/              # 版本一致性检查等
└─ .github/workflows/    # CI / Pages / Release
```

---

## 宠物包格式

兼容旧包，也推荐使用高清包：

```text
pet.json
spritesheet.webp         # 1× 兼容（1536×1872）
spritesheet@2x.webp      # 可选 2×
spritesheet@4x.webp      # 推荐 4× 主图集（6144×7488）
```

`pet.json` 示例：

```json
{
  "id": "venti-bard",
  "displayName": "Venti Bard",
  "description": "A tiny wind-bard pet.",
  "spritesheetPath": "spritesheet.webp",
  "spritesheets": {
    "1x": "spritesheet.webp",
    "2x": "spritesheet@2x.webp",
    "4x": "spritesheet@4x.webp"
  },
  "cellSize": { "width": 192, "height": 208 },
  "sourceScale": 4,
  "pixelated": false
}
```

图集固定 **8 列 × 9 行**，状态行约定：

| 行 | 状态 | 帧数 |
|----|------|------|
| 0 | `idle` | 6 |
| 1 | `running-right` | 8 |
| 2 | `running-left` | 8 |
| 3 | `waving` | 4 |
| 4 | `jumping` | 5 |
| 5 | `failed` | 8 |
| 6 | `waiting` | 6 |
| 7 | `running` | 6 |
| 8 | `review` | 6 |

制作与校验可使用配套 Skill：  
[Desktop-Pet-Launcher-skill](https://github.com/wangling-miao/Desktop-Pet-Launcher-skill)

---

## 宠物目录与数据位置

默认扫描：

- `%USERPROFILE%\.codex\pets\<pet-id>\`
- `%APPDATA%\top.nether.pet\pets\<pet-id>\`
- 设置页添加的自定义文件夹

配置文件：`%APPDATA%\top.nether.pet\settings.json`

在线图鉴索引默认：  
`https://wangling-miao.github.io/awesome-desktop-pets/index.json`

---

## AI 对话（可选）

默认关闭。在设置中开启后，填写 OpenAI 兼容的 Endpoint / Model / Key 即可。  
桌宠会根据对话状态自动切换动作（等待、跑步、挥手、失败等），气泡颜色会从当前宠物图集采样。

---

## 发布说明

推送 `V*` 标签触发 Release 工作流（先跑质量门禁，再构建全平台安装包）：

```bash
git tag Vx.y.z
git push origin main --tags
```

---

## 常见问题

**开机自启无效？**  
确认使用包含 `autostart:default` 能力的新版本，并完全退出旧进程后重启。

**添加了自定义目录却看不到宠物？**  
目录结构应为：

```text
Pets/
└─ my-pet/
   ├─ pet.json
   └─ spritesheet.webp
```

也可以直接选择包含 `pet.json` 的单个宠物目录。

**安装包图标不更新？**  
Windows 资源管理器有图标缓存，刷新或重命名文件后通常可见。

---

## 许可证

本仓库源码采用 **Apache License 2.0**。

桌宠美术资源、角色名称、图鉴包等第三方资产可能拥有独立许可，请在二次分发前确认各自的授权信息。

---

<p align="center">
  <sub>开源高清桌宠启动器 · 让喜欢的角色，安静住在桌面上。</sub>
</p>
