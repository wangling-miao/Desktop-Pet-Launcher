<p align="center">
  <img src="website/assets/desktop-pet-launcher-icon.png" width="140" alt="Desktop Pet Launcher logo">
</p>

<h1 align="center">Desktop Pet Launcher</h1>

<p align="center">
  <strong>Keep your favorite characters in the corner of your desktop.</strong><br>
  Cross-platform · High-resolution · Local-first desktop pet launcher
</p>

<p align="center">
  <a href="https://github.com/wangling-miao/Desktop-Pet-Launcher/actions/workflows/ci.yml"><img src="https://github.com/wangling-miao/Desktop-Pet-Launcher/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/wangling-miao/Desktop-Pet-Launcher/releases"><img src="https://img.shields.io/github/v/release/wangling-miao/Desktop-Pet-Launcher?include_prereleases&label=release" alt="Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg" alt="License"></a>
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey" alt="Platform">
  <img src="https://img.shields.io/badge/tech-Tauri%202%20%2B%20React%20%2B%20TypeScript-orange" alt="Stack">
</p>

<p align="center">
  <a href="README.zh-CN.md">简体中文</a> ·
  <a href="https://pet.nether.top">Website</a> ·
  <a href="https://pet.nether.top/gallery/">Pet Gallery</a> ·
  <a href="https://github.com/wangling-miao/Desktop-Pet-Launcher/releases/latest">Download</a> ·
  <a href="https://github.com/wangling-miao/Desktop-Pet-Launcher-skill">Pet Skill</a>
</p>

---

## Overview

**Desktop Pet Launcher** is an open-source high-resolution desktop pet launcher built with **Tauri 2 + React + TypeScript**.  
It packs a transparent always-on-top window, system tray controls, pet package management, and optional AI chat into a quiet little companion — offline by default, no account required, and never turned into a bloated control center.

Compatible with legacy `hatch-pet` / Codex pet packages, and also supports 2× / 4× high-resolution spritesheets. At runtime it automatically picks the sharper atlas based on window size and screen scale.

App identifier: `top.nether.pet`

---

## Features

| Feature | Description |
|---------|-------------|
| **Transparent always-on-top pet** | Borderless, skips the taskbar, draggable and lockable — lives on your desktop |
| **System tray** | Show / hide, open settings, lock, refresh pets, quit |
| **High-res assets** | Automatically loads 1× / 2× / 4× atlases so scaled pets stay sharp |
| **Flexible pet sources** | Scans `~/.codex/pets` and the app data directory; add any local folders |
| **Online gallery** | Browse and one-click import community packs from [awesome-desktop-pets](https://github.com/wangling-miao/awesome-desktop-pets) |
| **Optional AI chat** | Connect any OpenAI-compatible API; the chat entry only appears when enabled |
| **Launch at startup** | System-level autostart with persistent settings |
| **Cross-platform** | Native installers for Windows, macOS, and Linux |

More details and design notes: [https://pet.nether.top](https://pet.nether.top)

---

## Download & Install

Grab the latest build from **[Releases](https://github.com/wangling-miao/Desktop-Pet-Launcher/releases/latest)**:

- **Windows**: `setup.exe` (recommended) or MSI
- **macOS**: `.dmg` for Apple Silicon / Intel
- **Linux**: AppImage, deb, or rpm

After install, open Settings from the tray to import gallery pets or local packages.

> Unsigned builds may trigger Windows SmartScreen or macOS security prompts — this is expected; allow once to continue.

---

## Development

### Requirements

- Node.js + npm
- Rust + Cargo
- Platform build tools (WebView2 on Windows)

### Commands

```bash
npm install          # Install dependencies
npm run check        # Frontend checks + tests + build validation
npm run tauri:dev    # Run in development mode
npm run tauri:build  # Production build
```

### Project layout (brief)

```text
.
├─ src/                  # React frontend (PetWindow / SettingsWindow)
├─ src-tauri/            # Tauri + Rust backend, tray, scanning
├─ website/              # Official site & gallery (GitHub Pages)
├─ scripts/              # Version consistency checks, etc.
└─ .github/workflows/    # CI / Pages / Release
```

---

## Pet package format

Legacy packages work; high-res packages are recommended:

```text
pet.json
spritesheet.webp         # 1× compatibility (1536×1872)
spritesheet@2x.webp      # optional 2×
spritesheet@4x.webp      # preferred 4× master (6144×7488)
```

Example `pet.json`:

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

Atlas layout is fixed at **8 columns × 9 rows**:

| Row | State | Frames |
|-----|-------|-------:|
| 0 | `idle` | 6 |
| 1 | `running-right` | 8 |
| 2 | `running-left` | 8 |
| 3 | `waving` | 4 |
| 4 | `jumping` | 5 |
| 5 | `failed` | 8 |
| 6 | `waiting` | 6 |
| 7 | `running` | 6 |
| 8 | `review` | 6 |

Create and validate packs with the companion skill:  
[Desktop-Pet-Launcher-skill](https://github.com/wangling-miao/Desktop-Pet-Launcher-skill)

---

## Pet directories & data locations

Default scan paths:

- `%USERPROFILE%\.codex\pets\<pet-id>\`
- `%APPDATA%\top.nether.pet\pets\<pet-id>\`
- Custom folders added in Settings

Config file: `%APPDATA%\top.nether.pet\settings.json`

Default gallery index:  
`https://wangling-miao.github.io/awesome-desktop-pets/index.json`

---

## AI chat (optional)

Disabled by default. Enable it in Settings and provide an OpenAI-compatible Endpoint / Model / Key.  
The pet switches actions based on conversation state (waiting, running, waving, failed, etc.). Bubble color is sampled from the current spritesheet.

---

## Releases

Push a `V*` tag to trigger the Release workflow (quality gate first, then multi-platform installers):

```bash
git tag Vx.y.z
git push origin main --tags
```

---

## FAQ

**Autostart does nothing?**  
Use a build that includes the `autostart:default` capability, fully quit the old process, then restart.

**Added a custom folder but no pets show up?**  
Expected structure:

```text
Pets/
└─ my-pet/
   ├─ pet.json
   └─ spritesheet.webp
```

You can also select a single pet directory that already contains `pet.json`.

**Installer icon looks outdated?**  
Windows Explorer caches icons — refresh or rename the file to see the update.

---

## License

Source code is licensed under the **Apache License 2.0**.

Pet artwork, character names, gallery packages, and other third-party assets may have separate licenses. Please check each package before redistribution.

---

<p align="center">
  <sub>Open-source HD desktop pet launcher · Let your favorite characters quietly live on your desktop.</sub>
</p>
