import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Eye,
  FolderPlus,
  FolderOpen,
  Lock,
  Maximize2,
  Move,
  PawPrint,
  Play,
  Plus,
  RefreshCw,
  Rocket,
  Save,
  Sparkles,
  Trash2,
  ZoomIn,
} from "lucide-react";
import { BASE_CELL, PET_STATES, type PetPackage, type PetState } from "../lib/petContract";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type AppSettings } from "../lib/settings";
import {
  applyPetWindowSettings,
  choosePetFolder,
  listPetPackages,
  notifyPetSettings,
  readAutostart,
  revealPetFolder,
  writeAutostart,
} from "../lib/tauriApi";

const STATE_LABELS: Record<PetState, string> = {
  idle: "待机",
  "running-right": "向右跑动",
  "running-left": "向左跑动",
  waving: "挥手",
  jumping: "跳跃",
  failed: "失败",
  waiting: "等待输入",
  running: "工作中",
  review: "检查结果",
};

export function SettingsWindow() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [packages, setPackages] = useState<PetPackage[]>([]);
  const [status, setStatus] = useState("已就绪");
  const [newPetFolder, setNewPetFolder] = useState("");

  const activePet = useMemo(
    () => packages.find((candidate) => candidate.id === settings.activePetId) ?? packages[0],
    [packages, settings.activePetId],
  );
  const scalePercent = Math.round((settings.width / BASE_CELL.width) * 100);

  const refreshPackages = useCallback(async (petFolders: string[] = []) => {
    const found = await listPetPackages(petFolders);
    setPackages(found);
    return found;
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      const loadedSettings = await loadSettings();
      const [foundPackages, autostart] = await Promise.all([
        refreshPackages(loadedSettings.petFolders),
        readAutostart(),
      ]);
      if (cancelled) {
        return;
      }
      setSettings({
        ...loadedSettings,
        autostart,
        activePetId: loadedSettings.activePetId ?? foundPackages[0]?.id ?? null,
      });
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, [refreshPackages]);

  async function commit(
    next: AppSettings,
    message = "已保存",
    patch?: Partial<AppSettings>,
  ) {
    setSettings(next);
    await saveSettings(next);
    if (patch && Object.keys(patch).length > 0) {
      await applyPetWindowSettings(patch);
    }
    await notifyPetSettings(next);
    setStatus(message);
  }

  async function update<K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
    message = "已保存",
  ) {
    const next = { ...settings, [key]: value };
    const patchKeys: Array<keyof AppSettings> = [
      "width",
      "height",
      "x",
      "y",
      "alwaysOnTop",
      "clickThrough",
    ];
    await commit(next, message, patchKeys.includes(key) ? { [key]: value } : undefined);
  }

  async function setScale(percent: number) {
    const width = Math.round((BASE_CELL.width * percent) / 100);
    const height = Math.round((BASE_CELL.height * percent) / 100);
    const next = { ...settings, width, height };
    await commit(next, `缩放 ${percent}%`, { width, height });
  }

  async function setSize(width: number, height: number) {
    const next = { ...settings, width, height };
    await commit(next, "尺寸已更新", { width, height });
  }

  async function setPosition(x: number, y: number) {
    const next = { ...settings, x, y };
    await commit(next, "位置已更新", { x, y });
  }

  async function resetPosition() {
    await setPosition(80, 80);
  }

  async function refresh() {
    const found = await refreshPackages(settings.petFolders);
    const activePetId = settings.activePetId ?? found[0]?.id ?? null;
    await commit({ ...settings, activePetId }, "宠物列表已刷新");
  }

  async function addPetFolder(folder = newPetFolder) {
    const trimmed = folder.trim();
    if (!trimmed) {
      setStatus("请输入宠物文件夹路径");
      return;
    }

    const petFolders = Array.from(new Set([...settings.petFolders, trimmed]));
    const found = await refreshPackages(petFolders);
    const activePetId =
      settings.activePetId && found.some((pet) => pet.id === settings.activePetId)
        ? settings.activePetId
        : found[0]?.id ?? null;
    await commit({ ...settings, petFolders, activePetId }, "宠物文件夹已添加");
    setNewPetFolder("");
  }

  async function chooseAndAddPetFolder() {
    const selected = await choosePetFolder();
    if (selected) {
      await addPetFolder(selected);
    }
  }

  async function removePetFolder(folder: string) {
    const petFolders = settings.petFolders.filter((candidate) => candidate !== folder);
    const found = await refreshPackages(petFolders);
    const activePetId =
      settings.activePetId && found.some((pet) => pet.id === settings.activePetId)
        ? settings.activePetId
        : found[0]?.id ?? null;
    await commit({ ...settings, petFolders, activePetId }, "宠物文件夹已移除");
  }

  async function toggleAutostart(enabled: boolean) {
    try {
      await writeAutostart(enabled);
      await commit(
        { ...settings, autostart: enabled },
        enabled ? "开机自启已开启" : "开机自启已关闭",
      );
    } catch (error) {
      console.error("Failed to update autostart", error);
      setStatus("开机自启更新失败，请确认已安装最新版");
    }
  }

  function scrollToPanel(id: string) {
    document.getElementById(id)?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  return (
    <main className="settings-shell">
      <aside className="settings-rail" aria-label="设置导航">
        <div className="brand-mark">
          <PawPrint size={24} />
        </div>
        <button
          className="rail-button is-active"
          type="button"
          onClick={() => scrollToPanel("pet-section")}
          title="宠物"
        >
          <Sparkles size={20} />
        </button>
        <button
          className="rail-button"
          type="button"
          onClick={() => scrollToPanel("size-section")}
          title="尺寸"
        >
          <ZoomIn size={20} />
        </button>
        <button
          className="rail-button"
          type="button"
          onClick={() => scrollToPanel("motion-section")}
          title="动作"
        >
          <Play size={20} />
        </button>
      </aside>

      <section className="settings-main">
        <header className="settings-header">
          <div>
            <p className="eyebrow">Desktop Pet</p>
            <h1>桌宠设置</h1>
          </div>
          <div className="status-pill">
            <Save size={16} />
            {status}
          </div>
        </header>

        <section className="hero-panel" id="size-section">
          <div className="hero-copy">
            <div className="panel-title">
              <ZoomIn size={20} />
              <h2>大小缩放</h2>
            </div>
            <div className="scale-readout">{scalePercent}%</div>
            <p>直接拖动滑杆，桌宠会按原始比例缩放；下方也保留精确宽高。</p>
          </div>
          <div className="scale-controls">
            <input
              aria-label="桌宠缩放"
              className="scale-slider"
              type="range"
              min="50"
              max="500"
              step="5"
              value={scalePercent}
              onChange={(event) => setScale(Number(event.target.value))}
            />
            <div className="scale-presets">
              {[75, 100, 150, 200, 300].map((percent) => (
                <button key={percent} type="button" onClick={() => setScale(percent)}>
                  {percent}%
                </button>
              ))}
            </div>
          </div>
        </section>

        <div className="settings-grid">
          <section className="panel pet-panel" id="pet-section">
            <div className="panel-title">
              <Sparkles size={18} />
              <h2>宠物</h2>
            </div>
            <label className="field">
              <span>当前宠物</span>
              <select
                value={settings.activePetId ?? ""}
                onChange={(event) => update("activePetId", event.target.value, "宠物已切换")}
              >
                {packages.length === 0 ? <option value="">没有找到宠物包</option> : null}
                {packages.map((pet) => (
                  <option key={`${pet.rootDir}-${pet.id}`} value={pet.id}>
                    {pet.displayName}
                  </option>
                ))}
              </select>
            </label>
            {activePet ? (
              <div className="pet-details">
                <strong>{activePet.displayName}</strong>
                <span>{activePet.description}</span>
                <div className="asset-badges">
                  <span>1x</span>
                  {activePet.spritesheets["2x"] ? <span>2x</span> : null}
                  {activePet.spritesheets["4x"] ? <span>4x</span> : null}
                </div>
              </div>
            ) : null}
            <div className="button-row">
              <button onClick={refresh} type="button">
                <RefreshCw size={16} />
                刷新
              </button>
              <button
                onClick={() => activePet && revealPetFolder(activePet.rootDir)}
                type="button"
                disabled={!activePet}
              >
                <FolderOpen size={16} />
                文件夹
              </button>
            </div>
          </section>

          <section className="panel pet-folders-panel">
            <div className="panel-title">
              <FolderPlus size={18} />
              <h2>宠物文件夹</h2>
            </div>
            <div className="folder-picker">
              <label className="field">
                <span>自定义路径</span>
                <input
                  type="text"
                  value={newPetFolder}
                  placeholder="例如 D:\\Pets 或 ~/pets"
                  onChange={(event) => setNewPetFolder(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      void addPetFolder();
                    }
                  }}
                />
              </label>
              <div className="button-row folder-actions">
                <button type="button" onClick={() => addPetFolder()}>
                  <Plus size={16} />
                  添加
                </button>
                <button type="button" onClick={chooseAndAddPetFolder}>
                  <FolderOpen size={16} />
                  选择
                </button>
              </div>
            </div>
            <div className="folder-list">
              {settings.petFolders.length === 0 ? (
                <span className="folder-empty">未添加自定义文件夹</span>
              ) : (
                settings.petFolders.map((folder) => (
                  <div className="folder-item" key={folder}>
                    <span title={folder}>{folder}</span>
                    <button
                      type="button"
                      aria-label={`移除 ${folder}`}
                      onClick={() => removePetFolder(folder)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panel-title">
              <Maximize2 size={18} />
              <h2>精确尺寸</h2>
            </div>
            <ToggleRow
              label="锁定原始比例"
              value={settings.keepAspectRatio}
              onChange={(value) => update("keepAspectRatio", value, "比例锁定已更新")}
            />
            <div className="split-fields">
              <NumberField
                label="宽度"
                value={settings.width}
                min={96}
                max={1200}
                onChange={(value) => {
                  const height = settings.keepAspectRatio
                    ? Math.round((value / BASE_CELL.width) * BASE_CELL.height)
                    : settings.height;
                  setSize(value, height);
                }}
              />
              <NumberField
                label="高度"
                value={settings.height}
                min={104}
                max={1300}
                onChange={(value) => {
                  const width = settings.keepAspectRatio
                    ? Math.round((value / BASE_CELL.height) * BASE_CELL.width)
                    : settings.width;
                  setSize(width, value);
                }}
              />
            </div>
          </section>

          <section className="panel">
            <div className="panel-title">
              <Move size={18} />
              <h2>位置</h2>
            </div>
            <div className="split-fields">
              <NumberField
                label="X"
                value={settings.x ?? 80}
                min={-4000}
                max={4000}
                onChange={(value) => setPosition(value, settings.y ?? 80)}
              />
              <NumberField
                label="Y"
                value={settings.y ?? 80}
                min={-4000}
                max={4000}
                onChange={(value) => setPosition(settings.x ?? 80, value)}
              />
            </div>
            <button className="wide-button" onClick={resetPosition} type="button">
              <Move size={16} />
              回到左上角
            </button>
          </section>

          <section className="panel" id="motion-section">
            <div className="panel-title">
              <Play size={18} />
              <h2>动作</h2>
            </div>
            <label className="field">
              <span>当前动作</span>
              <select
                value={settings.manualState}
                onChange={(event) =>
                  update("manualState", event.target.value as PetState, "动作已切换")
                }
              >
                {PET_STATES.map((state) => (
                  <option key={state} value={state}>
                    {STATE_LABELS[state]}
                  </option>
                ))}
              </select>
            </label>
            <label className="slider-field">
              <span>速度</span>
              <input
                type="range"
                min="0.25"
                max="3"
                step="0.05"
                value={settings.animationSpeed}
                onChange={(event) =>
                  update("animationSpeed", Number(event.target.value), "速度已更新")
                }
              />
              <output>{settings.animationSpeed.toFixed(2)}x</output>
            </label>
            <ToggleRow
              label="待机动作多样化"
              value={settings.idleVariety}
              onChange={(value) => update("idleVariety", value, "待机动作已更新")}
            />
            <ToggleRow
              label="减少动态"
              value={settings.reducedMotion}
              onChange={(value) => update("reducedMotion", value, "动态偏好已更新")}
            />
            <ToggleRow
              label="像素风渲染"
              value={settings.pixelated}
              onChange={(value) => update("pixelated", value, "渲染方式已更新")}
            />
          </section>

          <section className="panel">
            <div className="panel-title">
              <Lock size={18} />
              <h2>行为</h2>
            </div>
            <ToggleRow
              label="桌宠置顶"
              value={settings.alwaysOnTop}
              onChange={(value) => update("alwaysOnTop", value, "置顶已更新")}
            />
            <ToggleRow
              label="允许拖动"
              value={settings.dragEnabled}
              onChange={(value) => update("dragEnabled", value, "拖动已更新")}
            />
            <ToggleRow
              label="锁定桌宠"
              value={settings.locked}
              onChange={(value) => update("locked", value, "锁定已更新")}
            />
            <ToggleRow
              label="鼠标穿透"
              value={settings.clickThrough}
              onChange={(value) => update("clickThrough", value, "鼠标穿透已更新")}
            />
            <ToggleRow
              label="启动时显示"
              value={settings.showOnStartup}
              onChange={(value) => update("showOnStartup", value, "启动显示已更新")}
            />
            <ToggleRow
              label="开机自启"
              value={settings.autostart}
              onChange={toggleAutostart}
              icon={<Rocket size={16} />}
            />
          </section>

          <section className="panel compact-panel">
            <div className="panel-title">
              <Eye size={18} />
              <h2>当前渲染</h2>
            </div>
            <div className="render-facts">
              <span>{settings.width} x {settings.height}</span>
              <span>{STATE_LABELS[settings.manualState]}</span>
              <span>{settings.pixelated ? "像素" : "平滑"}</span>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

interface NumberFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}

function NumberField({ label, value, min, max, onChange }: NumberFieldProps) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

interface ToggleRowProps {
  label: string;
  value: boolean;
  icon?: React.ReactNode;
  onChange: (value: boolean) => void;
}

function ToggleRow({ label, value, icon, onChange }: ToggleRowProps) {
  return (
    <label className="toggle-row">
      <span>
        {icon}
        {label}
      </span>
      <input type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}
