import { load, type Store } from "@tauri-apps/plugin-store";
import type { PetState } from "./petContract";

export interface AppSettings {
  activePetId: string | null;
  width: number;
  height: number;
  x: number | null;
  y: number | null;
  alwaysOnTop: boolean;
  dragEnabled: boolean;
  locked: boolean;
  clickThrough: boolean;
  reducedMotion: boolean;
  animationSpeed: number;
  manualState: PetState;
  autostart: boolean;
  showOnStartup: boolean;
  pixelated: boolean;
  idleVariety: boolean;
  keepAspectRatio: boolean;
  petFolders: string[];
  galleryIndexUrl: string;
}

export const DEFAULT_GALLERY_INDEX_URL =
  "https://wangling-miao.github.io/awesome-desktop-pets/index.json";

export const DEFAULT_SETTINGS: AppSettings = {
  activePetId: null,
  width: 192,
  height: 208,
  x: null,
  y: null,
  alwaysOnTop: true,
  dragEnabled: true,
  locked: false,
  clickThrough: false,
  reducedMotion: false,
  animationSpeed: 1,
  manualState: "idle",
  autostart: false,
  showOnStartup: true,
  pixelated: false,
  idleVariety: true,
  keepAspectRatio: true,
  petFolders: [],
  galleryIndexUrl: DEFAULT_GALLERY_INDEX_URL,
};

let settingsStore: Store | null = null;

export async function getSettingsStore(): Promise<Store | null> {
  if (settingsStore) {
    return settingsStore;
  }
  try {
    settingsStore = await load("settings.json", { autoSave: true, defaults: {} });
    return settingsStore;
  } catch {
    return null;
  }
}

export async function loadSettings(): Promise<AppSettings> {
  const store = await getSettingsStore();
  if (!store) {
    return { ...DEFAULT_SETTINGS };
  }
  const saved = await store.get<Partial<AppSettings>>("appSettings");
  return normalizeSettings(saved);
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const store = await getSettingsStore();
  if (!store) {
    localStorage.setItem("desktop-pet-settings", JSON.stringify(settings));
    return;
  }
  await store.set("appSettings", settings);
  await store.save();
}

export function normalizeSettings(saved?: Partial<AppSettings> | null): AppSettings {
  const browserSaved = !saved ? readBrowserSettings() : null;
  const merged = { ...DEFAULT_SETTINGS, ...(browserSaved ?? saved ?? {}) };

  return {
    ...merged,
    width: clampNumber(merged.width, 96, 1200, DEFAULT_SETTINGS.width),
    height: clampNumber(merged.height, 104, 1300, DEFAULT_SETTINGS.height),
    x: nullableNumber(merged.x),
    y: nullableNumber(merged.y),
    animationSpeed: clampNumber(merged.animationSpeed, 0.25, 3, 1),
    manualState: merged.manualState,
    idleVariety: Boolean(merged.idleVariety),
    keepAspectRatio: Boolean(merged.keepAspectRatio),
    petFolders: normalizeStringArray(merged.petFolders),
    galleryIndexUrl:
      typeof merged.galleryIndexUrl === "string" && merged.galleryIndexUrl.trim()
        ? merged.galleryIndexUrl.trim()
        : DEFAULT_GALLERY_INDEX_URL,
  };
}

function readBrowserSettings(): Partial<AppSettings> | null {
  try {
    const raw = localStorage.getItem("desktop-pet-settings");
    return raw ? (JSON.parse(raw) as Partial<AppSettings>) : null;
  } catch {
    return null;
  }
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  );
}
