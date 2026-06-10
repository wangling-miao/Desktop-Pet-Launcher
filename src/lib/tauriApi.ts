import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import {
  LogicalPosition,
  LogicalSize,
  cursorPosition,
  getCurrentWindow,
} from "@tauri-apps/api/window";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { open } from "@tauri-apps/plugin-dialog";
import packageInfo from "../../package.json";
import type { AppSettings } from "./settings";
import type { PetPackage } from "./petContract";

const LATEST_RELEASE_API_URL =
  "https://api.github.com/repos/wangling-miao/Desktop-Pet-Launcher/releases/latest";
export const APP_LATEST_RELEASE_URL =
  "https://github.com/wangling-miao/Desktop-Pet-Launcher/releases/latest";

export interface GalleryPet {
  id: string;
  name: string;
  displayName?: string;
  version: string;
  author: string;
  description: string;
  tags: string[];
  license: string;
  preview: string;
  previewImage?: string;
  manifest?: string;
  download: string;
  downloadSize?: number;
  downloadSha256?: string;
  format: string;
  resolution: string;
  createdAt: string;
}

export interface GalleryIndex {
  schemaVersion: number;
  generatedAt: string;
  repository?: string;
  pets: GalleryPet[];
}

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface LlmChatRequest {
  endpoint: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  temperature: number;
  messages: ChatMessage[];
}

export interface LlmChatResponse {
  content: string;
}

export interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  releaseUrl: string;
  releaseName?: string;
}

export interface SettingsBackupResult {
  settings: Partial<AppSettings>;
  path: string;
}

export interface MonitorWorkArea {
  x: number;
  y: number;
  width: number;
  height: number;
  scaleFactor: number;
}

interface WindowPlacement {
  x: number;
  y: number;
}

export function isTauriRuntime(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

export async function listPetPackages(petFolders: string[] = []): Promise<PetPackage[]> {
  if (!isTauriRuntime()) {
    return [];
  }
  return invoke<PetPackage[]>("list_pet_packages", { extraRoots: petFolders });
}

export async function showSettingsWindow(): Promise<void> {
  if (!isTauriRuntime()) {
    location.hash = "settings";
    return;
  }
  await invoke("show_settings_window");
}

export async function revealPetFolder(pathOrId: string): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  await invoke("reveal_pet_folder", { pathOrId });
}

export async function importPetFromUrl(url: string): Promise<PetPackage | null> {
  if (!isTauriRuntime()) {
    return null;
  }
  return invoke<PetPackage>("import_pet_from_url", { url });
}

export async function choosePetFolder(): Promise<string | null> {
  if (!isTauriRuntime()) {
    return null;
  }
  const selected = await open({
    directory: true,
    multiple: false,
    title: "选择宠物文件夹",
  });
  return typeof selected === "string" ? selected : null;
}

export async function applyPetWindowSettings(settings: Partial<AppSettings>): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  await invoke("apply_pet_window_settings", {
    patch: {
      x: settings.x,
      y: settings.y,
      width: settings.width,
      height: settings.height,
      alwaysOnTop: settings.alwaysOnTop,
      clickThrough: settings.clickThrough,
    },
  });
}

export async function notifyPetSettings(settings: AppSettings): Promise<void> {
  if (!isTauriRuntime()) {
    window.dispatchEvent(new CustomEvent("settings-updated", { detail: settings }));
    return;
  }
  await getCurrentWindow().emitTo("pet", "settings-updated", settings);
}

export async function setCurrentWindowGeometry(settings: AppSettings): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  const window = getCurrentWindow();
  const position = await normalizePetWindowPosition(settings);
  await window.setSize(new LogicalSize(settings.width, settings.height));
  await window.setPosition(new LogicalPosition(position.x, position.y));
  await window.setAlwaysOnTop(settings.alwaysOnTop);
  await window.setIgnoreCursorEvents(settings.clickThrough);
}

export async function normalizePetWindowPosition(
  settings: Pick<AppSettings, "height" | "width" | "x" | "y">,
): Promise<WindowPlacement> {
  const fallback = { x: 80, y: 80 };
  const requested = {
    x: Number.isFinite(settings.x) ? Math.round(settings.x ?? fallback.x) : fallback.x,
    y: Number.isFinite(settings.y) ? Math.round(settings.y ?? fallback.y) : fallback.y,
  };
  if (!isTauriRuntime()) {
    return requested;
  }

  const scaleFactor = await currentWindowScaleFactor();
  const workArea = browserWorkArea();
  const migrated = migrateSavedPositionToLogical(requested, workArea, scaleFactor);
  const margin = 8;
  const minX = workArea.x + margin;
  const minY = workArea.y + margin;
  const maxX = workArea.x + workArea.width - settings.width - margin;
  const maxY = workArea.y + workArea.height - settings.height - margin;

  return {
    x: clamp(migrated.x, minX, Math.max(minX, maxX)),
    y: clamp(migrated.y, minY, Math.max(minY, maxY)),
  };
}

export async function setCurrentWindowClickThrough(enabled: boolean): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  await getCurrentWindow().setIgnoreCursorEvents(enabled);
}

export async function setCurrentWindowSize(width: number, height: number): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  await getCurrentWindow().setSize(new LogicalSize(width, height));
}

export async function setCurrentWindowFrame(
  width: number,
  height: number,
  x: number,
  y: number,
): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  const window = getCurrentWindow();
  await window.setPosition(new LogicalPosition(Math.round(x), Math.round(y)));
  await window.setSize(new LogicalSize(width, height));
}

export async function captureCurrentWindowPosition(): Promise<{ x: number; y: number } | null> {
  if (!isTauriRuntime()) {
    return null;
  }
  const position = await getCurrentWindow().outerPosition();
  return toLogicalPosition({ x: position.x, y: position.y }, await currentWindowScaleFactor());
}

