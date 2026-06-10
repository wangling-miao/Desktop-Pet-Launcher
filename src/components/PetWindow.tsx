import {
  type CSSProperties,
  PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Loader2, MessageCircle, Send, Settings, Sparkles, X } from "lucide-react";
import {
  ATLAS_COLUMNS,
  ATLAS_ROWS,
  STATE_DEFINITIONS,
  pickSpriteSource,
  type PetPackage,
  type PetState,
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
  sendLlmChat,
  setCurrentWindowGeometry,
  setCurrentWindowSize,
  showSettingsWindow,
  toAssetUrl,
  type ChatMessage,
} from "../lib/tauriApi";
import { usePetAnimation } from "../lib/usePetAnimation";

type ChatPhase = "idle" | "editing" | "thinking" | "answer" | "error";

interface PetPalette {
  accent: string;
  bubble: string;
  ink: string;
}

const DEFAULT_PALETTE: PetPalette = {
  accent: "#5da996",
  bubble: "#eef7f1",
  ink: "#171615",
};

export function PetWindow() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [packages, setPackages] = useState<PetPackage[]>([]);
  const [ready, setReady] = useState(false);
  const [dragState, setDragState] = useState<"running-left" | "running-right" | null>(null);
  const [idleVariant, setIdleVariant] = useState<AppSettings["manualState"]>("idle");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatDraft, setChatDraft] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatPhase, setChatPhase] = useState<ChatPhase>("idle");
  const [chatError, setChatError] = useState("");
  const [palette, setPalette] = useState<PetPalette>(DEFAULT_PALETTE);
  const settingsRef = useRef<AppSettings>(DEFAULT_SETTINGS);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
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

  const chatExpanded = settings.llmChatEnabled && chatOpen;
  const chatPanelWidth = Math.min(360, Math.max(280, Math.round(settings.width * 0.9)));
  const renderSize = useMemo(
    () => ({
      width: settings.width + (chatExpanded ? chatPanelWidth + 12 : 0),
      height: chatExpanded ? Math.max(settings.height, 330) : settings.height,
    }),
    [chatExpanded, chatPanelWidth, settings.height, settings.width],
  );
  const conversationState = useMemo(
    () =>
      settings.llmChatEnabled && chatOpen
        ? pickConversationState(chatPhase, chatDraft, chatMessages)
        : null,
    [chatDraft, chatMessages, chatOpen, chatPhase, settings.llmChatEnabled],
  );
  const visualState =
    dragState ?? conversationState ?? (settings.manualState === "idle" ? idleVariant : settings.manualState);
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

  useEffect(() => {
    if (!settings.llmChatEnabled) {
      setChatOpen(false);
      setChatPhase("idle");
      setChatError("");
    }
  }, [settings.llmChatEnabled]);

  useEffect(() => {
    if (!ready) {
      return;
    }
    void setCurrentWindowSize(renderSize.width, renderSize.height);
  }, [ready, renderSize.height, renderSize.width]);

  useEffect(() => {
    chatScrollRef.current?.scrollTo({
      top: chatScrollRef.current.scrollHeight,
      behavior: settings.reducedMotion ? "auto" : "smooth",
    });
  }, [chatMessages, chatPhase, settings.reducedMotion]);

  useEffect(() => {
    if (!sprite || !activePet) {
      setPalette(DEFAULT_PALETTE);
      return;
    }

    let cancelled = false;
    extractPetPalette(sprite.url, activePet.cellSize.width * sprite.scale, activePet.cellSize.height * sprite.scale)
      .then((next) => {
        if (!cancelled) {
          setPalette(next);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPalette(DEFAULT_PALETTE);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activePet, sprite]);

  async function handleSendMessage() {
    const content = chatDraft.trim();
    if (!content || chatPhase === "thinking") {
      return;
    }

    if (!settings.llmEndpoint.trim() || !settings.llmModel.trim()) {
      setChatError("请先在设置里填写接口地址和模型名称。");
      setChatPhase("error");
      return;
    }

    const nextMessages: ChatMessage[] = [
      ...chatMessages.slice(-11),
      { role: "user", content },
    ];
    setChatMessages(nextMessages);
    setChatDraft("");
    setChatError("");
    setChatPhase("thinking");

    try {
      const response = await sendLlmChat({
        endpoint: settings.llmEndpoint,
        apiKey: settings.llmApiKey,
        model: settings.llmModel,
        systemPrompt: settings.llmSystemPrompt,
        temperature: settings.llmTemperature,
        messages: nextMessages,
      });
      setChatMessages([...nextMessages, { role: "assistant", content: response.content }]);
      setChatPhase("answer");
    } catch (error) {
      console.error("Failed to send chat message", error);
      setChatError(error instanceof Error ? error.message : String(error));
      setChatPhase("error");
    }
  }

  function openChat() {
    setChatOpen(true);
    setChatPhase((current) => (current === "idle" ? "editing" : current));
  }

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

  const shellStyle = {
    width: renderSize.width,
    height: renderSize.height,
    "--pet-accent": palette.accent,
    "--pet-bubble": palette.bubble,
    "--pet-bubble-ink": palette.ink,
  } as CSSProperties;

  return (
    <main
      className={`pet-shell ${chatExpanded ? "has-chat" : ""}`}
      style={shellStyle}
      onContextMenu={(event) => event.preventDefault()}
    >
      <section
        className="pet-stage"
        style={{ width: settings.width, height: settings.height }}
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

        {settings.llmChatEnabled ? (
          <button
            className={`pet-chat-toggle ${chatOpen ? "is-open" : ""}`}
            type="button"
            aria-label={chatOpen ? "关闭对话" : "打开对话"}
            title={chatOpen ? "关闭对话" : "打开对话"}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              if (chatOpen) {
                setChatOpen(false);
              } else {
                openChat();
              }
            }}
          >
            <MessageCircle size={18} />
          </button>
        ) : null}
      </section>

      {chatExpanded ? (
        <section
          className="pet-chat-bubble"
          style={{ width: chatPanelWidth }}
          aria-label="桌宠对话"
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <header className="pet-chat-header">
            <span>{activePet?.displayName ?? "桌宠"} 正在听</span>
            <button type="button" onClick={() => setChatOpen(false)} aria-label="关闭对话">
              <X size={15} />
            </button>
          </header>

          <div className="pet-chat-messages" ref={chatScrollRef}>
            {chatMessages.length === 0 ? (
              <div className="pet-chat-empty">
                和我说句话吧。我会根据聊天内容切换待机、工作、检查结果、挥手或跳跃动作。
              </div>
            ) : (
              chatMessages.map((message, index) => (
                <div
                  className={`pet-chat-message ${
                    message.role === "user" ? "is-user" : "is-assistant"
                  }`}
                  key={`${message.role}-${index}`}
                >
                  {message.content}
                </div>
              ))
            )}
            {chatPhase === "thinking" ? (
              <div className="pet-chat-message is-assistant">思考中...</div>
            ) : null}
            {chatError ? <div className="pet-chat-error">{chatError}</div> : null}
          </div>

          {!settings.llmEndpoint.trim() || !settings.llmModel.trim() ? (
            <button className="pet-chat-config-button" type="button" onClick={() => showSettingsWindow()}>
              去设置接口
            </button>
          ) : (
            <form
              className="pet-chat-form"
              onSubmit={(event) => {
                event.preventDefault();
                void handleSendMessage();
              }}
            >
              <textarea
                value={chatDraft}
                placeholder="输入后回车发送"
                onFocus={() => setChatPhase("editing")}
                onChange={(event) => {
                  setChatDraft(event.target.value);
                  setChatPhase("editing");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void handleSendMessage();
                  }
                }}
              />
              <button type="submit" disabled={!chatDraft.trim() || chatPhase === "thinking"}>
                {chatPhase === "thinking" ? <Loader2 size={16} /> : <Send size={16} />}
              </button>
            </form>
          )}
        </section>
      ) : null}
    </main>
  );
}

