use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{
    AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, Runtime, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PetPackage {
    id: String,
    display_name: String,
    description: String,
    root_dir: String,
    manifest_path: String,
    spritesheet_path: String,
    spritesheets: SpriteSources,
    cell_size: CellSize,
    source_scale: u32,
    pixelated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PetManifest {
    id: String,
    #[serde(rename = "displayName")]
    display_name: String,
    description: String,
    #[serde(rename = "spritesheetPath")]
    spritesheet_path: String,
    #[serde(default)]
    spritesheets: Option<SpriteSources>,
    #[serde(default)]
    cell_size: Option<CellSize>,
    #[serde(default)]
    source_scale: Option<u32>,
    #[serde(default)]
    pixelated: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SpriteSources {
    #[serde(rename = "1x")]
    one_x: String,
    #[serde(rename = "2x", skip_serializing_if = "Option::is_none")]
    two_x: Option<String>,
    #[serde(rename = "4x", skip_serializing_if = "Option::is_none")]
    four_x: Option<String>,
}

impl Default for SpriteSources {
    fn default() -> Self {
        Self {
            one_x: "spritesheet.webp".to_string(),
            two_x: None,
            four_x: None,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CellSize {
    width: u32,
    height: u32,
}

impl Default for CellSize {
    fn default() -> Self {
        Self {
            width: 192,
            height: 208,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PetWindowSettingsPatch {
    x: Option<f64>,
    y: Option<f64>,
    width: Option<f64>,
    height: Option<f64>,
    always_on_top: Option<bool>,
    click_through: Option<bool>,
}

#[tauri::command]
fn list_pet_packages(
    app: AppHandle,
    extra_roots: Option<Vec<String>>,
) -> Result<Vec<PetPackage>, String> {
    let mut roots = default_pet_roots(&app)?;
    if let Some(extra_roots) = extra_roots {
        for root in extra_roots {
            if let Some(path) = expand_user_path(&root) {
                roots.push(path);
            }
        }
    }

    let mut seen_roots = HashSet::new();
    let mut packages = Vec::new();
    for root in roots {
        let normalized = root.canonicalize().unwrap_or(root);
        let key = normalized.to_string_lossy().to_lowercase();
        if seen_roots.insert(key) {
            collect_pet_packages(&normalized, &mut packages);
        }
    }

    packages.sort_by(|left, right| {
        left.display_name
            .to_lowercase()
            .cmp(&right.display_name.to_lowercase())
    });
    packages.dedup_by(|left, right| left.id == right.id && left.root_dir == right.root_dir);
    Ok(packages)
}

#[tauri::command]
fn validate_pet_package(path_or_id: String, app: AppHandle) -> Result<PetPackage, String> {
    let direct = PathBuf::from(&path_or_id);
    if direct.is_dir() {
        return read_pet_package(&direct);
    }

    list_pet_packages(app, None)?
        .into_iter()
        .find(|package| package.id == path_or_id)
        .ok_or_else(|| format!("Pet package not found: {path_or_id}"))
}

#[tauri::command]
fn show_settings_window<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let window = ensure_settings_window(&app)?;
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn apply_pet_window_settings<R: Runtime>(
    app: AppHandle<R>,
    patch: PetWindowSettingsPatch,
) -> Result<(), String> {
    let window = app
        .get_webview_window("pet")
        .ok_or_else(|| "Pet window is not available".to_string())?;

    if let (Some(width), Some(height)) = (patch.width, patch.height) {
        window
            .set_size(LogicalSize::new(width, height))
            .map_err(|error| error.to_string())?;
    }

    if let (Some(x), Some(y)) = (patch.x, patch.y) {
        window
            .set_position(PhysicalPosition::new(x.round() as i32, y.round() as i32))
            .map_err(|error| error.to_string())?;
    }

    if let Some(always_on_top) = patch.always_on_top {
        window
            .set_always_on_top(always_on_top)
            .map_err(|error| error.to_string())?;
    }

    if let Some(click_through) = patch.click_through {
        window
            .set_ignore_cursor_events(click_through)
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}

#[tauri::command]
fn reveal_pet_folder(path_or_id: String, app: AppHandle) -> Result<(), String> {
    let package = validate_pet_package(path_or_id, app.clone())?;
    tauri_plugin_opener::open_path(package.root_dir, None::<&str>)
        .map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("pet") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }));
    }

    builder
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .invoke_handler(tauri::generate_handler![
            list_pet_packages,
            validate_pet_package,
            show_settings_window,
            apply_pet_window_settings,
            reveal_pet_folder,
        ])
        .setup(|app| {
            setup_tray(app.handle())?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running desktop pet launcher");
}

fn setup_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let show_hide = MenuItem::with_id(app, "toggle_pet", "显示/隐藏", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "设置", true, None::<&str>)?;
    let lock = MenuItem::with_id(app, "toggle_lock", "锁定/解锁", true, None::<&str>)?;
    let refresh = MenuItem::with_id(app, "refresh_pets", "刷新宠物", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_hide, &settings, &lock, &refresh, &quit])?;

    let mut tray_builder = TrayIconBuilder::with_id("desktop-pet-tray")
        .tooltip("桌宠")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "toggle_pet" => toggle_pet_window(app),
            "settings" => {
                if let Ok(window) = ensure_settings_window(app) {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "toggle_lock" => {
                if let Some(window) = app.get_webview_window("pet") {
                    let _ = window.emit("tray-toggle-lock", ());
                }
            }
            "refresh_pets" => {
                if let Some(window) = app.get_webview_window("settings") {
                    let _ = window.emit("tray-refresh-pets", ());
                }
                if let Some(window) = app.get_webview_window("pet") {
                    let _ = window.emit("tray-refresh-pets", ());
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_pet_window(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon() {
        tray_builder = tray_builder.icon(icon.clone());
    }

    tray_builder.build(app)?;

    Ok(())
}

fn ensure_settings_window<R: Runtime>(app: &AppHandle<R>) -> Result<WebviewWindow<R>, String> {
    if let Some(window) = app.get_webview_window("settings") {
        return Ok(window);
    }

    WebviewWindowBuilder::new(
        app,
        "settings",
        WebviewUrl::App("index.html#settings".into()),
    )
    .title("桌宠设置")
    .inner_size(880.0, 640.0)
    .min_inner_size(760.0, 560.0)
    .resizable(true)
    .decorations(true)
    .visible(false)
    .build()
    .map_err(|error| error.to_string())
}

fn toggle_pet_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("pet") {
        match window.is_visible() {
            Ok(true) => {
                let _ = window.hide();
            }
            _ => {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
    }
}

fn collect_pet_packages(root: &Path, packages: &mut Vec<PetPackage>) {
    if root.join("pet.json").is_file() {
        if let Ok(package) = read_pet_package(root) {
            packages.push(package);
        }
        return;
    }

    let Ok(entries) = fs::read_dir(root) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        if let Ok(package) = read_pet_package(&path) {
            packages.push(package);
        }
    }
}

fn read_pet_package(root: &Path) -> Result<PetPackage, String> {
    let manifest_path = root.join("pet.json");
    let manifest_text = fs::read_to_string(&manifest_path)
        .map_err(|error| format!("Failed to read {}: {error}", manifest_path.display()))?;
    let manifest: PetManifest = serde_json::from_str(&manifest_text)
        .map_err(|error| format!("Invalid {}: {error}", manifest_path.display()))?;

    let spritesheets = manifest
        .spritesheets
        .clone()
        .unwrap_or_else(|| SpriteSources {
            one_x: manifest.spritesheet_path.clone(),
            ..SpriteSources::default()
        });

    let one_x_path = root.join(&spritesheets.one_x);
    if !one_x_path.is_file() {
        return Err(format!("Missing 1x spritesheet: {}", one_x_path.display()));
    }

    let package = PetPackage {
        id: manifest.id,
        display_name: manifest.display_name,
        description: manifest.description,
        root_dir: root.to_string_lossy().to_string(),
        manifest_path: manifest_path.to_string_lossy().to_string(),
        spritesheet_path: one_x_path.to_string_lossy().to_string(),
        spritesheets: SpriteSources {
            one_x: root.join(spritesheets.one_x).to_string_lossy().to_string(),
            two_x: spritesheets
                .two_x
                .map(|path| root.join(path).to_string_lossy().to_string())
                .filter(|path| Path::new(path).is_file()),
            four_x: spritesheets
                .four_x
                .map(|path| root.join(path).to_string_lossy().to_string())
                .filter(|path| Path::new(path).is_file()),
        },
        cell_size: manifest.cell_size.unwrap_or_default(),
        source_scale: manifest.source_scale.unwrap_or(1).max(1),
        pixelated: manifest.pixelated.unwrap_or(false),
    };

    Ok(package)
}

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(PathBuf::from))
}

fn default_pet_roots(app: &AppHandle) -> Result<Vec<PathBuf>, String> {
    let mut roots = Vec::new();
    if let Some(home) = home_dir() {
        roots.push(home.join(".codex").join("pets"));
    }
    roots.push(
        app.path()
            .app_data_dir()
            .map_err(|error| error.to_string())?
            .join("pets"),
    );
    Ok(roots)
}

fn expand_user_path(value: &str) -> Option<PathBuf> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }

    if trimmed == "~" {
        return home_dir();
    }

    if let Some(rest) = trimmed
        .strip_prefix("~/")
        .or_else(|| trimmed.strip_prefix("~\\"))
    {
        return home_dir().map(|home| home.join(rest));
    }

    Some(PathBuf::from(trimmed))
}
