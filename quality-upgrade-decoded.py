from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


def replace_regex_once(text: str, pattern: str, repl: str, label: str, flags: int = 0) -> str:
    updated, count = re.subn(pattern, repl, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    return updated


# package.json / package-lock.json
package_path = ROOT / "package.json"
package = json.loads(package_path.read_text(encoding="utf-8"))
package["license"] = "Apache-2.0"
scripts = package.setdefault("scripts", {})
scripts["typecheck"] = "tsc --noEmit"
scripts["test"] = "node --test tests/*.test.mjs"
scripts["check:versions"] = "node scripts/check-versions.mjs"
scripts["check"] = "npm run typecheck && npm run test && npm run check:versions && vite build"
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

lock_path = ROOT / "package-lock.json"
lock = json.loads(lock_path.read_text(encoding="utf-8"))
if "packages" in lock and "" in lock["packages"]:
    lock["packages"][""]["license"] = "Apache-2.0"
lock_path.write_text(json.dumps(lock, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

# Cargo metadata and async reqwest.
cargo = read("src-tauri/Cargo.toml")
if 'license = "Apache-2.0"' not in cargo:
    cargo = replace_once(
        cargo,
        'description = "A high-resolution desktop pet launcher"\n',
        'description = "A high-resolution desktop pet launcher"\nlicense = "Apache-2.0"\n',
        "Cargo license",
    )
cargo = replace_once(
    cargo,
    'reqwest = { version = "0.12", default-features = false, features = ["blocking", "json", "rustls-tls"] }',
    'reqwest = { version = "0.12", default-features = false, features = ["json", "rustls-tls"] }',
    "reqwest async features",
)
write("src-tauri/Cargo.toml", cargo)

# Shared async HTTP client.
write(
    "src-tauri/src/network.rs",
    '''use std::time::Duration;\n\npub(crate) struct NetworkState {\n    pub(crate) client: reqwest::Client,\n}\n\nimpl NetworkState {\n    pub(crate) fn new() -> Result<Self, String> {\n        let client = reqwest::Client::builder()\n            .connect_timeout(Duration::from_secs(15))\n            .timeout(Duration::from_secs(90))\n            .user_agent(concat!(\"desktop-pet-launcher/\", env!(\"CARGO_PKG_VERSION\")))\n            .build()\n            .map_err(|error| error.to_string())?;\n\n        Ok(Self { client })\n    }\n}\n''',
)

lib = read("src-tauri/src/lib.rs")
lib = replace_once(lib, "use std::time::Duration;\n", "", "remove blocking timeout import")
lib = replace_once(
    lib,
    '''use tauri::{\n    AppHandle, Emitter, Manager, Runtime, WebviewUrl, WebviewWindow, WebviewWindowBuilder,\n};\n''',
    '''use tauri::{\n    AppHandle, Emitter, Manager, Runtime, WebviewUrl, WebviewWindow, WebviewWindowBuilder,\n};\n\nmod network;\nuse network::NetworkState;\n''',
    "network module import",
)
lib = replace_once(
    lib,
    '''    packages.sort_by(|left, right| {\n        left.display_name\n            .to_lowercase()\n            .cmp(&right.display_name.to_lowercase())\n    });\n    packages.dedup_by(|left, right| left.id == right.id && left.root_dir == right.root_dir);\n    Ok(packages)\n''',
    '''    // Package IDs are the persisted identity in the UI. Keep the first package discovered\n    // according to root priority so duplicate IDs never produce an ambiguous selection.\n    let mut seen_ids = HashSet::new();\n    packages.retain(|package| seen_ids.insert(package.id.clone()));\n    packages.sort_by(|left, right| {\n        left.display_name\n            .to_lowercase()\n            .cmp(&right.display_name.to_lowercase())\n    });\n    Ok(packages)\n''',
    "deduplicate package ids",
)
lib = replace_once(
    lib,
    '''#[tauri::command]\nfn import_pet_from_url(url: String, app: AppHandle) -> Result<PetPackage, String> {\n    let parsed = reqwest::Url::parse(url.trim()).map_err(|error| error.to_string())?;\n    if !matches!(parsed.scheme(), "https" | "http") {\n        return Err("Only http and https pet package URLs are supported".to_string());\n    }\n\n    let response = reqwest::blocking::get(parsed).map_err(|error| error.to_string())?;\n    if !response.status().is_success() {\n        return Err(format!("Download failed with status {}", response.status()));\n    }\n    let bytes = response.bytes().map_err(|error| error.to_string())?;\n''',
    '''#[tauri::command]\nasync fn import_pet_from_url(\n    url: String,\n    app: AppHandle,\n    network: tauri::State<'_, NetworkState>,\n) -> Result<PetPackage, String> {\n    let parsed = reqwest::Url::parse(url.trim()).map_err(|error| error.to_string())?;\n    if !matches!(parsed.scheme(), "https" | "http") {\n        return Err("Only http and https pet package URLs are supported".to_string());\n    }\n\n    let response = network\n        .client\n        .get(parsed)\n        .send()\n        .await\n        .map_err(|error| error.to_string())?;\n    if !response.status().is_success() {\n        return Err(format!("Download failed with status {}", response.status()));\n    }\n    let bytes = response.bytes().await.map_err(|error| error.to_string())?;\n''',
    "async pet download",
)
lib = replace_once(
    lib,
    '''#[tauri::command]\nfn send_llm_chat(request: LlmChatRequest) -> Result<LlmChatResponse, String> {\n''',
    '''#[tauri::command]\nasync fn send_llm_chat(\n    network: tauri::State<'_, NetworkState>,\n    request: LlmChatRequest,\n) -> Result<LlmChatResponse, String> {\n''',
    "async llm command signature",
)
lib = replace_once(
    lib,
    '''    let client = reqwest::blocking::Client::builder()\n        .timeout(Duration::from_secs(90))\n        .build()\n        .map_err(|error| error.to_string())?;\n\n    let mut builder = client\n        .post(url)\n        .header(reqwest::header::CONTENT_TYPE, "application/json")\n        .json(&payload);\n''',
    '''    let mut builder = network\n        .client\n        .post(url)\n        .header(reqwest::header::CONTENT_TYPE, "application/json")\n        .json(&payload);\n''',
    "reuse llm client",
)
lib = replace_once(
    lib,
    '''    let response = builder.send().map_err(|error| error.to_string())?;\n    let status = response.status();\n    let body = response.text().map_err(|error| error.to_string())?;\n''',
    '''    let response = builder\n        .send()\n        .await\n        .map_err(|error| error.to_string())?;\n    let status = response.status();\n    let body = response\n        .text()\n        .await\n        .map_err(|error| error.to_string())?;\n''',
    "await llm response",
)
lib = replace_once(
    lib,
    '''    builder\n        .plugin(tauri_plugin_store::Builder::default().build())\n''',
    '''    builder\n        .manage(NetworkState::new().expect("failed to create HTTP client"))\n        .plugin(tauri_plugin_store::Builder::default().build())\n''',
    "manage shared HTTP client",
)
lib = replace_once(
    lib,
    '''        let key = normalized.to_string_lossy().to_lowercase();\n''',
    '''        let key = path_identity_key(&normalized);\n''',
    "platform-aware pet root identity",
)
lib = replace_once(
    lib,
    '''            let key = path.to_string_lossy().to_lowercase();\n''',
    '''            let key = path_identity_key(&path);\n''',
    "platform-aware settings path identity",
)
lib = replace_once(
    lib,
    '''fn round_to_i32(value: f64) -> i32 {\n    value\n        .round()\n        .clamp(i32::MIN as f64, i32::MAX as f64) as i32\n}\n\n''',
    '''fn round_to_i32(value: f64) -> i32 {\n    value\n        .round()\n        .clamp(i32::MIN as f64, i32::MAX as f64) as i32\n}\n\nfn path_identity_key(path: &Path) -> String {\n    #[cfg(windows)]\n    {\n        return path.to_string_lossy().to_lowercase();\n    }\n\n    #[cfg(not(windows))]\n    {\n        path.to_string_lossy().into_owned()\n    }\n}\n\n''',
    "path identity helper",
)
if "fn safe_pet_ids_accept_expected_values()" not in lib:
    lib += '''\n#[cfg(test)]\nmod tests {\n    use super::*;\n\n    #[test]\n    fn safe_pet_ids_accept_expected_values() {\n        assert!(is_safe_pet_id("venti-bard"));\n        assert!(is_safe_pet_id("pet-123"));\n        assert!(!is_safe_pet_id("../pet"));\n        assert!(!is_safe_pet_id("Pet-123"));\n        assert!(!is_safe_pet_id("ab"));\n    }\n\n    #[test]\n    fn chat_completion_urls_are_normalized() {\n        assert_eq!(\n            normalize_chat_completion_url("https://example.com/v1").unwrap(),\n            "https://example.com/v1/chat/completions"\n        );\n        assert_eq!(\n            normalize_chat_completion_url("https://example.com/v1/chat/completions").unwrap(),\n            "https://example.com/v1/chat/completions"\n        );\n        assert!(normalize_chat_completion_url("file:///tmp/model").is_err());\n    }\n}\n'''
write("src-tauri/src/lib.rs", lib)

# Coalesce expensive disk writes while keeping the in-memory Store and localStorage current.
settings = read("src/lib/settings.ts")
settings = replace_once(settings, 'load("settings.json", { autoSave: true, defaults: {} })', 'load("settings.json", { autoSave: false, defaults: {} })', "disable store autosave")
settings = replace_once(
    settings,
    '''let settingsStore: Store | null = null;\n''',
    '''let settingsStore: Store | null = null;\nlet pendingDiskSettings: AppSettings | null = null;\nlet persistTimer: number | null = null;\nlet persistInFlight = false;\nconst SETTINGS_PERSIST_DELAY_MS = 250;\n''',
    "settings persistence state",
)
settings = replace_once(
    settings,
    '''  const saved = await store.get<Partial<AppSettings>>("appSettings");\n  const merged = mergeSettingsSources(saved, backup);\n  const normalized = normalizeSettings(merged);\n''',
    '''  const saved = await store.get<Partial<AppSettings>>("appSettings");\n  const browser = readBrowserSettings();\n  const merged = mergeSettingsSources(browser, mergeSettingsSources(saved, backup));\n  const normalized = normalizeSettings(merged);\n''',
    "prefer latest browser mirror on startup",
)
settings = replace_once(
    settings,
    '''export async function saveSettings(settings: AppSettings): Promise<void> {\n  localStorage.setItem("desktop-pet-settings", JSON.stringify(settings));\n  await safeWriteSettingsBackup(settings);\n\n  const store = await getSettingsStore();\n  if (!store) {\n    return;\n  }\n  await store.set("appSettings", settings);\n  await store.save();\n}\n''',
    '''export async function saveSettings(settings: AppSettings): Promise<void> {\n  localStorage.setItem("desktop-pet-settings", JSON.stringify(settings));\n\n  const store = await getSettingsStore();\n  if (store) {\n    await store.set("appSettings", settings);\n  }\n  queueDiskPersistence(settings, store);\n}\n\nfunction queueDiskPersistence(settings: AppSettings, store: Store | null): void {\n  pendingDiskSettings = settings;\n  if (persistTimer !== null) {\n    window.clearTimeout(persistTimer);\n  }\n  persistTimer = window.setTimeout(() => {\n    persistTimer = null;\n    void flushDiskPersistence(store);\n  }, SETTINGS_PERSIST_DELAY_MS);\n}\n\nasync function flushDiskPersistence(store: Store | null): Promise<void> {\n  if (persistInFlight) {\n    if (persistTimer === null) {\n      persistTimer = window.setTimeout(() => {\n        persistTimer = null;\n        void flushDiskPersistence(store);\n      }, SETTINGS_PERSIST_DELAY_MS);\n    }\n    return;\n  }\n\n  const settings = pendingDiskSettings;\n  if (!settings) {\n    return;\n  }\n\n  pendingDiskSettings = null;\n  persistInFlight = true;\n  try {\n    await safeWriteSettingsBackup(settings);\n    if (store) {\n      await store.save();\n    }\n  } catch (error) {\n    console.error("Failed to persist desktop pet settings", error);\n  } finally {\n    persistInFlight = false;\n    if (pendingDiskSettings) {\n      queueDiskPersistence(pendingDiskSettings, store);\n    }\n  }\n}\n''',
    "coalesce settings disk writes",
)
write("src/lib/settings.ts", settings)

# Animation speed should affect the first frame as well.
animation = read("src/lib/usePetAnimation.ts")
animation = replace_once(
    animation,
    '    timerRef.current = window.setTimeout(tick, definition.durations[0] ?? 140);\n',
    '    timerRef.current = window.setTimeout(\n      tick,\n      Math.max(40, (definition.durations[0] ?? 140) / speed),\n    );\n',
    "first-frame animation speed",
)
write("src/lib/usePetAnimation.ts", animation)

# Extract palette sampling out of the already-large PetWindow component.
pet_window = read("src/components/PetWindow.tsx")
pet_window = replace_once(
    pet_window,
    '''import { usePetAnimation } from "../lib/usePetAnimation";\n''',
    '''import { usePetAnimation } from "../lib/usePetAnimation";\nimport { DEFAULT_PALETTE, extractPetPalette, type PetPalette } from "../lib/petPalette";\n''',
    "palette import",
)
pet_window = replace_regex_once(
    pet_window,
    r'''interface PetPalette \{\n  accent: string;\n  bubble: string;\n  ink: string;\n\}\n\nconst DEFAULT_PALETTE: PetPalette = \{\n  accent: "#5da996",\n  bubble: "#eef7f1",\n  ink: "#171615",\n\};\n\n''',
    "",
    "remove inline palette types",
)
marker = "\ninterface RgbColor {\n"
index = pet_window.find(marker)
if index == -1:
    raise RuntimeError("palette implementation block not found in PetWindow")
tail = pet_window[index:]
if "function relativeLuminance" not in tail:
    raise RuntimeError("unexpected PetWindow tail while extracting palette")
pet_window = pet_window[:index].rstrip() + "\n"
pet_window = replace_once(pet_window, "    }, 90);\n", "    }, 180);\n", "reduce click-through polling")
write("src/components/PetWindow.tsx", pet_window)

write(
    "src/lib/petPalette.ts",
    '''export interface PetPalette {\n  accent: string;\n  bubble: string;\n  ink: string;\n}\n\ninterface RgbColor {\n  r: number;\n  g: number;\n  b: number;\n}\n\nexport const DEFAULT_PALETTE: PetPalette = {\n  accent: "#5da996",\n  bubble: "#eef7f1",\n  ink: "#171615",\n};\n\nexport function extractPetPalette(\n  url: string,\n  cellWidth: number,\n  cellHeight: number,\n): Promise<PetPalette> {\n  return new Promise((resolve, reject) => {\n    const image = new Image();\n    image.crossOrigin = "anonymous";\n    image.onload = () => {\n      try {\n        const canvas = document.createElement("canvas");\n        canvas.width = 48;\n        canvas.height = 52;\n        const context = canvas.getContext("2d", { willReadFrequently: true });\n        if (!context) {\n          reject(new Error("Canvas is unavailable"));\n          return;\n        }\n        context.drawImage(image, 0, 0, cellWidth, cellHeight, 0, 0, canvas.width, canvas.height);\n        const { data } = context.getImageData(0, 0, canvas.width, canvas.height);\n        let red = 0;\n        let green = 0;\n        let blue = 0;\n        let total = 0;\n\n        for (let index = 0; index < data.length; index += 4) {\n          const alpha = data[index + 3];\n          if (alpha < 44) {\n            continue;\n          }\n\n          const r = data[index];\n          const g = data[index + 1];\n          const b = data[index + 2];\n          const max = Math.max(r, g, b);\n          const min = Math.min(r, g, b);\n          const saturation = max - min;\n          const brightness = (r + g + b) / 3;\n          if (brightness > 236 && saturation < 28) {\n            continue;\n          }\n\n          const weight = (alpha / 255) * (1 + saturation / 180);\n          red += r * weight;\n          green += g * weight;\n          blue += b * weight;\n          total += weight;\n        }\n\n        if (total <= 0) {\n          resolve(DEFAULT_PALETTE);\n          return;\n        }\n\n        resolve(\n          createPalette({\n            r: Math.round(red / total),\n            g: Math.round(green / total),\n            b: Math.round(blue / total),\n          }),\n        );\n      } catch (error) {\n        reject(error);\n      }\n    };\n    image.onerror = () => reject(new Error("Failed to load pet sprite"));\n    image.src = url;\n  });\n}\n\nfunction createPalette(accent: RgbColor): PetPalette {\n  const bubble = blend(accent, { r: 255, g: 253, b: 247 }, 0.78);\n  return {\n    accent: toRgb(accent),\n    bubble: toRgb(bubble),\n    ink: relativeLuminance(bubble) > 0.58 ? "#171615" : "#fffaf2",\n  };\n}\n\nfunction blend(foreground: RgbColor, background: RgbColor, backgroundAmount: number): RgbColor {\n  const foregroundAmount = 1 - backgroundAmount;\n  return {\n    r: Math.round(foreground.r * foregroundAmount + background.r * backgroundAmount),\n    g: Math.round(foreground.g * foregroundAmount + background.g * backgroundAmount),\n    b: Math.round(foreground.b * foregroundAmount + background.b * backgroundAmount),\n  };\n}\n\nfunction toRgb(color: RgbColor): string {\n  return `rgb(${color.r}, ${color.g}, ${color.b})`;\n}\n\nfunction relativeLuminance(color: RgbColor): number {\n  const [r, g, b] = [color.r, color.g, color.b].map((channel) => {\n    const normalized = channel / 255;\n    return normalized <= 0.03928\n      ? normalized / 12.92\n      : Math.pow((normalized + 0.055) / 1.055, 2.4);\n  });\n  return 0.2126 * r + 0.7152 * g + 0.0722 * b;\n}\n''',
)

# Split Tauri capabilities by window and remove permissions unused by webview code.
cap_dir = ROOT / "src-tauri/capabilities"
(cap_dir / "default.json").unlink(missing_ok=True)
write(
    "src-tauri/capabilities/pet.json",
    '''{\n  "$schema": "../gen/schemas/desktop-schema.json",\n  "identifier": "desktop-pet-window",\n  "description": "Capabilities required by the transparent desktop pet window.",\n  "windows": ["pet"],\n  "permissions": [\n    "core:default",\n    "core:event:default",\n    "core:window:default",\n    "core:window:allow-inner-position",\n    "core:window:allow-inner-size",\n    "core:window:allow-outer-position",\n    "core:window:allow-outer-size",\n    "core:window:allow-set-always-on-top",\n    "core:window:allow-set-ignore-cursor-events",\n    "core:window:allow-set-position",\n    "core:window:allow-set-size",\n    "autostart:default",\n    "store:default"\n  ]\n}\n''',
)
write(
    "src-tauri/capabilities/settings.json",
    '''{\n  "$schema": "../gen/schemas/desktop-schema.json",\n  "identifier": "desktop-pet-settings-window",\n  "description": "Capabilities required by the settings window.",\n  "windows": ["settings"],\n  "permissions": [\n    "core:default",\n    "core:app:default",\n    "core:event:default",\n    "core:webview:default",\n    "core:webview:allow-create-webview-window",\n    "core:window:default",\n    "dialog:default",\n    "autostart:default",\n    "store:default"\n  ]\n}\n''',
)

# Version consistency tooling and a zero-dependency test.
write(
    "scripts/check-versions.mjs",
    '''import fs from "node:fs";\nimport path from "node:path";\nimport { fileURLToPath } from "node:url";\n\nexport function readProjectVersions(root = process.cwd()) {\n  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));\n  const tauri = JSON.parse(fs.readFileSync(path.join(root, "src-tauri", "tauri.conf.json"), "utf8"));\n  const cargo = fs.readFileSync(path.join(root, "src-tauri", "Cargo.toml"), "utf8");\n  const cargoVersion = cargo.match(/^version\\s*=\\s*"([^"]+)"/m)?.[1];\n  if (!cargoVersion) {\n    throw new Error("Unable to read Cargo package version");\n  }\n  return { packageJson: pkg.version, cargoToml: cargoVersion, tauriConfig: tauri.version };\n}\n\nexport function assertVersionsMatch(versions) {\n  const unique = new Set(Object.values(versions));\n  if (unique.size !== 1) {\n    throw new Error(`Version mismatch: ${JSON.stringify(versions)}`);\n  }\n  return Object.values(versions)[0];\n}\n\nif (process.argv[1] === fileURLToPath(import.meta.url)) {\n  const versions = readProjectVersions();\n  const version = assertVersionsMatch(versions);\n  console.log(`Version metadata is consistent: ${version}`);\n}\n''',
)
write(
    "tests/version-consistency.test.mjs",
    '''import test from "node:test";\nimport assert from "node:assert/strict";\nimport { assertVersionsMatch, readProjectVersions } from "../scripts/check-versions.mjs";\n\ntest("package, Cargo and Tauri versions stay aligned", () => {\n  const versions = readProjectVersions();\n  assert.equal(assertVersionsMatch(versions), versions.packageJson);\n});\n\ntest("version checker rejects mismatches", () => {\n  assert.throws(\n    () => assertVersionsMatch({ packageJson: "1.0.0", cargoToml: "1.0.1", tauriConfig: "1.0.0" }),\n    /Version mismatch/,\n  );\n});\n''',
)

# Permanent CI.
write(
    ".github/workflows/ci.yml",
    '''name: CI\n\non:\n  push:\n    branches:\n      - main\n  pull_request:\n\npermissions:\n  contents: read\n\nconcurrency:\n  group: ci-${{ github.ref }}\n  cancel-in-progress: true\n\njobs:\n  frontend:\n    name: Frontend checks\n    runs-on: ubuntu-22.04\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 22\n          cache: npm\n      - run: npm ci\n      - run: npm run check\n\n  rust:\n    name: Rust checks\n    runs-on: ubuntu-22.04\n    steps:\n      - uses: actions/checkout@v4\n      - name: Install Tauri dependencies\n        run: |\n          sudo apt-get update\n          sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf\n      - uses: dtolnay/rust-toolchain@stable\n        with:\n          components: rustfmt, clippy\n      - uses: swatinem/rust-cache@v2\n        with:\n          workspaces: ./src-tauri -> target\n      - run: cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check\n      - run: cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings\n      - run: cargo test --manifest-path src-tauri/Cargo.toml\n''',
)

# Gate releases on the same quality checks.
release = read(".github/workflows/release.yml")
if "name: Quality gate" not in release:
    release = replace_once(
        release,
        '''jobs:\n  build:\n    name: Build ${{ matrix.label }}\n''',
        '''jobs:\n  quality:\n    name: Quality gate\n    runs-on: ubuntu-22.04\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 22\n          cache: npm\n      - name: Install Tauri dependencies\n        run: |\n          sudo apt-get update\n          sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf\n      - uses: dtolnay/rust-toolchain@stable\n        with:\n          components: rustfmt, clippy\n      - uses: swatinem/rust-cache@v2\n        with:\n          workspaces: ./src-tauri -> target\n      - run: npm ci\n      - run: npm run check\n      - run: cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check\n      - run: cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings\n      - run: cargo test --manifest-path src-tauri/Cargo.toml\n\n  build:\n    needs: quality\n    name: Build ${{ matrix.label }}\n''',
        "release quality gate",
    )
write(".github/workflows/release.yml", release)

# Apache-2.0 license plus explicit asset caveat in README.
system_license = Path("/usr/share/common-licenses/Apache-2.0")
if not system_license.is_file():
    raise RuntimeError("Ubuntu Apache-2.0 license text is unavailable")
write("LICENSE", system_license.read_text(encoding="utf-8").rstrip() + "\n")

readme = read("README.md")
if "## License" not in readme:
    readme = readme.rstrip() + '''\n\n## License\n\nThe Desktop Pet Launcher source code is licensed under the **Apache License 2.0**.\n\nDesktop pet artwork, character names, gallery packages, and other third-party assets may use separate licenses or require separate rights review. The Apache-2.0 license for this repository's source code does not automatically grant rights to those assets. Check each pet package's license metadata before redistributing it.\n'''
write("README.md", readme + "\n")

# Remove the one-shot maintenance bootstrap from the final tree.
(ROOT / "scripts/apply_quality_upgrade.py").unlink(missing_ok=True)
(ROOT / ".github/workflows/maintenance-quality-upgrade.yml").unlink(missing_ok=True)

print("Quality upgrade patch applied successfully")
