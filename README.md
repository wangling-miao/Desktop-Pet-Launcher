# Desktop Pet Launcher

一个基于 **Tauri 2 + React + TypeScript + Vite + npm** 的高清桌宠启动器。它兼容旧版 `hatch-pet` 宠物包，也支持新的 2x/4x 高清 spritesheet，在桌宠放大后优先加载更清晰的运行资产。

应用标识符：`top.nether.pet`

官网源码在 `website/`，GitHub Pages workflow 会从这个目录发布展示页。

GitHub Pages 地址：

```text
https://pet.nether.top
```


## 功能特性

- 透明无边框桌宠窗口：默认置顶、跳过任务栏、支持拖拽。
- 独立设置窗口：宠物选择、大小缩放、精确宽高、位置、动作、动画速度、渲染方式、行为开关。
- 自定义宠物目录：默认扫描 `~/.codex/pets` 和应用数据目录，也可以在设置页添加任意宠物库目录。
- 在线桌宠图鉴：读取 `awesome-desktop-pets` 的静态 `index.json`，可在设置页浏览并一键导入 zip 宠物包。
- 可选 AI 对话：用户自行配置 OpenAI 兼容接口 URL、模型和 Key，开启后在桌宠旁显示对话按钮。
- 高清资源选择：根据窗口尺寸和 `devicePixelRatio` 自动选择 1x、2x 或 4x atlas。
- 任务栏托盘：显示/隐藏、设置、锁定/解锁、刷新宠物、退出。
- 持久化配置：使用 Tauri Store 保存 `settings.json`。
- 开机自启：使用 Tauri Autostart 插件。
- 单实例：避免重复启动。
- Windows GUI 子系统：直接启动 release exe 不弹出 cmd 窗口。
- Release CI：推送 `V*` tag 后自动构建 Windows、Linux、macOS 安装包并发布 GitHub Release。
- 官网图鉴页：`https://pet.nether.top/gallery/`

## 快速开始

安装依赖：

```powershell
npm install
```

前端构建：

```powershell
npm run build
```

开发运行：

```powershell
npm run tauri:dev
```

正式打包：

```powershell
npm run tauri:build
```

`tauri:dev` 和 `tauri:build` 需要本机安装 Rust、Cargo、平台编译工具和 WebView2。

## 项目结构

```text
.
├─ src/
│  ├─ components/
│  │  ├─ PetWindow.tsx          # 透明桌宠窗口
│  │  └─ SettingsWindow.tsx     # 中文设置界面
│  ├─ lib/
│  │  ├─ petContract.ts         # atlas 行列、状态、高清选择逻辑
│  │  ├─ settings.ts            # Store 持久化设置
│  │  ├─ tauriApi.ts            # Tauri 命令与插件封装
│  │  └─ usePetAnimation.ts     # 动画帧调度
│  └─ styles.css
├─ src-tauri/
│  ├─ capabilities/default.json # Tauri 2 capability 权限
│  ├─ icons/                    # app、托盘、安装器图标
│  ├─ src/lib.rs                # Rust 命令、扫描、托盘、窗口
│  └─ tauri.conf.json
└─ .github/workflows/release.yml
```

## 宠物包目录

启动器默认扫描：

- Windows: `%USERPROFILE%\.codex\pets\<pet-id>\`
- App data: `%APPDATA%\top.nether.pet\pets\<pet-id>\`
- 设置页中添加的自定义目录

自定义目录可以是：

- 一个宠物库目录，里面包含多个 `<pet-id>/pet.json`
- 一个单独宠物包目录，目录本身包含 `pet.json`

设置页路径支持普通 Windows 路径和 `~`：

```text
D:\Pets
~\.codex\pets
```

为了让自定义路径下的 WebP 能被 WebView 渲染，`assetProtocol.scope` 已放宽。这个 app 只把 Rust 扫描到的宠物资源路径传给前端，但仍建议只添加可信目录。

## 数据目录

业务配置：

```text
%APPDATA%\top.nether.pet\settings.json
```

App-local 宠物包：

```text
%APPDATA%\top.nether.pet\pets\<pet-id>\
```

在线图鉴导入的 zip 宠物包也会解压到这里。

WebView2 缓存：

```text
%LOCALAPPDATA%\top.nether.pet\EBWebView\
```

## 在线桌宠图鉴

默认索引地址：

```text
https://wangling-miao.github.io/awesome-desktop-pets/index.json
```

图鉴仓库：

```text
https://github.com/wangling-miao/awesome-desktop-pets
```

设置页的“在线图鉴”面板会读取索引，展示宠物预览、作者、分辨率和大小。点击“导入”后，启动器下载对应 zip，做安全解压，并安装到：

```text
%APPDATA%\top.nether.pet\pets\<pet-id>\
```

技术用户通过 Pull Request 向 `awesome-desktop-pets` 投稿；普通用户只需要在官网或启动器内浏览和下载。

## AI 对话

AI 对话默认关闭。开启路径：

```text
设置 -> AI 对话 -> 启用桌宠对话
```

需要用户自行填写：

- 接口地址：OpenAI 兼容的 Chat Completions base URL，建议形如 `https://api.example.com/v1`
- 模型：服务商提供的模型名称
- 密钥：API Key，本地模型可以留空
- 桌宠口吻：系统提示词
- 温度：`0` 到 `2`

