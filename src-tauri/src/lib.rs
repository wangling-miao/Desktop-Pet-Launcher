use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::env;
use std::fs;
use std::io::{self, Cursor};
use std::path::{Path, PathBuf};
use std::time::Duration;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{
    AppHandle, Emitter, Manager, Runtime, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
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
    #[serde(rename = "displayName", default)]
    display_name: Option<String>,
    #[serde(default)]
    name: Option<String>,
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

#[derive(Debug, Clone, Copy)]
struct StartupPetWindowSettings {
    x: Option<f64>,
    y: Option<f64>,
    width: Option<f64>,
    height: Option<f64>,
    always_on_top: Option<bool>,
    click_through: Option<bool>,
    show_on_startup: bool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WindowFrame {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
struct WindowPoint {
    x: f64,
    y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LlmChatMessage {
    role: String,
    content: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LlmChatRequest {
    endpoint: String,
    api_key: String,
    model: String,
    system_prompt: String,
    temperature: f32,
    messages: Vec<LlmChatMessage>,
}

#[derive(Debug, Clone, Serialize)]
struct LlmChatResponse {
    content: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SettingsBackup {
    settings: serde_json::Value,
    path: String,
}

#[derive(Debug, Serialize)]
struct ChatCompletionPayload {
    model: String,
    messages: Vec<LlmChatMessage>,
    temperature: f32,
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
    let window = pet_window(&app)?;

    if patch.x.is_some() || patch.y.is_some() || patch.width.is_some() || patch.height.is_some() {
        let mut frame = read_window_frame(&window)?;
        if let Some(x) = patch.x {
            frame.x = x;
        }
        if let Some(y) = patch.y {
            frame.y = y;
        }
        if let Some(width) = patch.width {
            frame.width = width;
        }
        if let Some(height) = patch.height {
            frame.height = height;
        }
        write_window_frame(&window, frame)?;
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
fn get_pet_window_frame<R: Runtime>(app: AppHandle<R>) -> Result<WindowFrame, String> {
    read_window_frame(&pet_window(&app)?)
}

#[tauri::command]
fn set_pet_window_frame<R: Runtime>(
    app: AppHandle<R>,
    frame: WindowFrame,
) -> Result<(), String> {
    write_window_frame(&pet_window(&app)?, frame)
}

#[tauri::command]
fn move_pet_window<R: Runtime>(app: AppHandle<R>, x: f64, y: f64) -> Result<(), String> {
    let window = pet_window(&app)?;
    let mut frame = read_window_frame(&window)?;
    frame.x = x;
    frame.y = y;
    write_window_frame(&window, frame)
}

#[tauri::command]
fn get_cursor_position<R: Runtime>(app: AppHandle<R>) -> Result<Option<WindowPoint>, String> {
    let window = pet_window(&app)?;
    read_cursor_position(&window)
}

#[tauri::command]
fn read_settings_backup(app: AppHandle) -> Result<Option<SettingsBackup>, String> {
    for path in settings_backup_candidates(&app) {
        if let Some(settings) = read_settings_from_file(&path) {
            return Ok(Some(SettingsBackup {
                settings,
                path: path.to_string_lossy().to_string(),
            }));
        }
    }

    Ok(None)
}

#[tauri::command]
fn write_settings_backup(app: AppHandle, settings: serde_json::Value) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
    fs::create_dir_all(&app_data_dir).map_err(|error| error.to_string())?;
    let path = app_data_dir.join("settings.backup.json");
    let content = serde_json::to_string_pretty(&settings).map_err(|error| error.to_string())?;
    fs::write(path, content).map_err(|error| error.to_string())
}

#[tauri::command]
fn reveal_pet_folder(path_or_id: String, app: AppHandle) -> Result<(), String> {
    let package = validate_pet_package(path_or_id, app.clone())?;
    tauri_plugin_opener::open_path(package.root_dir, None::<&str>)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn import_pet_from_url(url: String, app: AppHandle) -> Result<PetPackage, String> {
    let parsed = reqwest::Url::parse(url.trim()).map_err(|error| error.to_string())?;
    if !matches!(parsed.scheme(), "https" | "http") {
        return Err("Only http and https pet package URLs are supported".to_string());
    }

    let response = reqwest::blocking::get(parsed).map_err(|error| error.to_string())?;
    if !response.status().is_success() {
        return Err(format!("Download failed with status {}", response.status()));
    }
    let bytes = response.bytes().map_err(|error| error.to_string())?;

    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    let pets_root = app_data.join("pets");
    let imports_root = app_data.join("imports");
    fs::create_dir_all(&pets_root).map_err(|error| error.to_string())?;
    fs::create_dir_all(&imports_root).map_err(|error| error.to_string())?;

    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_millis();
    let temp_dir = imports_root.join(format!("import-{stamp}"));
    fs::create_dir_all(&temp_dir).map_err(|error| error.to_string())?;

    let imported = (|| {
        let extracted_dir = extract_pet_zip(bytes.as_ref(), &temp_dir)?;
        let package = read_pet_package(&extracted_dir)?;
        if !is_safe_pet_id(&package.id) {
            return Err(format!("Unsafe pet id: {}", package.id));
        }

        let destination = pets_root.join(&package.id);
        let pets_root_canonical = pets_root
            .canonicalize()
            .map_err(|error| error.to_string())?;
        if destination.exists() {
            let destination_canonical = destination
                .canonicalize()
                .map_err(|error| error.to_string())?;
            if !destination_canonical.starts_with(&pets_root_canonical) {
                return Err(format!(
                    "Refusing to replace path outside pet root: {}",
                    destination_canonical.display()
                ));
            }
            fs::remove_dir_all(&destination_canonical).map_err(|error| error.to_string())?;
        }

        copy_dir_all(&extracted_dir, &destination)?;
        read_pet_package(&destination)
    })();

    let _ = fs::remove_dir_all(&temp_dir);
    imported
}

#[tauri::command]
fn send_llm_chat(request: LlmChatRequest) -> Result<LlmChatResponse, String> {
    let endpoint = request.endpoint.trim();
    if endpoint.is_empty() {
        return Err("请先填写接口地址".to_string());
    }

    let model = request.model.trim();
    if model.is_empty() {
        return Err("请先填写模型名称".to_string());
    }

    let mut messages = Vec::new();
    let system_prompt = request.system_prompt.trim();
    if !system_prompt.is_empty() {
        messages.push(LlmChatMessage {
            role: "system".to_string(),
            content: system_prompt.to_string(),
        });
    }

    for message in request.messages.into_iter().take(24) {
        let role = message.role.trim();
        let content = message.content.trim();
        if content.is_empty() || !matches!(role, "user" | "assistant") {
            continue;
        }
        messages.push(LlmChatMessage {
            role: role.to_string(),
            content: content.to_string(),
        });
    }

    if !messages.iter().any(|message| message.role == "user") {
        return Err("没有可发送的用户消息".to_string());
    }

    let url = normalize_chat_completion_url(endpoint)?;
    let payload = ChatCompletionPayload {
        model: model.to_string(),
        messages,
        temperature: request.temperature.clamp(0.0, 2.0),
    };

    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(90))
        .build()
        .map_err(|error| error.to_string())?;

    let mut builder = client
        .post(url)
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .json(&payload);
    let api_key = request.api_key.trim();
    if !api_key.is_empty() {
        builder = builder.bearer_auth(api_key);
    }

    let response = builder.send().map_err(|error| error.to_string())?;
    let status = response.status();
    let body = response.text().map_err(|error| error.to_string())?;
    if !status.is_success() {
        return Err(format!("模型接口返回 {status}: {}", shorten_error(&body)));
    }

    let value: serde_json::Value = serde_json::from_str(&body).map_err(|error| {
        format!(
            "模型接口返回的不是有效 JSON: {error}; {}",
            shorten_error(&body)
        )
    })?;
    extract_chat_content(&value)
        .map(|content| LlmChatResponse { content })
        .ok_or_else(|| "没有在模型返回里找到回复文本".to_string())
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
            get_pet_window_frame,
            set_pet_window_frame,
            move_pet_window,
            get_cursor_position,
            read_settings_backup,
            write_settings_backup,
            reveal_pet_folder,
            import_pet_from_url,
            send_llm_chat,
        ])
        .setup(|app| {
            setup_tray(app.handle())?;
            let _ = restore_pet_window_from_disk(app.handle());
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

fn settings_backup_candidates(app: &AppHandle) -> Vec<PathBuf> {
    let mut directories = Vec::new();
    if let Ok(app_data_dir) = app.path().app_data_dir() {
        directories.push(app_data_dir);
    }

    let directory_names = [
        "top.nether.pet",
        "Desktop Pet Launcher",
        "desktop-pet-launcher",
        "nether-pet-launcher",
        "dev.codex.desktop-pet-launcher",
        "dev.codex",
    ];

    for base in platform_settings_bases() {
        for name in directory_names {
            directories.push(base.join(name));
        }
    }

    let file_names = ["settings.json", "settings.backup.json"];
    let mut seen = HashSet::new();
    let mut paths = Vec::new();
    for directory in directories {
        for file_name in file_names {
            let path = directory.join(file_name);
            let key = path.to_string_lossy().to_lowercase();
            if seen.insert(key) {
                paths.push(path);
            }
        }
    }

    paths
}

fn platform_settings_bases() -> Vec<PathBuf> {
    let mut bases = Vec::new();

    #[cfg(target_os = "windows")]
    {
        if let Some(path) = env::var_os("APPDATA") {
            bases.push(PathBuf::from(path));
        }
        if let Some(path) = env::var_os("LOCALAPPDATA") {
            bases.push(PathBuf::from(path));
        }
    }

    #[cfg(target_os = "macos")]
    {
        if let Some(home) = env::var_os("HOME") {
            bases.push(PathBuf::from(home).join("Library").join("Application Support"));
        }
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        if let Some(path) = env::var_os("XDG_CONFIG_HOME") {
            bases.push(PathBuf::from(path));
        } else if let Some(home) = env::var_os("HOME") {
            bases.push(PathBuf::from(home).join(".config"));
        }

        if let Some(path) = env::var_os("XDG_DATA_HOME") {
            bases.push(PathBuf::from(path));
        } else if let Some(home) = env::var_os("HOME") {
            bases.push(PathBuf::from(home).join(".local").join("share"));
        }
    }

    bases
}

fn read_settings_from_file(path: &Path) -> Option<serde_json::Value> {
    let content = fs::read_to_string(path).ok()?;
    let value = serde_json::from_str::<serde_json::Value>(&content).ok()?;
    extract_settings_value(value)
}

fn extract_settings_value(value: serde_json::Value) -> Option<serde_json::Value> {
    if is_settings_object(&value) {
        return Some(value);
    }

    let app_settings = value.get("appSettings")?;
    if is_settings_object(app_settings) {
        return Some(app_settings.clone());
    }

    let nested_value = app_settings.get("value")?;
    if is_settings_object(nested_value) {
        return Some(nested_value.clone());
    }

    None
}

fn is_settings_object(value: &serde_json::Value) -> bool {
    let Some(object) = value.as_object() else {
        return false;
    };

    object.contains_key("width")
        || object.contains_key("height")
        || object.contains_key("x")
        || object.contains_key("y")
        || object.contains_key("activePetId")
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

fn pet_window<R: Runtime>(app: &AppHandle<R>) -> Result<WebviewWindow<R>, String> {
    app.get_webview_window("pet")
        .ok_or_else(|| "Pet window is not available".to_string())
}

fn restore_pet_window_from_disk(app: &AppHandle) -> Result<(), String> {
    let window = pet_window(app)?;
    let startup_settings = read_startup_pet_window_settings(app)?;
    let fallback_frame = read_window_frame(&window).unwrap_or(WindowFrame {
        x: 80.0,
        y: 80.0,
        width: 192.0,
        height: 208.0,
    });

    let (frame, show_on_startup) = if let Some(settings) = startup_settings {
        if let Some(always_on_top) = settings.always_on_top {
            let _ = window.set_always_on_top(always_on_top);
        }
        if let Some(click_through) = settings.click_through {
            let _ = window.set_ignore_cursor_events(click_through);
        }

        (
            WindowFrame {
                x: settings.x.unwrap_or(fallback_frame.x),
                y: settings.y.unwrap_or(fallback_frame.y),
                width: settings.width.unwrap_or(fallback_frame.width),
                height: settings.height.unwrap_or(fallback_frame.height),
            },
            settings.show_on_startup,
        )
    } else {
        (
            WindowFrame {
                x: 80.0,
                y: 80.0,
                width: fallback_frame.width,
                height: fallback_frame.height,
            },
            true,
        )
    };

    write_window_frame(&window, frame)?;
    if show_on_startup {
        window.show().map_err(|error| error.to_string())?;
    } else {
        let _ = window.hide();
    }

    Ok(())
}

fn read_startup_pet_window_settings(
    app: &AppHandle,
) -> Result<Option<StartupPetWindowSettings>, String> {
    for path in settings_backup_candidates(app) {
        let Some(settings) = read_settings_from_file(&path) else {
            continue;
        };

        return Ok(Some(StartupPetWindowSettings {
            x: settings.get("x").and_then(serde_json::Value::as_f64),
            y: settings.get("y").and_then(serde_json::Value::as_f64),
            width: settings.get("width").and_then(serde_json::Value::as_f64),
            height: settings.get("height").and_then(serde_json::Value::as_f64),
            always_on_top: settings
                .get("alwaysOnTop")
                .and_then(serde_json::Value::as_bool),
            click_through: settings
                .get("clickThrough")
                .and_then(serde_json::Value::as_bool),
            show_on_startup: settings
                .get("showOnStartup")
                .and_then(serde_json::Value::as_bool)
                .unwrap_or(true),
        }));
    }

    Ok(None)
}

#[cfg(windows)]
fn read_window_frame<R: Runtime>(window: &WebviewWindow<R>) -> Result<WindowFrame, String> {
    use windows::Win32::Foundation::RECT;
    use windows::Win32::UI::WindowsAndMessaging::GetWindowRect;

    let hwnd = window.hwnd().map_err(|error| error.to_string())?;
    let mut rect = RECT::default();
    unsafe { GetWindowRect(hwnd, &mut rect) }.map_err(|error| error.to_string())?;
    let scale_factor = window_scale_factor(window)?;

    Ok(WindowFrame {
        x: logical_from_physical(rect.left, scale_factor),
        y: logical_from_physical(rect.top, scale_factor),
        width: logical_size_from_physical(rect.right - rect.left, scale_factor),
        height: logical_size_from_physical(rect.bottom - rect.top, scale_factor),
    })
}

#[cfg(not(windows))]
fn read_window_frame<R: Runtime>(window: &WebviewWindow<R>) -> Result<WindowFrame, String> {
    let scale_factor = window_scale_factor(window)?;
    let position = window.outer_position().map_err(|error| error.to_string())?;
    let size = window.outer_size().map_err(|error| error.to_string())?;

    Ok(WindowFrame {
        x: logical_from_physical(position.x, scale_factor),
        y: logical_from_physical(position.y, scale_factor),
        width: logical_size_from_physical(size.width as i32, scale_factor),
        height: logical_size_from_physical(size.height as i32, scale_factor),
    })
}

#[cfg(windows)]
fn write_window_frame<R: Runtime>(
    window: &WebviewWindow<R>,
    frame: WindowFrame,
) -> Result<(), String> {
    use windows::Win32::UI::WindowsAndMessaging::{SetWindowPos, SWP_NOACTIVATE, SWP_NOZORDER};

    let hwnd = window.hwnd().map_err(|error| error.to_string())?;
    let scale_factor = window_scale_factor(window)?;
    unsafe {
        SetWindowPos(
            hwnd,
            None,
            physical_from_logical(frame.x, scale_factor),
            physical_from_logical(frame.y, scale_factor),
            physical_size_from_logical(frame.width, scale_factor),
            physical_size_from_logical(frame.height, scale_factor),
            SWP_NOZORDER | SWP_NOACTIVATE,
        )
    }
    .map_err(|error| error.to_string())
}

#[cfg(not(windows))]
fn write_window_frame<R: Runtime>(
    window: &WebviewWindow<R>,
    frame: WindowFrame,
) -> Result<(), String> {
    window
        .set_position(tauri::LogicalPosition::new(frame.x, frame.y))
        .map_err(|error| error.to_string())?;
    window
        .set_size(tauri::LogicalSize::new(frame.width, frame.height))
        .map_err(|error| error.to_string())
}

#[cfg(windows)]
fn read_cursor_position<R: Runtime>(
    window: &WebviewWindow<R>,
) -> Result<Option<WindowPoint>, String> {
    use windows::Win32::Foundation::POINT;
    use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;

    let mut point = POINT::default();
    unsafe { GetCursorPos(&mut point) }.map_err(|error| error.to_string())?;
    let scale_factor = window_scale_factor(window)?;
    Ok(Some(WindowPoint {
        x: logical_from_physical(point.x, scale_factor),
        y: logical_from_physical(point.y, scale_factor),
    }))
}

#[cfg(not(windows))]
fn read_cursor_position<R: Runtime>(
    window: &WebviewWindow<R>,
) -> Result<Option<WindowPoint>, String> {
    let position = window.cursor_position().map_err(|error| error.to_string())?;
    let scale_factor = window_scale_factor(window)?;
    Ok(Some(WindowPoint {
        x: (position.x / scale_factor).round(),
        y: (position.y / scale_factor).round(),
    }))
}

fn window_scale_factor<R: Runtime>(window: &WebviewWindow<R>) -> Result<f64, String> {
    #[cfg(windows)]
    {
        use windows::Win32::UI::HiDpi::GetDpiForWindow;

        let hwnd = window.hwnd().map_err(|error| error.to_string())?;
        let dpi = unsafe { GetDpiForWindow(hwnd) };
        if dpi > 0 {
            return Ok(dpi as f64 / 96.0);
        }
    }

    let scale_factor = window.scale_factor().map_err(|error| error.to_string())?;
    if scale_factor.is_finite() && scale_factor > 0.0 {
        Ok(scale_factor)
    } else {
        Ok(1.0)
    }
}

fn logical_from_physical(value: i32, scale_factor: f64) -> f64 {
    (value as f64 / scale_factor).round()
}

fn logical_size_from_physical(value: i32, scale_factor: f64) -> f64 {
    (value.max(1) as f64 / scale_factor).round().max(1.0)
}

fn physical_from_logical(value: f64, scale_factor: f64) -> i32 {
    round_to_i32(value * scale_factor)
}

fn physical_size_from_logical(value: f64, scale_factor: f64) -> i32 {
    round_to_i32(value.max(1.0) * scale_factor).max(1)
}

fn round_to_i32(value: f64) -> i32 {
    value
        .round()
        .clamp(i32::MIN as f64, i32::MAX as f64) as i32
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

    let display_name = manifest
        .display_name
        .clone()
        .or_else(|| manifest.name.clone())
        .unwrap_or_else(|| manifest.id.clone());

    let package = PetPackage {
        id: manifest.id,
        display_name,
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

fn extract_pet_zip(bytes: &[u8], destination: &Path) -> Result<PathBuf, String> {
    let mut archive =
        zip::ZipArchive::new(Cursor::new(bytes)).map_err(|error| error.to_string())?;

    for index in 0..archive.len() {
        let mut file = archive.by_index(index).map_err(|error| error.to_string())?;
        let Some(enclosed_name) = file.enclosed_name().map(|path| path.to_owned()) else {
            return Err(format!("Unsafe zip entry: {}", file.name()));
        };
        let out_path = destination.join(enclosed_name);

        if file.is_dir() {
            fs::create_dir_all(&out_path).map_err(|error| error.to_string())?;
            continue;
        }

        if let Some(parent) = out_path.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let mut out_file = fs::File::create(&out_path).map_err(|error| error.to_string())?;
        io::copy(&mut file, &mut out_file).map_err(|error| error.to_string())?;
    }

    find_extracted_pet_dir(destination)
}

fn find_extracted_pet_dir(root: &Path) -> Result<PathBuf, String> {
    if root.join("pet.json").is_file() {
        return Ok(root.to_path_buf());
    }

    let mut candidates = Vec::new();
    let entries = fs::read_dir(root).map_err(|error| error.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() && path.join("pet.json").is_file() {
            candidates.push(path);
        }
    }

    if candidates.len() == 1 {
        return Ok(candidates.remove(0));
    }

    Err(
        "Imported zip must contain exactly one pet.json at the root or inside one folder"
            .to_string(),
    )
}

fn copy_dir_all(source: &Path, destination: &Path) -> Result<(), String> {
    fs::create_dir_all(destination).map_err(|error| error.to_string())?;
    for entry in fs::read_dir(source).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let entry_type = entry.file_type().map_err(|error| error.to_string())?;
        let target = destination.join(entry.file_name());
        if entry_type.is_dir() {
            copy_dir_all(&entry.path(), &target)?;
        } else if entry_type.is_file() {
            fs::copy(entry.path(), target).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

fn is_safe_pet_id(value: &str) -> bool {
    let bytes = value.as_bytes();
    if !(3..=64).contains(&bytes.len()) {
        return false;
    }
    let is_alnum = |byte: u8| byte.is_ascii_lowercase() || byte.is_ascii_digit();
    is_alnum(bytes[0])
        && is_alnum(bytes[bytes.len() - 1])
        && bytes
            .iter()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || *byte == b'-')
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

fn normalize_chat_completion_url(endpoint: &str) -> Result<String, String> {
    let trimmed = endpoint.trim().trim_end_matches('/');
    let parsed = reqwest::Url::parse(trimmed).map_err(|error| error.to_string())?;
    if !matches!(parsed.scheme(), "https" | "http") {
        return Err("接口地址只支持 http 或 https".to_string());
    }

    if parsed.path().ends_with("/chat/completions") {
        return Ok(trimmed.to_string());
    }

    if parsed.path().ends_with("/v1") {
        Ok(format!("{trimmed}/chat/completions"))
    } else {
        Ok(format!("{trimmed}/v1/chat/completions"))
    }
}

fn extract_chat_content(value: &serde_json::Value) -> Option<String> {
    value
        .pointer("/choices/0/message/content")
        .and_then(|content| content.as_str())
        .or_else(|| {
            value
                .pointer("/choices/0/text")
                .and_then(|content| content.as_str())
        })
        .or_else(|| {
            value
                .get("output_text")
                .and_then(|content| content.as_str())
        })
        .map(str::trim)
        .filter(|content| !content.is_empty())
        .map(ToOwned::to_owned)
}

fn shorten_error(body: &str) -> String {
    const MAX_LEN: usize = 360;
    let compact = body.split_whitespace().collect::<Vec<_>>().join(" ");
    if compact.chars().count() <= MAX_LEN {
        return compact;
    }
    compact.chars().take(MAX_LEN).collect::<String>() + "..."
}
