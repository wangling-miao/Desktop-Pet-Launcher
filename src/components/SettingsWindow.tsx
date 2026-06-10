import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Bot,
  Download,
  Eye,
  ExternalLink,
  FolderPlus,
  FolderOpen,
  Globe2,
  KeyRound,
  Lock,
  Maximize2,
  MessageCircle,
  Move,
  PawPrint,
  Play,
  Plus,
  RefreshCw,
  Rocket,
  Save,
  Search,
  Sparkles,
  Trash2,
  ZoomIn,
} from "lucide-react";
import { BASE_CELL, PET_STATES, type PetPackage, type PetState } from "../lib/petContract";
import {
  DEFAULT_GALLERY_INDEX_URL,
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type AppSettings,
} from "../lib/settings";
import {
  APP_LATEST_RELEASE_URL,
  applyPetWindowSettings,
  checkForAppUpdate,
  choosePetFolder,
  importPetFromUrl,
  listPetPackages,
  notifyPetSettings,
  readAutostart,
  revealPetFolder,
  writeAutostart,
  type GalleryIndex,
  type GalleryPet,
  type UpdateCheckResult,
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

type UpdateCheckStatus = "idle" | "checking" | "available" | "latest" | "error";

interface UpdateCheckState {
  status: UpdateCheckStatus;
  currentVersion: string;
  latestVersion: string;
  releaseUrl: string;
  message: string;
}

export function SettingsWindow() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [packages, setPackages] = useState<PetPackage[]>([]);
  const [galleryPets, setGalleryPets] = useState<GalleryPet[]>([]);
  const [gallerySearch, setGallerySearch] = useState("");
  const [galleryUrlDraft, setGalleryUrlDraft] = useState(DEFAULT_GALLERY_INDEX_URL);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [updateCheck, setUpdateCheck] = useState<UpdateCheckState>({
    status: "idle",
    currentVersion: "",
    latestVersion: "",
    releaseUrl: APP_LATEST_RELEASE_URL,
    message: "尚未检查更新",
  });
  const [status, setStatus] = useState("已就绪");
  const [newPetFolder, setNewPetFolder] = useState("");

  const activePet = useMemo(
    () => packages.find((candidate) => candidate.id === settings.activePetId) ?? packages[0],
    [packages, settings.activePetId],
  );
  const scalePercent = Math.round((settings.width / BASE_CELL.width) * 100);
  const filteredGalleryPets = useMemo(() => {
    const query = gallerySearch.trim().toLowerCase();
    if (!query) {
      return galleryPets;
    }
    return galleryPets.filter((pet) =>
      [pet.name, pet.displayName, pet.author, pet.description, ...(pet.tags ?? [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [galleryPets, gallerySearch]);

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
      setGalleryUrlDraft(loadedSettings.galleryIndexUrl);
      void loadGallery(loadedSettings.galleryIndexUrl, false);
      void checkUpdates(false);
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

  async function loadGallery(indexUrl = galleryUrlDraft, persist = true) {
    const trimmed = indexUrl.trim();
    if (!trimmed) {
      setStatus("请输入图鉴索引地址");
      return;
    }

    setGalleryLoading(true);
    try {
      if (persist && trimmed !== settings.galleryIndexUrl) {
        await commit({ ...settings, galleryIndexUrl: trimmed }, "图鉴地址已保存");
      }
      const response = await fetch(trimmed, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const index = (await response.json()) as GalleryIndex;
      setGalleryPets(Array.isArray(index.pets) ? index.pets : []);
      setStatus(`图鉴已读取：${index.pets?.length ?? 0} 个桌宠`);
    } catch (error) {
      console.error("Failed to load gallery", error);
      setStatus("图鉴读取失败，请检查索引地址或网络");
    } finally {
      setGalleryLoading(false);
    }
  }

  async function importGalleryPet(pet: GalleryPet) {
    const downloadUrl = resolveGalleryUrl(pet.download, settings.galleryIndexUrl);
    if (!downloadUrl) {
      setStatus("这个桌宠没有下载地址");
      return;
    }

    try {
      setStatus(`正在导入 ${pet.displayName ?? pet.name}`);
      const imported = await importPetFromUrl(downloadUrl);
      if (!imported) {
        setStatus("当前预览环境不支持导入");
        return;
      }
      const found = await refreshPackages(settings.petFolders);
      const activePetId = found.some((candidate) => candidate.id === imported.id)
        ? imported.id
        : settings.activePetId;
      await commit({ ...settings, activePetId }, `${imported.displayName} 已导入`);
    } catch (error) {
      console.error("Failed to import gallery pet", error);
      setStatus("导入失败，请确认下载链接是 zip 宠物包");
    }
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

  async function checkUpdates(manual = true) {
    setUpdateCheck((current) => ({
      ...current,
      status: "checking",
      message: "正在检查更新...",
    }));

    try {
      const result = await checkForAppUpdate();
      const next = createUpdateCheckState(result);
      setUpdateCheck(next);
      if (manual) {
        setStatus(next.status === "available" ? `发现新版本 ${next.latestVersion}` : "当前已是最新版本");
      }
    } catch (error) {
      console.error("Failed to check updates", error);
      setUpdateCheck((current) => ({
        ...current,
        status: "error",
        message: "检查失败，请稍后再试",
      }));
      if (manual) {
        setStatus("更新检查失败，请检查网络");
      }
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
        <button
          className="rail-button"
          type="button"
          onClick={() => scrollToPanel("chat-section")}
          title="对话"
        >
          <MessageCircle size={20} />
        </button>
        <button
          className="rail-button"
          type="button"
          onClick={() => scrollToPanel("gallery-section")}
          title="图鉴"
        >
          <Globe2 size={20} />
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

          <section className="panel gallery-panel" id="gallery-section">
            <div className="panel-title">
              <Globe2 size={18} />
              <h2>在线图鉴</h2>
            </div>
            <div className="gallery-controls">
              <label className="field">
                <span>索引地址</span>
                <input
                  type="url"
                  value={galleryUrlDraft}
                  placeholder={DEFAULT_GALLERY_INDEX_URL}
                  onChange={(event) => setGalleryUrlDraft(event.target.value)}
                />
              </label>
              <label className="field">
                <span>搜索</span>
                <input
                  type="search"
                  value={gallerySearch}
                  placeholder="名称、作者、标签"
                  onChange={(event) => setGallerySearch(event.target.value)}
                />
              </label>
              <button type="button" onClick={() => loadGallery()} disabled={galleryLoading}>
                <Search size={16} />
                {galleryLoading ? "读取中" : "读取图鉴"}
              </button>
            </div>
            <div className="gallery-list">
              {filteredGalleryPets.length === 0 ? (
                <span className="folder-empty">暂无可显示的桌宠</span>
              ) : (
                filteredGalleryPets.map((pet) => (
                  <article className="gallery-pet-card" key={`${pet.id}-${pet.version}`}>
                    <img
                      src={resolveGalleryUrl(pet.previewImage ?? pet.preview, settings.galleryIndexUrl)}
                      alt=""
                    />
                    <div>
                      <strong>{pet.displayName ?? pet.name}</strong>
                      <span>{pet.description}</span>
                      <small>
                        {pet.author} · {pet.resolution} · {formatBytes(pet.downloadSize)}
                      </small>
                    </div>
                    <button type="button" onClick={() => importGalleryPet(pet)}>
                      <Download size={16} />
                      导入
                    </button>
                  </article>
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

          <section className="panel llm-panel" id="chat-section">
            <div className="panel-title">
              <Bot size={18} />
              <h2>AI 对话</h2>
            </div>
            <ToggleRow
              label="启用桌宠对话"
              value={settings.llmChatEnabled}
              onChange={(value) =>
                update("llmChatEnabled", value, value ? "对话按钮已显示" : "对话已关闭")
              }
            />
            <p className="panel-note">
              开启后，桌宠旁会出现对话按钮。接口按 OpenAI 兼容格式请求，本地模型可以不填 Key。
            </p>
            <label className="field">
              <span>接口地址</span>
              <input
                type="url"
                value={settings.llmEndpoint}
                placeholder="例如 https://api.example.com/v1"
                onChange={(event) => update("llmEndpoint", event.target.value, "接口已保存")}
              />
            </label>
            <div className="split-fields">
              <label className="field">
                <span>模型</span>
                <input
                  type="text"
                  value={settings.llmModel}
                  placeholder="例如 gpt-4.1-mini / qwen-plus"
                  onChange={(event) => update("llmModel", event.target.value, "模型已保存")}
                />
              </label>
              <label className="field">
                <span>
                  <KeyRound size={13} />
                  API Key
                </span>
                <input
                  type="password"
                  value={settings.llmApiKey}
                  placeholder="本地保存"
                  onChange={(event) => update("llmApiKey", event.target.value, "Key 已保存")}
                />
              </label>
            </div>
            <label className="slider-field">
              <span>温度</span>
              <input
                type="range"
                min="0"
                max="2"
                step="0.05"
                value={settings.llmTemperature}
                onChange={(event) =>
                  update("llmTemperature", Number(event.target.value), "温度已更新")
                }
              />
              <output>{settings.llmTemperature.toFixed(2)}</output>
            </label>
            <label className="field">
              <span>桌宠口吻</span>
              <textarea
                rows={4}
                value={settings.llmSystemPrompt}
                onChange={(event) =>
                  update("llmSystemPrompt", event.target.value, "口吻已保存")
                }
              />
            </label>
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

          <section className={`panel update-panel is-${updateCheck.status}`}>
            <div className="panel-title">
              <BadgeCheck size={18} />
              <h2>更新</h2>
            </div>
            <div className="update-card">
              <strong>
                {updateCheck.status === "available"
                  ? `发现新版本 ${updateCheck.latestVersion}`
                  : updateCheck.status === "latest"
                    ? "当前已是最新版本"
                    : updateCheck.status === "checking"
                      ? "正在检查更新"
                      : updateCheck.status === "error"
                        ? "暂时无法检查更新"
                        : "检查更新"}
              </strong>
              <span>{updateCheck.message}</span>
              <small>
                当前版本 {updateCheck.currentVersion || "未知"}
                {updateCheck.latestVersion ? ` · 最新版本 ${updateCheck.latestVersion}` : ""}
              </small>
            </div>
            <div className="button-row">
              <button
                type="button"
                onClick={() => checkUpdates()}
                disabled={updateCheck.status === "checking"}
              >
                <RefreshCw size={16} />
                {updateCheck.status === "checking" ? "检查中" : "检查更新"}
              </button>
              <a
                className="settings-link-button"
                href={updateCheck.releaseUrl}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={16} />
                发布页
              </a>
            </div>
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

function createUpdateCheckState(result: UpdateCheckResult): UpdateCheckState {
  if (result.updateAvailable) {
    return {
      status: "available",
      currentVersion: result.currentVersion,
      latestVersion: result.latestVersion,
      releaseUrl: result.releaseUrl,
      message: "有新版本可用，可到发布页下载。不会自动安装，也不会弹窗打扰。",
    };
  }

  return {
    status: "latest",
    currentVersion: result.currentVersion,
    latestVersion: result.latestVersion,
    releaseUrl: result.releaseUrl,
    message: "当前安装的版本已经是最新版本。",
  };
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

function resolveGalleryUrl(value: string | undefined, indexUrl: string): string {
  if (!value) {
    return "";
  }
  try {
    return new URL(value, new URL(".", indexUrl)).href;
  } catch {
    return value;
  }
}

function formatBytes(value?: number): string {
  if (!value) {
    return "未知大小";
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
