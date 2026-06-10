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
  captureCursorPosition,
  currentWindowWorkArea,
  isTauriRuntime,
  listPetPackages,
  moveCurrentWindowTo,
  notifyPetSettings,
  restoreAutostartPreference,
  sendLlmChat,
  setCurrentWindowClickThrough,
  setCurrentWindowGeometry,
  setCurrentWindowFrame,
  setCurrentWindowSize,
  showSettingsWindow,
  toAssetUrl,
  type ChatMessage,
} from "../lib/tauriApi";
import { usePetAnimation } from "../lib/usePetAnimation";

type ChatPhase = "idle" | "editing" | "thinking" | "answer" | "error";
type ChatSide = "left" | "right";

const CHAT_BUTTON_SIZE = 34;
const CHAT_BUTTON_INSET = 2;
const CHAT_HOTSPOT_PADDING = 14;

interface WindowOffset {
  x: number;
  y: number;
}

interface LogicalRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

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
  const [chatSide, setChatSide] = useState<ChatSide>("right");
  const [petOffsetY, setPetOffsetY] = useState(0);
  const [palette, setPalette] = useState<PetPalette>(DEFAULT_PALETTE);
  const settingsRef = useRef<AppSettings>(DEFAULT_SETTINGS);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const petAnchorRef = useRef<{ x: number; y: number } | null>(null);
  const windowOffsetRef = useRef<WindowOffset>({ x: 0, y: 0 });
  const chatHotspotActiveRef = useRef(false);
  const positionSaveTimerRef = useRef<number | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startScreenX: number;
    startScreenY: number;
    originX: number;
    originY: number;
    windowOffsetX: number;
    windowOffsetY: number;
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
      const autostart = await restoreAutostartPreference(loadedSettings.autostart);
      const foundPackages = await refreshPackages(loadedSettings.petFolders);
      if (cancelled) {
        return;
      }
      const activePetId = loadedSettings.activePetId ?? foundPackages[0]?.id ?? null;
      const nextSettings = { ...loadedSettings, autostart, activePetId };
      setSettings(nextSettings);
      if (
        nextSettings.autostart !== loadedSettings.autostart ||
        nextSettings.activePetId !== loadedSettings.activePetId
      ) {
        await saveSettings(nextSettings);
      }
      await setCurrentWindowGeometry(nextSettings);
      const appliedAnchor = await captureCurrentPetAnchor();
      if (appliedAnchor && hasPositionChanged(nextSettings, appliedAnchor)) {
        const normalizedSettings = { ...nextSettings, ...appliedAnchor };
        settingsRef.current = normalizedSettings;
        setSettings(normalizedSettings);
        await saveSettings(normalizedSettings);
      }
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
  const chatGap = 12;
  const getTargetRenderSize = (expanded: boolean) => ({
    width: settings.width + (expanded ? chatPanelWidth + chatGap : 0),
    height: expanded ? Math.max(settings.height, 330) : settings.height,
  });
  const renderSize = useMemo(
    () => getTargetRenderSize(chatExpanded),
    [chatExpanded, chatGap, chatPanelWidth, settings.height, settings.width],
  );
  const chatInteractiveRects = useMemo(
    () =>
      getChatInteractiveRects({
        chatExpanded,
        chatGap,
        chatPanelWidth,
        chatSide,
        petHeight: settings.height,
        petOffsetY,
        petWidth: settings.width,
        renderHeight: renderSize.height,
      }),
    [
      chatExpanded,
      chatGap,
      chatPanelWidth,
      chatSide,
      petOffsetY,
      renderSize.height,
      settings.height,
      settings.width,
    ],
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
  const spriteFrameTransform = getSpriteFrameTransform(
    visualState,
    frame,
    settings.height,
    settings.reducedMotion,
  );

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
      void closeChat();
      setChatPhase("idle");
      setChatError("");
    }
    // closeChat intentionally reads the latest window position; this effect only responds to the feature toggle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.llmChatEnabled]);

  useEffect(() => {
    if (!ready) {
      return;
    }
    void applyChatWindowFrame(chatOpen, chatSide);
    // Window framing depends on saved settings and chat layout state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatOpen, chatPanelWidth, chatSide, ready, settings.height, settings.width]);

  useEffect(() => {
    if (!ready || !isTauriRuntime()) {
      return;
    }

    let cancelled = false;
    let unlisten: (() => void) | undefined;

    getCurrentWindow()
      .onMoved(() => {
        scheduleCurrentPositionSave();
      })
      .then((nextUnlisten) => {
        if (cancelled) {
          nextUnlisten();
          return;
        }
        unlisten = nextUnlisten;
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      unlisten?.();
      if (positionSaveTimerRef.current !== null) {
        window.clearTimeout(positionSaveTimerRef.current);
        positionSaveTimerRef.current = null;
      }
      void persistCurrentPetPosition();
    };
    // The handlers read current geometry from refs; reattaching for every settings write is unnecessary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(() => {
    let stopped = false;
    let timer = 0;

    async function applyHotspotState(interactive: boolean) {
      if (stopped || chatHotspotActiveRef.current === interactive) {
        return;
      }
      chatHotspotActiveRef.current = interactive;
      await setCurrentWindowClickThrough(!interactive);
    }

    async function updateHotspotState() {
      const interactive = await isCursorInsideChatHotspot(chatInteractiveRects);
      await applyHotspotState(interactive);
    }

    if (!ready || !settings.clickThrough) {
      chatHotspotActiveRef.current = false;
      void setCurrentWindowClickThrough(false);
      return () => {
        stopped = true;
      };
    }

    if (!settings.llmChatEnabled) {
      chatHotspotActiveRef.current = false;
      void setCurrentWindowClickThrough(true);
      return () => {
        stopped = true;
      };
    }

    void updateHotspotState();
    timer = window.setInterval(() => {
      void updateHotspotState();
    }, 90);

    return () => {
      stopped = true;
      if (timer) {
        window.clearInterval(timer);
      }
    };
  }, [chatInteractiveRects, ready, settings.clickThrough, settings.llmChatEnabled]);

  useEffect(() => {
    if (!ready || !settings.llmChatEnabled || chatOpen) {
      return;
    }

    let cancelled = false;
    chooseChatSide()
      .then((side) => {
        if (!cancelled) {
          setChatSide(side);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
    // This keeps the closed chat button on the side with enough room.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatOpen, ready, settings.height, settings.llmChatEnabled, settings.width, settings.x, settings.y]);

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

  async function openChat() {
    const side = await chooseChatSide();
    const position = await captureCurrentWindowPosition();
    const anchor = position
      ? {
          x: position.x + windowOffsetRef.current.x,
          y: position.y + windowOffsetRef.current.y,
        }
      : {
          x: settings.x ?? 80,
          y: settings.y ?? 80,
        };
    petAnchorRef.current = anchor;
    setChatSide(side);
    setChatOpen(true);
    setChatPhase((current) => (current === "idle" ? "editing" : current));
    await applyChatWindowFrame(true, side, anchor);
  }

  async function closeChat() {
    const anchor = await resolvePetAnchor();
    setChatOpen(false);
    petAnchorRef.current = anchor;
    windowOffsetRef.current = { x: 0, y: 0 };
    setPetOffsetY(0);
    await setCurrentWindowFrame(settings.width, settings.height, anchor.x, anchor.y);
  }

  async function chooseChatSide(): Promise<ChatSide> {
    return chooseChatSideForAnchor();
  }

  async function chooseChatSideForAnchor(anchor?: { x: number; y: number }): Promise<ChatSide> {
    const [position, workArea] = await Promise.all([
      captureCurrentWindowPosition(),
      currentWindowWorkArea(),
    ]);

    const x =
      anchor?.x ??
      (position ? position.x + currentChatWindowOffsetX() : settings.x ?? 80);
    if (!workArea) {
      return "right";
    }

    const petWidth = settings.width;
    const required = chatPanelWidth + chatGap;
    const leftSpace = x - workArea.x;
    const rightSpace = workArea.x + workArea.width - (x + petWidth);
    if (rightSpace >= required) {
      return "right";
    }
    if (leftSpace >= required) {
      return "left";
    }
    return rightSpace >= leftSpace ? "right" : "left";
  }

  async function resolvePetAnchor(): Promise<{ x: number; y: number }> {
    if (petAnchorRef.current) {
      return petAnchorRef.current;
    }

    const position = await captureCurrentWindowPosition();
    if (position) {
      return {
        x:
          chatOpen && chatSide === "left"
            ? position.x + chatPanelWidth + chatGap
            : position.x,
        y: position.y + (chatOpen ? windowOffsetRef.current.y : 0),
      };
    }

    return {
      x: settings.x ?? 80,
      y: settings.y ?? 80,
    };
  }

  function currentChatWindowOffsetX(
    expanded = chatOpen,
    side = chatSide,
  ): number {
    return expanded && side === "left" ? chatPanelWidth + chatGap : 0;
  }

  async function calculateChatFrameY(
    petAnchorY: number,
    windowHeight: number,
  ): Promise<{ y: number; offsetLogical: number }> {
    const workArea = await currentWindowWorkArea();
    if (!workArea) {
      return {
        y: petAnchorY,
        offsetLogical: 0,
      };
    }

    const margin = 8;
    const minY = workArea.y + margin;
    const maxY = workArea.y + workArea.height - windowHeight - margin;
    const y = Math.max(minY, Math.min(petAnchorY, Math.max(minY, maxY)));
    const offsetLogical = Math.max(0, petAnchorY - y);

    return {
      y,
      offsetLogical,
    };
  }

  async function applyChatWindowFrame(
    expanded: boolean,
    side: ChatSide,
    anchor = petAnchorRef.current,
  ) {
    if (!expanded) {
      windowOffsetRef.current = { x: 0, y: 0 };
      setPetOffsetY(0);
      if (!anchor) {
        await setCurrentWindowSize(settings.width, settings.height);
        return;
      }
      await setCurrentWindowFrame(settings.width, settings.height, anchor.x, anchor.y);
      return;
    }

    const petAnchor = anchor ?? (await resolvePetAnchor());
    const targetRenderSize = getTargetRenderSize(expanded);
    const yFrame = await calculateChatFrameY(petAnchor.y, targetRenderSize.height);
    const offsetX = currentChatWindowOffsetX(expanded, side);
    petAnchorRef.current = petAnchor;
    windowOffsetRef.current = {
      x: offsetX,
      y: yFrame.offsetLogical,
    };
    setPetOffsetY(yFrame.offsetLogical);
    const x = petAnchor.x - offsetX;
    await setCurrentWindowFrame(targetRenderSize.width, targetRenderSize.height, x, yFrame.y);
  }

  function scheduleCurrentPositionSave(delay = 240) {
    if (positionSaveTimerRef.current !== null) {
      window.clearTimeout(positionSaveTimerRef.current);
    }
    positionSaveTimerRef.current = window.setTimeout(() => {
      positionSaveTimerRef.current = null;
      void persistCurrentPetPosition();
    }, delay);
  }

  async function captureCurrentPetAnchor(): Promise<{ x: number; y: number } | null> {
    const position = await captureCurrentWindowPosition();
    if (!position) {
      return null;
    }

    return {
      x: Math.round(position.x + windowOffsetRef.current.x),
      y: Math.round(position.y + windowOffsetRef.current.y),
    };
  }

  async function persistCurrentPetPosition() {
    const petAnchor = await captureCurrentPetAnchor();
    if (!petAnchor) {
      return;
    }

    const current = settingsRef.current;
    if (!hasPositionChanged(current, petAnchor)) {
      return;
    }

    const next = { ...current, ...petAnchor };
    petAnchorRef.current = petAnchor;
    settingsRef.current = next;
    setSettings(next);
    await saveSettings(next);
    await notifyPetSettings(next);
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
    const position = await captureCurrentWindowPosition();
    const windowOffsetX = currentChatWindowOffsetX();
    const windowOffsetY = chatOpen ? windowOffsetRef.current.y : 0;
    dragRef.current = {
      pointerId: event.pointerId,
      startScreenX: event.screenX,
      startScreenY: event.screenY,
      originX: (position?.x ?? settings.x ?? 80) + windowOffsetX,
      originY: (position?.y ?? settings.y ?? 80) + windowOffsetY,
      windowOffsetX,
      windowOffsetY,
      moved: false,
      lastDirection: null,
    };
  }

  async function handlePointerMove(event: PointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    const dx = event.screenX - drag.startScreenX;
    const dy = event.screenY - drag.startScreenY;
    if (Math.abs(dx) + Math.abs(dy) < 4) {
      return;
    }
    drag.moved = true;
    const direction = dx < 0 ? "running-left" : "running-right";
    if (direction !== drag.lastDirection) {
      drag.lastDirection = direction;
      setDragState(direction);
    }
    const petAnchor = {
      x: drag.originX + dx,
      y: drag.originY + dy,
    };
    petAnchorRef.current = petAnchor;
    await moveCurrentWindowTo(petAnchor.x - drag.windowOffsetX, petAnchor.y - drag.windowOffsetY);
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
    const petAnchor = {
      x: position.x + drag.windowOffsetX,
      y: position.y + drag.windowOffsetY,
    };
    petAnchorRef.current = petAnchor;
    const next = { ...settings, ...petAnchor };
    setSettings(next);
    await saveSettings(next);
    await notifyPetSettings(next);
    if (chatOpen) {
      const side = await chooseChatSideForAnchor(petAnchor);
      setChatSide(side);
      await applyChatWindowFrame(true, side, petAnchor);
    }
    window.setTimeout(() => setDragState(null), 900);
  }

  if (!ready) {
    return <div className="pet-shell pet-loading" />;
  }

  const shellStyle = {
    width: renderSize.width,
    height: renderSize.height,
    "--pet-offset-y": `${petOffsetY}px`,
    "--pet-accent": palette.accent,
    "--pet-bubble": palette.bubble,
    "--pet-bubble-ink": palette.ink,
  } as CSSProperties;

  return (
    <main
      className={`pet-shell ${chatExpanded ? "has-chat" : ""} chat-${chatSide}`}
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
              transform: spriteFrameTransform,
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
                void closeChat();
              } else {
                void openChat();
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
            <button type="button" onClick={() => closeChat()} aria-label="关闭对话">
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

function hasPositionChanged(
  settings: Pick<AppSettings, "x" | "y">,
  position: { x: number; y: number },
): boolean {
  return Math.round(settings.x ?? Number.NaN) !== position.x || Math.round(settings.y ?? Number.NaN) !== position.y;
}

function getSpriteFrameTransform(
  state: PetState,
  frame: number,
  height: number,
  reducedMotion: boolean,
): string | undefined {
  if (reducedMotion || state !== "jumping") {
    return undefined;
  }

  const jumpArc = [0, -0.08, -0.16, -0.1, 0];
  const offset = Math.round(height * (jumpArc[frame] ?? 0));
  return `translateY(${offset}px)`;
}

function getChatInteractiveRects({
  chatExpanded,
  chatGap,
  chatPanelWidth,
  chatSide,
  petHeight,
  petOffsetY,
  petWidth,
  renderHeight,
}: {
  chatExpanded: boolean;
  chatGap: number;
  chatPanelWidth: number;
  chatSide: ChatSide;
  petHeight: number;
  petOffsetY: number;
  petWidth: number;
  renderHeight: number;
}): LogicalRect[] {
  const stageX = chatExpanded && chatSide === "left" ? chatPanelWidth + chatGap : 0;
  const buttonX =
    stageX +
    (chatSide === "left"
      ? CHAT_BUTTON_INSET
      : petWidth - CHAT_BUTTON_SIZE - CHAT_BUTTON_INSET);
  const buttonY = petOffsetY + petHeight - CHAT_BUTTON_SIZE - CHAT_BUTTON_INSET;
  const rects = [
    padRect(
      {
        x: buttonX,
        y: buttonY,
        width: CHAT_BUTTON_SIZE,
        height: CHAT_BUTTON_SIZE,
      },
      CHAT_HOTSPOT_PADDING,
    ),
  ];

  if (chatExpanded) {
    rects.push({
      x: chatSide === "left" ? 0 : petWidth + chatGap,
      y: 0,
      width: chatPanelWidth,
      height: renderHeight,
    });
  }

  return rects;
}

async function isCursorInsideChatHotspot(rects: LogicalRect[]): Promise<boolean> {
  const [cursor, windowPosition] = await Promise.all([
    captureCursorPosition(),
    captureCurrentWindowPosition(),
  ]);
  if (!cursor || !windowPosition) {
    return false;
  }

  return rects.some((rect) => {
    const left = windowPosition.x + rect.x;
    const top = windowPosition.y + rect.y;
    const right = left + rect.width;
    const bottom = top + rect.height;
    return cursor.x >= left && cursor.x <= right && cursor.y >= top && cursor.y <= bottom;
  });
}

function padRect(rect: LogicalRect, padding: number): LogicalRect {
  return {
    x: rect.x - padding,
    y: rect.y - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
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