function pickConversationState(
  phase: ChatPhase,
  draft: string,
  messages: ChatMessage[],
): PetState | null {
  if (phase === "thinking") {
    return "running";
  }
  if (phase === "error") {
    return "failed";
  }
  if (draft.trim() || phase === "editing") {
    return "waiting";
  }

  const last = messages[messages.length - 1];
  if (!last) {
    return "waving";
  }
  if (last.role === "user") {
    return "waiting";
  }
  return inferStateFromText(last.content);
}

function inferStateFromText(text: string): PetState {
  const lower = text.toLowerCase();
  if (/向左|左边|左侧|left/.test(lower)) {
    return "running-left";
  }
  if (/向右|右边|右侧|right/.test(lower)) {
    return "running-right";
  }
  if (/失败|错误|抱歉|无法|不能|不行|sorry|error|failed/.test(lower)) {
    return "failed";
  }
  if (/你好|嗨|早上好|晚上好|hello|hi/.test(lower)) {
    return "waving";
  }
  if (/开心|好耶|太棒|成功|喜欢|哈哈|当然|没问题|great|nice|happy/.test(lower)) {
    return "jumping";
  }
  if (/检查|结果|分析|总结|看看|确认|review|check|result/.test(lower)) {
    return "review";
  }
  return "review";
}

