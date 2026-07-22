const galleryGrid = document.querySelector("[data-gallery-grid]");
const galleryStatus = document.querySelector("[data-gallery-status]");
const gallerySearch = document.querySelector("[data-gallery-search]");
const galleryCount = document.querySelector("[data-gallery-count]");
const galleryTotal = document.querySelector("[data-gallery-total]");
const galleryUpdated = document.querySelector("[data-gallery-updated]");
const galleryFeatured = document.querySelector("[data-gallery-featured]");
const galleryEmpty = document.querySelector("[data-gallery-empty]");
const gallerySort = document.querySelector("[data-gallery-sort]");
const galleryFilterButtons = [...document.querySelectorAll("[data-gallery-filter]")];
const galleryFilterCounts = [...document.querySelectorAll("[data-gallery-filter-count]")];
const galleryResetButtons = [...document.querySelectorAll("[data-gallery-reset]")];
const galleryIndexState = galleryStatus?.closest(".gallery-index-state") || null;
const galleryIndexUrl = "https://wangling-miao.github.io/awesome-desktop-pets/index.json";
const fallbackGalleryIndexUrl = "../gallery-data/index.json";
const galleryFallbackImage = "../assets/desktop-pet-launcher-icon.png";

if (galleryGrid) {
  loadGallery();
}

async function loadGallery() {
  try {
    const { index, usedFallback } = await fetchGalleryIndex();
    const pets = Array.isArray(index?.pets) ? index.pets : [];
    const assetBaseUrl = new URL(".", galleryIndexUrl);
    const state = {
      resolution: "all",
      sort: gallerySort?.value || "newest",
    };

    updateGalleryOverview(index, pets, usedFallback, assetBaseUrl);
    installGalleryImageFallback(galleryGrid);
    installGalleryImageFallback(galleryFeatured);

    function render() {
      const query = normalizeSearchText(gallerySearch?.value || "");
      const queryMatches = pets.filter((entry) => matchesGallerySearch(entry, query));
      const filtered = queryMatches
        .filter((entry) => state.resolution === "all" || normalizeResolution(entry.resolution) === state.resolution)
        .sort((left, right) => comparePets(left, right, state.sort));

      updateGalleryFilterCounts(queryMatches);
      updateGalleryFilterButtons(state.resolution);

      galleryGrid.innerHTML = filtered.map((entry) => renderPetCard(entry, assetBaseUrl)).join("");
      galleryGrid.setAttribute("aria-busy", "false");

      if (galleryEmpty) {
        galleryEmpty.hidden = filtered.length !== 0;
      }
      if (galleryCount) {
        galleryCount.textContent = String(filtered.length);
      }

      const hasCustomState = Boolean(query) || state.resolution !== "all" || state.sort !== "newest";
      galleryResetButtons.forEach((button) => {
        button.disabled = !hasCustomState;
      });
    }

    function resetGallery() {
      if (gallerySearch) {
        gallerySearch.value = "";
      }
      state.resolution = "all";
      state.sort = "newest";
      if (gallerySort) {
        gallerySort.value = "newest";
      }
      render();
      gallerySearch?.focus({ preventScroll: true });
    }

    gallerySearch?.addEventListener("input", render);
    gallerySort?.addEventListener("change", () => {
      state.sort = gallerySort.value;
      render();
    });

    galleryFilterButtons.forEach((button) => {
      button.addEventListener("click", () => {
        state.resolution = button.dataset.galleryFilter || "all";
        render();
      });
    });

    galleryResetButtons.forEach((button) => {
      button.addEventListener("click", resetGallery);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        activeElement instanceof HTMLSelectElement ||
        activeElement?.getAttribute("contenteditable") === "true"
      ) {
        return;
      }
      event.preventDefault();
      gallerySearch?.focus();
    });

    galleryGrid.addEventListener("click", handleGalleryCopyClick);
    render();
  } catch (error) {
    galleryGrid.setAttribute("aria-busy", "false");
    galleryGrid.innerHTML = "";
    if (galleryEmpty) {
      galleryEmpty.hidden = false;
      const heading = galleryEmpty.querySelector("h3");
      const copy = galleryEmpty.querySelector("p");
      if (heading) {
        heading.textContent = "图鉴暂时没有加载成功";
      }
      if (copy) {
        copy.textContent = "可以稍后刷新页面，或直接前往 GitHub 图鉴仓库浏览。";
      }
    }
    if (galleryStatus) {
      galleryStatus.textContent = "图鉴索引读取失败 · 可前往 GitHub 仓库查看";
    }
    galleryIndexState?.classList.add("is-error");
    if (galleryUpdated) {
      galleryUpdated.textContent = "同步失败";
    }
    if (galleryFeatured) {
      galleryFeatured.setAttribute("aria-busy", "false");
      galleryFeatured.innerHTML = renderFeaturedGallery([], new URL(".", galleryIndexUrl));
    }
    console.error("Failed to load gallery", error);
  }
}

