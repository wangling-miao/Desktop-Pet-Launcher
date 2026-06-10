import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { LogicalSize, PhysicalPosition, getCurrentWindow } from "@tauri-apps/api/window";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { open } from "@tauri-apps/plugin-dialog";
import type { AppSettings } from "./settings";
import type { PetPackage } from "./petContract";

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
  await window.setSize(new LogicalSize(settings.width, settings.height));
  if (settings.x !== null && settings.y !== null) {
    await window.setPosition(new PhysicalPosition(Math.round(settings.x), Math.round(settings.y)));
  }
  await window.setAlwaysOnTop(settings.alwaysOnTop);
  await window.setIgnoreCursorEvents(settings.clickThrough);
}

export async function captureCurrentWindowPosition(): Promise<{ x: number; y: number } | null> {
  if (!isTauriRuntime()) {
    return null;
  }
  const position = await getCurrentWindow().outerPosition();
  return { x: position.x, y: position.y };
}

export async function moveCurrentWindowTo(x: number, y: number): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  await getCurrentWindow().setPosition(new PhysicalPosition(Math.round(x), Math.round(y)));
}

export async function currentWindowScaleFactor(): Promise<number> {
  if (!isTauriRuntime()) {
    return window.devicePixelRatio || 1;
  }
  return getCurrentWindow().scaleFactor();
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