interface RgbColor {
  r: number;
  g: number;
  b: number;
}

function extractPetPalette(url: string, cellWidth: number, cellHeight: number): Promise<PetPalette> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 48;
        canvas.height = 52;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) {
          reject(new Error("Canvas is unavailable"));
          return;
        }
        context.drawImage(image, 0, 0, cellWidth, cellHeight, 0, 0, canvas.width, canvas.height);
        const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
        let red = 0;
        let green = 0;
        let blue = 0;
        let total = 0;

        for (let index = 0; index < data.length; index += 4) {
          const alpha = data[index + 3];
          if (alpha < 44) {
            continue;
          }

          const r = data[index];
          const g = data[index + 1];
          const b = data[index + 2];
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const saturation = max - min;
          const brightness = (r + g + b) / 3;
          if (brightness > 236 && saturation < 28) {
            continue;
          }

          const weight = (alpha / 255) * (1 + saturation / 180);
          red += r * weight;
          green += g * weight;
          blue += b * weight;
          total += weight;
        }

        if (total <= 0) {
          resolve(DEFAULT_PALETTE);
          return;
        }

        resolve(
          createPalette({
            r: Math.round(red / total),
            g: Math.round(green / total),
            b: Math.round(blue / total),
          }),
        );
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => reject(new Error("Failed to load pet sprite"));
    image.src = url;
  });
}

function createPalette(accent: RgbColor): PetPalette {
  const bubble = blend(accent, { r: 255, g: 253, b: 247 }, 0.78);
  return {
    accent: toRgb(accent),
    bubble: toRgb(bubble),
    ink: relativeLuminance(bubble) > 0.58 ? "#171615" : "#fffaf2",
  };
}

function blend(foreground: RgbColor, background: RgbColor, backgroundAmount: number): RgbColor {
  const foregroundAmount = 1 - backgroundAmount;
  return {
    r: Math.round(foreground.r * foregroundAmount + background.r * backgroundAmount),
    g: Math.round(foreground.g * foregroundAmount + background.g * backgroundAmount),
    b: Math.round(foreground.b * foregroundAmount + background.b * backgroundAmount),
  };
}

function toRgb(color: RgbColor): string {
  return `rgb(${color.r}, ${color.g}, ${color.b})`;
}

function relativeLuminance(color: RgbColor): number {
  const [r, g, b] = [color.r, color.g, color.b].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
