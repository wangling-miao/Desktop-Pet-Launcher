(() => {
  "use strict";

  const STORAGE_KEY = "desktop-pet-launcher-language";
  const originalText = new WeakMap();
  const originalAttributes = new WeakMap();

  const staticTranslations = new Map();
  const add = (source, zh, en) => staticTranslations.set(normalize(source), { zh, en });

  // Shared navigation and accessibility.
  add("跳到主要内容", "跳到主要内容", "Skip to main content");
  add("功能", "功能", "Features");
  add("桌宠图鉴", "桌宠图鉴", "Pet Gallery");
  add("兼容性", "兼容性", "Compatibility");
  add("下载", "下载", "Download");
  add("GitHub 仓库", "GitHub 仓库", "GitHub repository");
  add("图鉴仓库", "图鉴仓库", "Gallery repository");
  add("返回首页", "返回首页", "Back to home");
  add("反馈问题", "反馈问题", "Report an issue");

  // Home hero.
  add("开源 · 跨平台 · 本地优先", "开源 · 跨平台 · 本地优先", "Open source · Cross-platform · Local first");
  add("把喜欢的角色，", "把喜欢的角色，", "Keep your favorite character");
  add("留在桌面一角。", "留在桌面一角。", "right on your desktop.");
  add(
    "一个轻量、高清、可自由扩展的桌宠启动器。透明置顶、托盘控制、 自定义宠物包与可选 AI 对话，都装进一个安静的小窗口里。",
    "一个轻量、高清、可自由扩展的桌宠启动器。透明置顶、托盘控制、自定义宠物包与可选 AI 对话，都装进一个安静的小窗口里。",
    "A lightweight, high-resolution and extensible desktop pet launcher. Always-on-top transparency, tray controls, custom pet packages and optional AI chat all live in one quiet little window.",
  );
  add("下载最新版", "下载最新版", "Download latest");
  add("浏览桌宠图鉴", "浏览桌宠图鉴", "Browse pet gallery");
  add("开源项目", "开源项目", "Open source");
  add("当前版本", "当前版本", "Current version");
  add("平台", "平台", "Platforms");
  add("Your companion", "你的桌面伙伴", "Your companion");
  add("Running", "运行中", "Running");
  add("在线", "在线", "Online");
  add("AI 对话 · 可选", "AI 对话 · 可选", "AI chat · Optional");
  add("今天也一起专注吧。", "今天也一起专注吧。", "Let's stay focused together today.");
  add("尺寸", "尺寸", "Size");
  add("置顶", "置顶", "Always on top");
  add("已开启", "已开启", "Enabled");
  add("托盘控制", "托盘控制", "Tray controls");
  add("随时显示 / 隐藏", "随时显示 / 隐藏", "Show / hide anytime");
  add("高清素材", "高清素材", "HiDPI assets");
  add("按屏幕倍率加载", "按屏幕倍率加载", "Loaded for your display scale");
  add("透明无边框", "透明无边框", "Transparent borderless window");
  add("开机自启", "开机自启", "Launch at startup");
  add("本地宠物包", "本地宠物包", "Local pet packages");
  add("Codex 兼容", "Codex 兼容", "Codex compatible");
  add("AI 对话可选", "AI 对话可选", "Optional AI chat");

  // Home features.
  add("Built for companionship", "为陪伴而生", "Built for companionship");
  add("不打扰工作，", "不打扰工作，", "Never gets in your way,");
  add("但一直都在。", "但一直都在。", "but always stays nearby.");
  add(
    "从桌面窗口到宠物包管理，每个细节都围绕“轻量、安静、可控”设计。 默认不联网，不需要账号，也不会把一个可爱桌宠做成复杂的控制中心。",
    "从桌面窗口到宠物包管理，每个细节都围绕“轻量、安静、可控”设计。默认不联网，不需要账号，也不会把一个可爱桌宠做成复杂的控制中心。",
    "From the desktop window to package management, every detail is designed to stay lightweight, quiet and controllable. It does not require an account or network access by default, and it does not turn a cute desktop pet into a complicated control center.",
  );
  add("01 · Desktop native", "01 · 原生桌面体验", "01 · Desktop native");
  add("真正住在桌面上的小伙伴", "真正住在桌面上的小伙伴", "A companion that really lives on your desktop");
  add(
    "透明无边框、跳过任务栏、可置顶，也能从托盘快速锁定、隐藏或退出。",
    "透明无边框、跳过任务栏、可置顶，也能从托盘快速锁定、隐藏或退出。",
    "Transparent and borderless, hidden from the taskbar and optionally always on top, with quick lock, hide and quit controls in the tray.",
  );
  add("02 · Cross platform", "02 · 跨平台", "02 · Cross platform");
  add("三个系统，体验一致", "三个系统，体验一致", "One consistent experience across three systems");
  add(
    "Windows、macOS、Linux 都有原生安装包，配置和宠物包结构保持统一。",
    "Windows、macOS、Linux 都有原生安装包，配置和宠物包结构保持统一。",
    "Native installers are available for Windows, macOS and Linux, with the same settings and pet package format across platforms.",
  );
  add("03 · Your collection", "03 · 你的收藏", "03 · Your collection");
  add("宠物来源不受限", "宠物来源不受限", "Bring pets from anywhere");
  add(
    "扫描 Codex 默认目录，也能添加任意本地文件夹，随时切换自己的角色收藏。",
    "扫描 Codex 默认目录，也能添加任意本地文件夹，随时切换自己的角色收藏。",
    "Scan the default Codex directory or add any local folder and switch between your character collection whenever you like.",
  );
  add("04 · Optional AI", "04 · 可选 AI", "04 · Optional AI");
  add("想聊时再接入模型", "想聊时再接入模型", "Connect a model only when you want to chat");
  add(
    "AI 对话默认关闭。填入 OpenAI 兼容接口后，桌宠才会出现聊天入口。",
    "AI 对话默认关闭。填入 OpenAI 兼容接口后，桌宠才会出现聊天入口。",
    "AI chat is off by default. The chat entry only appears after you provide an OpenAI-compatible endpoint.",
  );
  add("05 · Hi-DPI ready", "05 · 高清就绪", "05 · Hi-DPI ready");
  add("放大也尽量清晰", "放大也尽量清晰", "Stay sharp even when scaled up");
  add(
    "根据窗口尺寸和屏幕倍率自动选择 1×、2× 或 4× 图集。",
    "根据窗口尺寸和屏幕倍率自动选择 1×、2× 或 4× 图集。",
    "Automatically selects the 1×, 2× or 4× atlas based on window size and display scale.",
  );

  // Gallery callout and compatibility.
  add("Pet gallery", "桌宠图鉴", "Pet gallery");
  add("先逛图鉴，", "先逛图鉴，", "Browse the gallery,");
  add("再领一只回桌面。", "再领一只回桌面。", "then bring one home to your desktop.");
  add(
    "浏览社区桌宠、查看分辨率和授权信息，一键下载宠物包， 或复制链接直接导入 Launcher。",
    "浏览社区桌宠、查看分辨率和授权信息，一键下载宠物包，或复制链接直接导入 Launcher。",
    "Browse community pets, review resolution and licensing, download a package with one click, or copy its link straight into the Launcher.",
  );
  add("打开桌宠图鉴", "打开桌宠图鉴", "Open pet gallery");
  add("Codex compatible", "兼容 Codex", "Codex compatible");
  add("旧宠物包继续用，", "旧宠物包继续用，", "Keep using legacy pet packages,");
  add("高清新包也有位置。", "高清新包也有位置。", "while HiDPI packages get room to grow.");
  add(
    "保持对 hatch-pet / Codex 现有格式的兼容，同时支持 2×、4× 高清素材。 你可以直接迁移旧收藏，也可以用 Desktop Pet Skill 制作新角色。",
    "保持对 hatch-pet / Codex 现有格式的兼容，同时支持 2×、4× 高清素材。你可以直接迁移旧收藏，也可以用 Desktop Pet Skill 制作新角色。",
    "Stay compatible with existing hatch-pet / Codex packages while adding 2× and 4× HiDPI assets. Migrate your existing collection directly or create a new character with Desktop Pet Skill.",
  );
  add("打开制作 Skill", "打开制作 Skill", "Open creation Skill");
  add("查看源码", "查看源码", "View source");
  add("规格", "规格", "Scale");
  add("单帧", "单帧", "Frame");
  add("图集", "图集", "Atlas");
  add("1× 兼容", "1× 兼容", "1× compatible");
  add("2× 可选", "2× 可选", "2× optional");
  add("4× 高清", "4× 高清", "4× HiDPI");

  // Downloads.
  add("Download", "下载", "Download");
  add("选好系统，", "选好系统，", "Choose your system,");
  add("让桌面多一位伙伴。", "让桌面多一位伙伴。", "and add one more companion to your desktop.");
  add(
    "安装后从托盘打开设置，即可导入图鉴中的桌宠或本地宠物包。 所有构建都可在 GitHub Releases 中核对与下载。",
    "安装后从托盘打开设置，即可导入图鉴中的桌宠或本地宠物包。所有构建都可在 GitHub Releases 中核对与下载。",
    "After installation, open Settings from the tray to import a gallery pet or a local package. Every build can be verified and downloaded from GitHub Releases.",
  );
  add("推荐", "推荐", "Recommended");
  add(
    "下载 setup.exe 双击安装；企业或静默部署场景可选 MSI。",
    "下载 setup.exe 双击安装；企业或静默部署场景可选 MSI。",
    "Download setup.exe for a normal installation, or choose MSI for managed and silent deployment.",
  );
  add("下载 setup.exe", "下载 setup.exe", "Download setup.exe");
  add("MSI 备用", "MSI 备用", "MSI alternative");
  add("未签名版本可能触发 SmartScreen 提示。", "未签名版本可能触发 SmartScreen 提示。", "Unsigned builds may trigger a SmartScreen warning.");
  add("按芯片选择 DMG，下载后拖入 Applications 文件夹。", "按芯片选择 DMG，下载后拖入 Applications 文件夹。", "Choose the DMG for your chip, then drag the app into Applications.");
  add("未公证构建需在“隐私与安全性”中允许。", "未公证构建需在“隐私与安全性”中允许。", "Unnotarized builds may need to be allowed in Privacy & Security.");
  add(
    "AppImage 适合直接试用，Debian、Fedora 系发行版也有原生包。",
    "AppImage 适合直接试用，Debian、Fedora 系发行版也有原生包。",
    "AppImage is convenient for trying the app directly, with native packages also available for Debian- and Fedora-based distributions.",
  );
  add("下载 AppImage", "下载 AppImage", "Download AppImage");
  add("首次运行 AppImage 前需添加执行权限。", "首次运行 AppImage 前需添加执行权限。", "Make the AppImage executable before the first launch.");
  add("查看全部 Release 文件", "查看全部 Release 文件", "View all release files");
  add("制作自己的桌宠包", "制作自己的桌宠包", "Create your own pet package");
  add("开源高清桌宠启动器。让喜欢的角色，安静住在桌面上。", "开源高清桌宠启动器。让喜欢的角色，安静住在桌面上。", "An open-source HiDPI desktop pet launcher. Keep the characters you love quietly by your side.");

  // Gallery page static copy.
  add("Community pet library", "社区桌宠库", "Community pet library");
  add("找到一只喜欢的，", "找到一只喜欢的，", "Find one you love,");
  add("留在桌面一角。", "留在桌面一角。", "and keep it on your desktop.");
  add(
    "浏览社区制作的桌宠包，按名称、作者、标签和素材倍率筛选。下载压缩包，或复制链接直接交给 Desktop Pet Launcher 导入。",
    "浏览社区制作的桌宠包，按名称、作者、标签和素材倍率筛选。下载压缩包，或复制链接直接交给 Desktop Pet Launcher 导入。",
    "Browse community-made pet packages and filter by name, author, tags or asset scale. Download the archive or copy its link directly into Desktop Pet Launcher.",
  );
  add("浏览全部桌宠", "浏览全部桌宠", "Browse all pets");
  add("投稿自己的桌宠", "投稿自己的桌宠", "Submit your pet");
  add("已收录", "已收录", "Collection");
  add("只桌宠", "只桌宠", "pets");
  add("兼容格式", "兼容格式", "Supported assets");
  add("索引状态", "索引状态", "Index status");
  add("同步中", "同步中", "Syncing");
  add("自动更新", "自动更新", "Auto-updated");
  add("Pet Gallery", "桌宠图鉴", "Pet Gallery");
  add("Live index", "实时索引", "Live index");
  add("社区精选", "社区精选", "Community picks");
  add("正在加载…", "正在加载…", "Loading…");
  add("Launcher ready", "启动器就绪", "Launcher ready");
  add("复制链接即可导入", "复制链接即可导入", "Copy a link to import");
  add("HiDPI assets", "高清素材", "HiDPI assets");
  add("高清素材优先", "高清素材优先", "HiDPI assets preferred");
  add("Browse the collection", "浏览收藏", "Browse the collection");
  add("桌宠收藏库", "桌宠收藏库", "Pet collection");
  add("搜索桌宠", "搜索桌宠", "Search pets");
  add("全部", "全部", "All");
  add("排序", "排序", "Sort");
  add("最近收录", "最近收录", "Newest");
  add("名称 A–Z", "名称 A–Z", "Name A–Z");
  add("文件大小", "文件大小", "File size");
  add("重置", "重置", "Reset");
  add("正在读取社区图鉴索引…", "正在读取社区图鉴索引…", "Loading the community gallery index…");
  add("个结果", "个结果", "results");
  add("打开图鉴仓库", "打开图鉴仓库", "Open gallery repository");
  add("没有找到匹配的桌宠", "没有找到匹配的桌宠", "No matching pets found");
  add("换一个关键词，或者清除倍率筛选后再看看。", "换一个关键词，或者清除倍率筛选后再看看。", "Try another keyword or clear the resolution filter.");
  add("清除筛选", "清除筛选", "Clear filters");
  add("From gallery to desktop", "从图鉴到桌面", "From gallery to desktop");
  add("三步把桌宠带回桌面", "三步把桌宠带回桌面", "Bring a pet to your desktop in three steps");
  add(
    "下载文件适合离线保存；复制导入链接则更快，启动器会直接读取并安装宠物包。",
    "下载文件适合离线保存；复制导入链接则更快，启动器会直接读取并安装宠物包。",
    "Download the archive for offline storage, or copy the import link for a faster path—the launcher can fetch and install the package directly.",
  );
  add("挑选桌宠", "挑选桌宠", "Choose a pet");
  add("使用搜索、标签与倍率快速定位喜欢的角色。", "使用搜索、标签与倍率快速定位喜欢的角色。", "Use search, tags and asset scale to quickly find a character you like.");
  add("下载或复制链接", "下载或复制链接", "Download or copy the link");
  add("保留压缩包，或者一键复制远端导入地址。", "保留压缩包，或者一键复制远端导入地址。", "Keep the archive or copy the remote import URL in one click.");
  add("在启动器中导入", "在启动器中导入", "Import in the launcher");
  add("打开设置页选择宠物包，让它出现在桌面边缘。", "打开设置页选择宠物包，让它出现在桌面边缘。", "Open Settings, choose the package and let it appear at the edge of your desktop.");
  add("Contribute to the collection", "参与社区收藏", "Contribute to the collection");
  add("让你制作的桌宠，也出现在这里。", "让你制作的桌宠，也出现在这里。", "Let the pet you created appear here too.");
  add(
    "在 pets/ 下提交宠物目录。GitHub Actions 会校验清单、预览、授权信息与下载包，合并后自动更新图鉴。",
    "在 pets/ 下提交宠物目录。GitHub Actions 会校验清单、预览、授权信息与下载包，合并后自动更新图鉴。",
    "Submit a pet directory under pets/. GitHub Actions validates the manifest, preview, license information and package, then updates the gallery automatically after merge.",
  );
  add("查看投稿指南", "查看投稿指南", "Read contribution guide");
  add("使用桌宠制作 Skill", "使用桌宠制作 Skill", "Use the pet creation Skill");
  add("动作与尺寸清单", "动作与尺寸清单", "Actions and dimensions");
  add("图鉴展示预览", "图鉴展示预览", "Gallery preview");
  add("说明与授权信息", "说明与授权信息", "Documentation and licensing");
  add("社区桌宠收藏库。下载、导入，也欢迎把自己的作品分享出来。", "社区桌宠收藏库。下载、导入，也欢迎把自己的作品分享出来。", "A community desktop pet collection. Download, import, and share your own creations too.");

  const attributeTranslations = new Map();
  const addAttr = (source, zh, en) => attributeTranslations.set(normalize(source), { zh, en });
  addAttr("主导航", "主导航", "Main navigation");
  addAttr("Desktop Pet Launcher 首页", "Desktop Pet Launcher 首页", "Desktop Pet Launcher home");
  addAttr("页面导航", "页面导航", "Page navigation");
  addAttr("打开导航菜单", "打开导航菜单", "Open navigation menu");
  addAttr("项目状态", "项目状态", "Project status");
  addAttr("Desktop Pet Launcher 产品预览", "Desktop Pet Launcher 产品预览", "Desktop Pet Launcher product preview");
  addAttr("桌宠预览", "桌宠预览", "Desktop pet preview");
  addAttr("核心能力", "核心能力", "Core capabilities");
  addAttr("支持的平台", "支持的平台", "Supported platforms");
  addAttr("宠物包分辨率规格", "宠物包分辨率规格", "Pet package resolution specifications");
  addAttr("系统下载", "系统下载", "Platform downloads");
  addAttr("图鉴状态", "图鉴状态", "Gallery status");
  addAttr("图鉴桌宠预览", "图鉴桌宠预览", "Gallery pet preview");
  addAttr("图鉴筛选工具", "图鉴筛选工具", "Gallery filters");
  addAttr("搜索桌宠", "搜索桌宠", "Search pets");
  addAttr("搜索名称、作者或标签", "搜索名称、作者或标签", "Search name, author, or tag");
  addAttr("按素材倍率筛选", "按素材倍率筛选", "Filter by asset scale");
  addAttr("桌宠排序方式", "桌宠排序方式", "Pet sort order");
  addAttr("投稿内容清单", "投稿内容清单", "Contribution checklist");

  const messages = {
    "gallery.updated": { zh: "{date}更新", en: "Updated {date}" },
    "gallery.synced": { zh: "已同步", en: "Synced" },
    "gallery.statusFallback": {
      zh: "远端索引暂不可用 · 正在显示本地快照{date}",
      en: "Remote index unavailable · Showing local snapshot{date}",
    },
    "gallery.statusSynced": { zh: "社区索引已同步{date}", en: "Community index synced{date}" },
    "gallery.errorTitle": { zh: "图鉴暂时没有加载成功", en: "The gallery could not be loaded" },
    "gallery.errorCopy": {
      zh: "可以稍后刷新页面，或直接前往 GitHub 图鉴仓库浏览。",
      en: "Refresh later or browse the gallery repository directly on GitHub.",
    },
    "gallery.errorStatus": {
      zh: "图鉴索引读取失败 · 可前往 GitHub 仓库查看",
      en: "Gallery index failed to load · View it on GitHub instead",
    },
    "gallery.syncFailed": { zh: "同步失败", en: "Sync failed" },
    "gallery.featured": { zh: "社区精选", en: "Community picks" },
    "gallery.waiting": { zh: "等待新成员", en: "Waiting for new arrivals" },
    "gallery.syncing": { zh: "图鉴正在同步", en: "Gallery is syncing" },
    "gallery.syncingHint": {
      zh: "也可以直接打开 GitHub 图鉴仓库查看桌宠包。",
      en: "You can also open the GitHub gallery repository to browse pet packages.",
    },
    "gallery.nextPet": { zh: "下一只会是谁？", en: "Who will be next?" },
    "gallery.submitHint": { zh: "欢迎把你的桌宠投稿到社区图鉴。", en: "Submit your pet to the community gallery." },
    "gallery.available": { zh: "可用桌宠 {count} 只", en: "{count} pets available" },
    "gallery.previewAlt": { zh: "{name} 预览", en: "Preview of {name}" },
    "gallery.noDescription": { zh: "这个桌宠还没有填写介绍。", en: "This pet does not have a description yet." },
    "gallery.unknownSize": { zh: "大小未知", en: "Unknown size" },
    "gallery.unmarkedLicense": { zh: "未标注授权", en: "License not specified" },
    "gallery.download": { zh: "下载宠物包", en: "Download pet package" },
    "gallery.copy": { zh: "复制链接", en: "Copy link" },
    "gallery.copyAria": { zh: "复制 {name} 的启动器导入链接", en: "Copy launcher import link for {name}" },
    "gallery.copyTitle": { zh: "复制启动器导入链接", en: "Copy launcher import link" },
    "gallery.noDownload": { zh: "暂时没有可用下载", en: "No download available" },
    "gallery.copied": { zh: "已复制", en: "Copied" },
    "gallery.copyFailed": { zh: "复制失败", en: "Copy failed" },
    "gallery.unnamed": { zh: "未命名桌宠", en: "Unnamed pet" },
  };

  const pageMeta = {
    home: {
      zh: {
        title: "Desktop Pet Launcher",
        description: "Desktop Pet Launcher 是一个开源高清桌宠启动器，兼容 Codex / hatch-pet 桌宠包，支持透明置顶、托盘、设置页、自定义宠物文件夹、4x 高清素材和可选 AI 对话。",
        ogTitle: "Desktop Pet Launcher - 把喜欢的角色留在桌面一角",
        ogDescription: "跨平台、开源、支持透明置顶与自定义宠物包的高清桌宠启动器。",
        twitterTitle: "Desktop Pet Launcher - 高清桌宠启动器",
        twitterDescription: "透明置顶、托盘控制、桌宠图鉴、AI 对话可选、Codex / hatch-pet 兼容。",
      },
      en: {
        title: "Desktop Pet Launcher",
        description: "Desktop Pet Launcher is an open-source HiDPI desktop pet launcher compatible with Codex / hatch-pet packages, with transparent always-on-top windows, tray controls, custom pet folders and optional AI chat.",
        ogTitle: "Desktop Pet Launcher - Keep your favorite character on your desktop",
        ogDescription: "A cross-platform, open-source HiDPI desktop pet launcher with transparent always-on-top windows and custom pet packages.",
        twitterTitle: "Desktop Pet Launcher - HiDPI desktop pet launcher",
        twitterDescription: "Transparent always-on-top pets, tray controls, a community gallery, optional AI chat, and Codex / hatch-pet compatibility.",
      },
    },
    gallery: {
      zh: {
        title: "桌宠图鉴 - Desktop Pet Launcher",
        description: "Desktop Pet Launcher 桌宠图鉴，浏览、筛选并下载社区投稿的 Codex / hatch-pet 兼容桌宠包。",
        ogTitle: "桌宠图鉴 - Desktop Pet Launcher",
        ogDescription: "浏览社区桌宠、按名称和清晰度筛选，一键下载或复制启动器导入链接。",
        twitterTitle: "桌宠图鉴 - Desktop Pet Launcher",
        twitterDescription: "浏览、筛选、下载，也可以复制链接直接导入 Desktop Pet Launcher。",
      },
      en: {
        title: "Pet Gallery - Desktop Pet Launcher",
        description: "Browse, filter and download community-made Codex / hatch-pet compatible packages for Desktop Pet Launcher.",
        ogTitle: "Pet Gallery - Desktop Pet Launcher",
        ogDescription: "Browse community pets, filter by name and resolution, then download or copy a launcher import link.",
        twitterTitle: "Pet Gallery - Desktop Pet Launcher",
        twitterDescription: "Browse, filter and download desktop pets, or copy a link directly into Desktop Pet Launcher.",
      },
    },
  };

  function normalize(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function normalizeLanguage(value) {
    return String(value || "").toLowerCase().startsWith("zh") ? "zh" : "en";
  }

  function detectLanguage() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "zh" || saved === "en") {
        return saved;
      }
    } catch {
      // Storage can be disabled; browser language remains a safe fallback.
    }
    return normalizeLanguage(navigator.languages?.[0] || navigator.language || "en");
  }

  let language = detectLanguage();

  function locale() {
    return language === "zh" ? "zh-CN" : "en-US";
  }

  function t(key, variables = {}) {
    const entry = messages[key];
    const template = entry?.[language] ?? entry?.en ?? key;
    return template.replace(/\{(\w+)\}/g, (_, name) => String(variables[name] ?? ""));
  }

  function rememberAttribute(element, name) {
    let attributes = originalAttributes.get(element);
    if (!attributes) {
      attributes = new Map();
      originalAttributes.set(element, attributes);
    }
    if (!attributes.has(name)) {
      attributes.set(name, element.getAttribute(name));
    }
    return attributes.get(name);
  }

  function translateTextNodes() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (!parent || parent.closest("script, style, noscript, code, kbd, [data-i18n-ignore]")) {
        continue;
      }
      if (!originalText.has(node)) {
        originalText.set(node, node.nodeValue || "");
      }
      const source = originalText.get(node) || "";
      const key = normalize(source);
      if (!key) {
        continue;
      }
      const translation = staticTranslations.get(key);
      if (!translation) {
        continue;
      }
      const leading = source.match(/^\s*/)?.[0] || "";
      const trailing = source.match(/\s*$/)?.[0] || "";
      node.nodeValue = `${leading}${translation[language]}${trailing}`;
    }
  }

  function translateAttributes() {
    for (const element of document.querySelectorAll("[aria-label], [placeholder], [title]")) {
      if (element.closest("[data-i18n-ignore]")) {
        continue;
      }
      for (const name of ["aria-label", "placeholder", "title"]) {
        if (!element.hasAttribute(name)) {
          continue;
        }
        const source = rememberAttribute(element, name);
        const translation = attributeTranslations.get(normalize(source));
        if (translation) {
          element.setAttribute(name, translation[language]);
        }
      }
    }
  }

  function updatePageMeta() {
    const page = location.pathname.includes("/gallery") ? "gallery" : "home";
    const meta = pageMeta[page][language];
    document.title = meta.title;
    setMeta('meta[name="description"]', meta.description);
    setMeta('meta[property="og:title"]', meta.ogTitle);
    setMeta('meta[property="og:description"]', meta.ogDescription);
    setMeta('meta[name="twitter:title"]', meta.twitterTitle);
    setMeta('meta[name="twitter:description"]', meta.twitterDescription);
  }

  function setMeta(selector, value) {
    document.querySelector(selector)?.setAttribute("content", value);
  }

  function ensureLanguageSwitcher() {
    const nav = document.querySelector(".site-nav");
    if (!nav || nav.querySelector("[data-language-switcher]")) {
      return;
    }

    const switcher = document.createElement("div");
    switcher.className = "language-switcher";
    switcher.dataset.languageSwitcher = "";
    switcher.dataset.i18nIgnore = "";
    switcher.setAttribute("role", "group");

    for (const [value, label] of [["zh", "中文"], ["en", "EN"]]) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.language = value;
      button.textContent = label;
      button.addEventListener("click", () => setLanguage(value));
      switcher.appendChild(button);
    }

    const github = nav.querySelector(".nav-github");
    const mobileMenu = nav.querySelector(".mobile-menu");
    if (github) {
      github.before(switcher);
    } else if (mobileMenu) {
      mobileMenu.before(switcher);
    } else {
      nav.appendChild(switcher);
    }
  }

  function updateLanguageSwitcher() {
    const switcher = document.querySelector("[data-language-switcher]");
    if (!switcher) {
      return;
    }
    switcher.setAttribute("aria-label", language === "zh" ? "切换语言" : "Switch language");
    switcher.querySelectorAll("[data-language]").forEach((button) => {
      const active = button.dataset.language === language;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
      button.title = active
        ? language === "zh"
          ? "当前语言：中文"
          : "Current language: English"
        : button.dataset.language === "zh"
          ? "切换到中文"
          : "Switch to English";
    });
  }

  function applyLanguage() {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    document.documentElement.dataset.language = language;
    ensureLanguageSwitcher();
    translateTextNodes();
    translateAttributes();
    updatePageMeta();
    updateLanguageSwitcher();
  }

  function setLanguage(nextLanguage) {
    const next = normalizeLanguage(nextLanguage);
    if (next === language) {
      return;
    }
    language = next;
    try {
      localStorage.setItem(STORAGE_KEY, language);
    } catch {
      // Ignore storage failures; the current page still switches immediately.
    }
    applyLanguage();
    document.dispatchEvent(new CustomEvent("dpl:languagechange", { detail: { language } }));
  }

  window.DPLI18N = {
    applyLanguage,
    getLanguage: () => language,
    locale,
    setLanguage,
    t,
  };

  applyLanguage();
})();