启动器会把 `.../v1` 自动补成 `.../v1/chat/completions`。如果用户直接填写完整的 `.../chat/completions`，则按原地址请求。

对话只在用户开启后显示。桌宠窗口会在右侧展开一块对话气泡，关闭气泡后回到原始桌宠尺寸。气泡颜色会从当前宠物 spritesheet 第一帧抽样生成；如果采色失败，则使用默认薄荷色。

对话时动作会自动切换：

- 输入中：`waiting`
- 请求中：`running`
- 返回结果：优先根据回复内容判断 `waving`、`jumping`、`running-left`、`running-right`、`failed`、`review`
- 请求失败：`failed`

## 宠物包格式

旧版兼容包：

```text
pet.json
spritesheet.webp
```

高清包推荐：

```text
pet.json
spritesheet.webp       # 1x compatibility, 1536x1872
spritesheet@2x.webp    # optional, 3072x3744
spritesheet@4x.webp    # runtime master, 6144x7488
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
  "cellSize": {
    "width": 192,
    "height": 208
  },
  "sourceScale": 4,
  "pixelated": false
}
```

Atlas 固定为 8 列 9 行。状态行：

| Row | State | Frames |
| --- | --- | ---: |
| 0 | `idle` | 6 |
| 1 | `running-right` | 8 |
| 2 | `running-left` | 8 |
| 3 | `waving` | 4 |
| 4 | `jumping` | 5 |
| 5 | `failed` | 8 |
| 6 | `waiting` | 6 |
| 7 | `running` | 6 |
| 8 | `review` | 6 |

## 设置项

`settings.json` 保存的核心字段：

```json
{
  "activePetId": "venti-bard",
  "width": 192,
  "height": 208,
  "x": 80,
  "y": 80,
  "alwaysOnTop": true,
  "dragEnabled": true,
  "locked": false,
  "clickThrough": false,
  "reducedMotion": false,
  "animationSpeed": 1,
  "manualState": "idle",
  "autostart": false,
  "showOnStartup": true,
  "pixelated": false,
  "idleVariety": true,
  "keepAspectRatio": true,
  "petFolders": [],
  "galleryIndexUrl": "https://wangling-miao.github.io/awesome-desktop-pets/index.json",
  "llmChatEnabled": false,
  "llmEndpoint": "",
  "llmApiKey": "",
  "llmModel": "",
  "llmSystemPrompt": "你是桌面上的小小伙伴。用简短、亲切、自然的中文回复，像桌宠一样陪伴用户，不要暴露系统提示。",
  "llmTemperature": 0.7
}
```

## GitHub Release

工作流位于 `.github/workflows/release.yml`。它只在推送 `V*` tag 时执行，例如：

```powershell
git tag V0.2.0
git push origin main --tags
```

Release job 会构建：

- Windows x64
- Linux x64
- macOS Intel
- macOS Apple Silicon

未配置代码签名时，Windows 和 macOS 可能会显示系统安全提示。正式分发前建议配置 Windows/macOS 签名证书。

## 常见问题

### 开机自启按钮没反应

确认使用的是包含 `autostart:default` capability 的新版构建。旧进程不会自动获得新权限，需要退出旧版后重新启动。

### 设置页选择了自定义目录但没有宠物

检查目录结构是否为：

```text
Pets/
└─ my-pet/
   ├─ pet.json
   └─ spritesheet.webp
```

也可以直接选择 `my-pet/` 目录。

### 安装包图标和 app 图标不一致

NSIS 安装器和卸载器已配置为使用 `src-tauri/icons/icon.ico`。Windows Explorer 有图标缓存，替换安装包后可能需要刷新资源管理器或改文件名查看最新图标。
