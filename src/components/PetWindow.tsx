import { PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Settings, Sparkles } from "lucide-react";
import {
  ATLAS_COLUMNS,
  ATLAS_ROWS,
  STATE_DEFINITIONS,
  pickSpriteSource,
  type PetPackage,
} from "../lib/petContract";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type AppSettings } from "../lib/settings";
import {
  applyPetWindowSettings,
  captureCurrentWindowPosition,
  currentWindowScaleFactor,
  isTauriRuntime,
  listPetPackages,
  moveCurrentWindowTo,
  notifyPetSettings,
  setCurrentWindowGeometry,
  showSettingsWindow,
  toAssetUrl,
} from "../lib/tauriApi";
import { usePetAnimation } from "../lib/usePetAnimation";

export function PetWindow() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [packages, setPackages] = useState<PetPackage[]>([]);
  const [ready, setReady] = useState(false);
  const [dragState, setDragState] = useState<"running-left" | "running-right" | null>(null);
  const [idleVariant, setIdleVariant] = useState<AppSettings["manualState"]>("idle");
  const settingsRef = useRef<AppSettings>(DEFAULT_SETTINGS);
  const dragRef = useRef<{
    pointerId: number;
    startScreenX: number;
    startScreenY: number;
    originX: number;
    originY: number;
    scaleFactor: number;
    moved: boolean;
    lastDirection: "running-left" | "running-right" | null;
  } | null>(null);

  const refreshPackages = useCallback(async (petFolders: string[] = []) => {
    const found = await listPetPackages(petFolders);
    setPackages(found);
    return found;
  }, []);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      const loadedSettings = await loadSettings();
      const foundPackages = await refreshPackages(loadedSettings.petFolders);
      if (cancelled) {
        return;
      }
      const activePetId = loadedSettings.activePetId ?? foundPackages[0]?.id ?? null;
      const nextSettings = { ...loadedSettings, activePetId };
      setSettings(nextSettings);
      await setCurrentWindowGeometry(nextSettings);
      setReady(true);
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, [refreshPackages]);

  useEffect(() => {
    if (!settings.idleVariety || settings.reducedMotion || settings.manualState !== "idle") {
      setIdleVariant("idle");
      return;
    }

    const variants: AppSettings["manualState"][] = ["idle", "waving", "jumping", "review"];
    let index = 0;
    const interval = window.setInterval(() => {
      index = (index + 1) % variants.length;
      const next = variants[index];
      setIdleVariant(next);
      if (next !== "idle") {
        window.setTimeout(() => setIdleVariant("idle"), 2600);
      }
    }, 9000);

    return () => window.clearInterval(interval);
  }, [settings.idleVariety, settings.manualState, settings.reducedMotion]);

  useEffect(() => {
    if (!isTauriRuntime()) {
      const handler = (event: Event) => {
        const nextSettings = (event as CustomEvent<AppSettings>).detail;
        setSettings(nextSettings);
        void refreshPackages(nextSettings.petFolders);
      };
      window.addEventListener("settings-updated", handler);
      return () => window.removeEventListener("settings-updated", handler);
    }

    const unlisteners: Array<() => void> = [];
    getCurrentWindow()
      .listen<AppSettings>("settings-updated", (event) => {
        setSettings(event.payload);
        void refreshPackages(event.payload.petFolders);
      })
      .then((unlisten) => unlisteners.push(unlisten))
      .catch(() => undefined);
    getCurrentWindow()
      .listen("tray-toggle-lock", () => {
        setSettings((current) => {
          const next = { ...current, locked: !current.locked };
          void saveSettings(next);
          void notifyPetSettings(next);
          return next;
        });
      })
      .then((unlisten) => unlisteners.push(unlisten))
      .catch(() => undefined);
    getCurrentWindow()
      .listen("tray-refresh-pets", () => {
        void refreshPackages(settingsRef.current.petFolders);
      })
      .then((unlisten) => unlisteners.push(unlisten))
      .catch(() => undefined);

    return () => unlisteners.forEach((unlisten) => unlisten());
  }, [refreshPackages]);

  const activePet = useMemo(() => {
    return packages.find((candidate) => candidate.id === settings.activePetId) ?? packages[0];
  }, [packages, settings.activePetId]);

  const visualState = dragState ?? (settings.manualState === "idle" ? idleVariant : settings.manualState);
  const frame = usePetAnimation(visualState, settings.animationSpeed, settings.reducedMotion);

  const sprite = useMemo(() => {
    if (!activePet) {
      return null;
    }
    const source = pickSpriteSource(
      activePet.spritesheets,
      { width: settings.width, height: settings.height },
      activePet.cellSize,
      window.devicePixelRatio,
    );
    return {
      ...source,
      url: toAssetUrl(source.path),
    };
  }, [activePet, settings.height, settings.width]);

  const definition = STATE_DEFINITIONS[visualState];
  const pixelated = settings.pixelated || activePet?.pixelated;

  async function handlePointerDown(event: PointerEvent<HTMLElement>) {
    if (event.button !== 0) {
      return;
    }
    if (settings.locked || !settings.dragEnabled || settings.clickThrough) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const [position, scaleFactor] = await Promise.all([
      captureCurrentWindowPosition(),
      currentWindowScaleFactor(),
    ]);
    dragRef.current = {
      pointerId: event.pointerId,
      startScreenX: event.screenX,
      startScreenY: event.screenY,
      originX: position?.x ?? settings.x ?? 80,
      originY: position?.y ?? settings.y ?? 80,
      scaleFactor,
      moved: false,
      lastDirection: null,
    };
  }

  async function handlePointerMove(event: PointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    const dx = (event.screenX - drag.startScreenX) * drag.scaleFactor;
    const dy = (event.screenY - drag.startScreenY) * drag.scaleFactor;
    if (Math.abs(dx) + Math.abs(dy) < 4) {
      return;
    }
    drag.moved = true;
    const direction = dx < 0 ? "running-left" : "running-right";
    if (direction !== drag.lastDirection) {
      drag.lastDirection = direction;
      setDragState(direction);
    }
    await moveCurrentWindowTo(drag.originX + dx, drag.originY + dy);
  }

  async function handlePointerUp(event: PointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (!drag.moved) {
      setDragState(null);
      return;
    }
    const position = await captureCurrentWindowPosition();
    if (!position) {
      setDragState(null);
      return;
    }
    const next = { ...settings, ...position };
    setSettings(next);
    await saveSettings(next);
    await notifyPetSettings(next);
    window.setTimeout(() => setDragState(null), 900);
  }

  if (!ready) {
    return <div className="pet-shell pet-loading" />;
  }

  return (
    <main
      className="pet-shell"
      style={{ width: settings.width, height: settings.height }}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={() => showSettingsWindow()}
    >
      {sprite && activePet ? (
        <div
          className={`pet-sprite ${pixelated ? "is-pixelated" : ""}`}
          title={activePet.displayName}
          style={{
            width: settings.width,
            height: settings.height,
            backgroundImage: `url("${sprite.url}")`,
            backgroundSize: `${settings.width * ATLAS_COLUMNS}px ${
              settings.height * ATLAS_ROWS
            }px`,
            backgroundPosition: `-${frame * settings.width}px -${
              definition.row * settings.height
            }px`,
          }}
        />
      ) : (
        <button
          className="empty-pet"
          onClick={() => showSettingsWindow()}
          onContextMenu={(event) => event.preventDefault()}
          aria-label="打开设置"
        >
          <Sparkles size={28} />
          <Settings size={18} />
        </button>
      )}
    </main>
  );
}