async function fetchGalleryIndex() {
  for (const candidateUrl of [galleryIndexUrl, fallbackGalleryIndexUrl]) {
    try {
      const response = await fetch(candidateUrl, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return {
        index: await response.json(),
        usedFallback: candidateUrl === fallbackGalleryIndexUrl,
      };
    } catch (error) {
      if (candidateUrl === fallbackGalleryIndexUrl) {
        throw error;
      }
    }
  }
  throw new Error("No gallery index available");
}

function updateGalleryOverview(index, pets, usedFallback, assetBaseUrl) {
  const generatedAt = formatGalleryDate(index?.generatedAt);
  if (galleryTotal) {
    galleryTotal.textContent = String(pets.length);
  }
  if (galleryUpdated) {
    galleryUpdated.textContent = generatedAt ? `${generatedAt}更新` : "已同步";
  }
  if (galleryStatus) {
    galleryStatus.textContent = usedFallback
      ? `远端索引暂不可用 · 正在显示本地快照${generatedAt ? `（${generatedAt}）` : ""}`
      : `社区索引已同步${generatedAt ? ` · ${generatedAt}` : ""}`;
  }
  galleryIndexState?.classList.toggle("is-fallback", usedFallback);
  if (galleryFeatured) {
    galleryFeatured.setAttribute("aria-busy", "false");
    galleryFeatured.innerHTML = renderFeaturedGallery(pets, assetBaseUrl);
  }
}

function updateGalleryFilterCounts(pets) {
  const counts = pets.reduce(
    (result, entry) => {
      const resolution = normalizeResolution(entry.resolution);
      result.all += 1;
      if (Object.hasOwn(result, resolution)) {
        result[resolution] += 1;
      }
      return result;
    },
    { all: 0, "1x": 0, "2x": 0, "4x": 0 },
  );

  galleryFilterCounts.forEach((element) => {
    const key = element.dataset.galleryFilterCount || "all";
    element.textContent = String(counts[key] || 0);
  });
}

function updateGalleryFilterButtons(activeResolution) {
  galleryFilterButtons.forEach((button) => {
    const isActive = button.dataset.galleryFilter === activeResolution;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function matchesGallerySearch(entry, query) {
  if (!query) {
    return true;
  }
  const haystack = [
    entry.name,
    entry.displayName,
    entry.author,
    entry.description,
    entry.version,
    entry.resolution,
    entry.format,
    entry.license,
    ...(Array.isArray(entry.tags) ? entry.tags : []),
  ]
    .filter(Boolean)
    .join(" ");
  return normalizeSearchText(haystack).includes(query);
}

function comparePets(left, right, sort) {
  if (sort === "name") {
    return getPetDisplayName(left).localeCompare(getPetDisplayName(right), "zh-CN", {
      numeric: true,
      sensitivity: "base",
    });
  }
  if (sort === "size") {
    return Number(right.downloadSize || 0) - Number(left.downloadSize || 0);
  }
  const dateDifference = galleryDateValue(right.createdAt) - galleryDateValue(left.createdAt);
  if (dateDifference !== 0) {
    return dateDifference;
  }
  return getPetDisplayName(left).localeCompare(getPetDisplayName(right), "zh-CN", {
    numeric: true,
    sensitivity: "base",
  });
}

function renderFeaturedGallery(pets, baseUrl) {
  const featured = [...pets].sort((left, right) => comparePets(left, right, "newest")).slice(0, 3);
  if (featured.length === 0) {
    return `
      <div class="gallery-showcase__heading">
        <span>社区精选</span>
        <strong>等待新成员</strong>
      </div>
      <div class="gallery-showcase__cards">
        <div class="gallery-featured-more" style="grid-column: 1 / -1; grid-row: 1 / 3">
          <strong>图鉴正在同步</strong>
          <span>也可以直接打开 GitHub 图鉴仓库查看桌宠包。</span>
        </div>
      </div>
    `;
  }

  const cards = featured.map((entry, index) => renderFeaturedPet(entry, baseUrl, index === 0));
  while (cards.length < 3) {
    cards.push(`
      <a class="gallery-featured-more" href="https://github.com/wangling-miao/awesome-desktop-pets/blob/main/CONTRIBUTING.md">
        <strong>下一只会是谁？</strong>
        <span>欢迎把你的桌宠投稿到社区图鉴。</span>
      </a>
    `);
  }

  return `
    <div class="gallery-showcase__heading">
      <span>社区精选</span>
      <strong>${pets.length} pets available</strong>
    </div>
    <div class="gallery-showcase__cards">
      ${cards.join("")}
    </div>
  `;
}

function renderFeaturedPet(entry, baseUrl, primary) {
  const name = getPetDisplayName(entry);
  const preview = absoluteGalleryUrl(entry.previewWebp || entry.previewImage || entry.preview, baseUrl);
  const resolution = normalizeResolution(entry.resolution);
  return `
    <article class="gallery-featured-pet${primary ? " gallery-featured-pet--primary" : ""}">
      <span class="gallery-featured-pet__badge">${escapeHtml(resolution)}</span>
      <div class="gallery-featured-pet__media">
        <img src="${escapeHtml(preview || galleryFallbackImage)}" alt="${escapeHtml(name)} 预览" decoding="async" />
      </div>
      <div class="gallery-featured-pet__copy">
        <strong>${escapeHtml(name)}</strong>
        <span>${escapeHtml(entry.author || "community")} · v${escapeHtml(entry.version || "1.0.0")}</span>
      </div>
    </article>
  `;
}

function renderPetCard(entry, baseUrl) {
  const name = getPetDisplayName(entry);
  const preview = absoluteGalleryUrl(entry.previewWebp || entry.previewImage || entry.preview, baseUrl);
  const download = absoluteGalleryUrl(entry.download, baseUrl);
  const tags = Array.isArray(entry.tags) ? entry.tags.filter(Boolean) : [];
  const visibleTags = tags.slice(0, 4).map((tag) => `<span>${escapeHtml(tag)}</span>`);
  if (tags.length > 4) {
    visibleTags.push(`<span>+${tags.length - 4}</span>`);
  }
  const description = entry.description || "这个桌宠还没有填写介绍。";
  const author = entry.author || "unknown";
  const resolution = normalizeResolution(entry.resolution);
  const version = entry.version || "1.0.0";
  const size = Number(entry.downloadSize) > 0 ? formatBytes(Number(entry.downloadSize)) : "大小未知";
  const format = String(entry.format || "desktop-pet").replaceAll("-", " ");
  const license = entry.license || "未标注授权";
  const shortLicense = license.length > 42 ? `${license.slice(0, 40)}…` : license;

  const actions = download
    ? `
      <a href="${escapeHtml(download)}">
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v10m0 0 4-4m-4 4L6 9M4 16h12" /></svg>
        下载宠物包
      </a>
      <button type="button" data-copy-url="${escapeHtml(download)}" aria-label="复制 ${escapeHtml(name)} 的启动器导入链接" title="复制启动器导入链接">
        <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="7" y="7" width="9" height="9" rx="2" /><path d="M13 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" /></svg>
        <span data-copy-label>复制链接</span>
      </button>
    `
    : `<span class="is-disabled">暂时没有可用下载</span>`;

  return `
    <article class="pet-card">
      <div class="pet-card__media">
        <div class="pet-card__badges">
          <span>${escapeHtml(resolution)}</span>
          <span>v${escapeHtml(version)}</span>
        </div>
        <img
          src="${escapeHtml(preview || galleryFallbackImage)}"
          alt="${escapeHtml(name)} 预览"
          loading="lazy"
          decoding="async"
        />
      </div>
      <div class="pet-card__body">
        <div class="pet-card__identity">
          <div>
            <p class="pet-card__author">by ${escapeHtml(author)}</p>
            <h3>${escapeHtml(name)}</h3>
          </div>
          <span class="pet-card__size">${escapeHtml(size)}</span>
        </div>
        <p class="pet-card__description">${escapeHtml(description)}</p>
        ${visibleTags.length ? `<div class="pet-tags">${visibleTags.join("")}</div>` : ""}
        <div class="pet-card__meta">
          <span><i></i>${escapeHtml(format)}</span>
          <span title="${escapeHtml(license)}"><i></i>${escapeHtml(shortLicense)}</span>
        </div>
        <div class="pet-card__actions">${actions}</div>
      </div>
    </article>
  `;
}

function handleGalleryCopyClick(event) {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }
  const button = target.closest("[data-copy-url]");
  if (!(button instanceof HTMLButtonElement)) {
    return;
  }
  const url = button.dataset.copyUrl;
  if (!url || button.disabled) {
    return;
  }

  const label = button.querySelector("[data-copy-label]");
  const originalLabel = label?.textContent || "复制链接";
  button.disabled = true;

  copyText(url)
    .then(() => {
      button.classList.add("is-copied");
      if (label) {
        label.textContent = "已复制";
      }
      window.setTimeout(() => {
        button.classList.remove("is-copied");
        button.disabled = false;
        if (label) {
          label.textContent = originalLabel;
        }
      }, 1500);
    })
    .catch(() => {
      if (label) {
        label.textContent = "复制失败";
      }
      window.setTimeout(() => {
        button.disabled = false;
        if (label) {
          label.textContent = originalLabel;
        }
      }, 1500);
    });
}

function installGalleryImageFallback(container) {
  container?.addEventListener(
    "error",
    (event) => {
      const image = event.target;
      if (!(image instanceof HTMLImageElement) || image.dataset.fallbackApplied === "true") {
        return;
      }
      image.dataset.fallbackApplied = "true";
      image.classList.add("is-fallback");
      image.src = galleryFallbackImage;
    },
    true,
  );
}

function normalizeSearchText(value) {
  return String(value)
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("zh-CN");
}

function normalizeResolution(value) {
  const resolution = String(value || "1x").trim().toLowerCase();
  if (resolution === "2x" || resolution === "4x") {
    return resolution;
  }
  return "1x";
}

function getPetDisplayName(entry) {
  return String(entry.displayName || entry.name || entry.id || "未命名桌宠");
}

function galleryDateValue(value) {
  const timestamp = Date.parse(value || "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function formatGalleryDate(value) {
  const timestamp = galleryDateValue(value);
  if (!timestamp) {
    return "";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(timestamp));
}

function absoluteGalleryUrl(value, baseUrl) {
  if (!value) {
    return "";
  }
  try {
    const url = new URL(value, baseUrl);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch {
    return "";
  }
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const input = document.createElement("textarea");
  input.value = value;
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  const copied = document.execCommand("copy");
  input.remove();
  if (!copied) {
    throw new Error("Copy command failed");
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatBytes(value) {
  if (!Number.isFinite(value) || value < 0) {
    return "大小未知";
  }
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