export async function captureCursorPosition(): Promise<{ x: number; y: number } | null> {
  if (!isTauriRuntime()) {
    return null;
  }
  const position = await cursorPosition();
  return toLogicalPosition({ x: position.x, y: position.y }, await currentWindowScaleFactor());
}

export async function moveCurrentWindowTo(x: number, y: number): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  await getCurrentWindow().setPosition(new LogicalPosition(Math.round(x), Math.round(y)));
}

export async function currentWindowScaleFactor(): Promise<number> {
  if (!isTauriRuntime()) {
    return window.devicePixelRatio || 1;
  }
  return getCurrentWindow().scaleFactor();
}

export async function currentWindowWorkArea(): Promise<MonitorWorkArea | null> {
  const workArea = browserWorkArea();
  return {
    ...workArea,
    scaleFactor: await currentWindowScaleFactor(),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.round(Math.min(max, Math.max(min, value)));
}

function browserWorkArea(): Omit<MonitorWorkArea, "scaleFactor"> {
  const screen = window.screen as Screen & { availLeft?: number; availTop?: number };
  return {
    x: screen.availLeft ?? 0,
    y: screen.availTop ?? 0,
    width: screen.availWidth,
    height: screen.availHeight,
  };
}

function migrateSavedPositionToLogical(
  position: WindowPlacement,
  workArea: Omit<MonitorWorkArea, "scaleFactor">,
  scaleFactor: number,
): WindowPlacement {
  if (scaleFactor <= 1) {
    return position;
  }

  const outsideLogical =
    position.x > workArea.x + workArea.width ||
    position.y > workArea.y + workArea.height ||
    position.x < workArea.x - workArea.width ||
    position.y < workArea.y - workArea.height;
  const scaled = {
    x: Math.round(position.x / scaleFactor),
    y: Math.round(position.y / scaleFactor),
  };
  const scaledInsideLogical =
    scaled.x >= workArea.x - 64 &&
    scaled.x <= workArea.x + workArea.width + 64 &&
    scaled.y >= workArea.y - 64 &&
    scaled.y <= workArea.y + workArea.height + 64;

  return outsideLogical && scaledInsideLogical ? scaled : position;
}

function toLogicalPosition(position: WindowPlacement, scaleFactor: number): WindowPlacement {
  if (scaleFactor <= 1) {
    return {
      x: Math.round(position.x),
      y: Math.round(position.y),
    };
  }

  const workArea = browserWorkArea();
  return migrateSavedPositionToLogical(
    {
      x: Math.round(position.x),
      y: Math.round(position.y),
    },
    workArea,
    scaleFactor,
  );
}

export function toAssetUrl(path: string): string {
  return isTauriRuntime() ? convertFileSrc(path) : path;
}

export async function readAutostart(): Promise<boolean> {
  if (!isTauriRuntime()) {
    return false;
  }
  return isEnabled();
}

export async function writeAutostart(enabled: boolean): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  if (enabled) {
    await enable();
  } else {
    await disable();
  }
}

export async function restoreAutostartPreference(preferred: boolean): Promise<boolean> {
  if (!isTauriRuntime()) {
    return preferred;
  }

  try {
    const enabled = await readAutostart();
    if (preferred && !enabled) {
      await writeAutostart(true);
      return true;
    }
    return enabled;
  } catch {
    return preferred;
  }
}

export async function readSettingsBackup(): Promise<SettingsBackupResult | null> {
  if (!isTauriRuntime()) {
    return null;
  }

  return invoke<SettingsBackupResult | null>("read_settings_backup");
}

export async function writeSettingsBackup(settings: AppSettings): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }

  await invoke("write_settings_backup", { settings });
}

export async function readAppVersion(): Promise<string> {
  if (!isTauriRuntime()) {
    return packageInfo.version;
  }

  try {
    return await getVersion();
  } catch {
    return packageInfo.version;
  }
}

export async function checkForAppUpdate(): Promise<UpdateCheckResult> {
  const [currentVersion, response] = await Promise.all([
    readAppVersion(),
    fetch(LATEST_RELEASE_API_URL, {
      cache: "no-store",
      headers: {
        Accept: "application/vnd.github+json",
      },
    }),
  ]);

  if (!response.ok) {
    throw new Error(`GitHub Release HTTP ${response.status}`);
  }

  const latest = (await response.json()) as {
    tag_name?: string;
    name?: string;
    html_url?: string;
  };
  const latestVersion = normalizeVersion(latest.tag_name ?? "");

  return {
    currentVersion: normalizeVersion(currentVersion),
    latestVersion,
    updateAvailable: compareVersions(latestVersion, currentVersion) > 0,
    releaseUrl: latest.html_url ?? APP_LATEST_RELEASE_URL,
    releaseName: latest.name,
  };
}

export async function sendLlmChat(request: LlmChatRequest): Promise<LlmChatResponse> {
  if (!isTauriRuntime()) {
    await new Promise((resolve) => window.setTimeout(resolve, 520));
    return {
      content:
        "这是预览环境的模拟回复。打包运行后，我会使用你在设置里配置的接口地址和模型来对话。",
    };
  }

  return invoke<LlmChatResponse>("send_llm_chat", { request });
}

function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/i, "");
}

function compareVersions(left: string, right: string): number {
  const leftParts = normalizeVersion(left).split(/[.-]/).map(toVersionNumber);
  const rightParts = normalizeVersion(right).split(/[.-]/).map(toVersionNumber);
  const length = Math.max(leftParts.length, rightParts.length, 3);

  for (let index = 0; index < length; index += 1) {
    const delta = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (delta !== 0) {
      return delta;
    }
  }

  return 0;
}

function toVersionNumber(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}
