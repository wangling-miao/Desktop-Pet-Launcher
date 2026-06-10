const pet = document.querySelector(".pet-window img");

window.addEventListener("pointermove", (event) => {
  if (!pet) {
    return;
  }
  const x = (event.clientX / window.innerWidth - 0.5) * 14;
  const y = (event.clientY / window.innerHeight - 0.5) * 14;
  pet.style.setProperty("--tilt-x", `${x}px`);
  pet.style.setProperty("--tilt-y", `${y}px`);
});

const starCount = document.querySelector("[data-stars]");

if (starCount) {
  fetch("https://api.github.com/repos/wangling-miao/Desktop-Pet-Launcher")
    .then((response) => (response.ok ? response.json() : null))
    .then((repo) => {
      if (typeof repo?.stargazers_count === "number") {
        starCount.textContent = `★ ${new Intl.NumberFormat("zh-CN").format(repo.stargazers_count)}`;
      }
    })
    .catch(() => {});
}

const galleryGrid = document.querySelector("[data-gallery-grid]");
const galleryStatus = document.querySelector("[data-gallery-status]");
const gallerySearch = document.querySelector("[data-gallery-search]");
const galleryCount = document.querySelector("[data-gallery-count]");
const galleryIndexUrl = "https://wangling-miao.github.io/awesome-desktop-pets/index.json";
const fallbackGalleryIndexUrl = "../gallery-data/index.json";

if (galleryGrid) {
  loadGallery();
}

async function loadGallery() {
  try {
    let index = null;
    let loadedUrl = galleryIndexUrl;
    let usedFallback = false;

    for (const candidateUrl of [galleryIndexUrl, fallbackGalleryIndexUrl]) {
      try {
        const response = await fetch(candidateUrl, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        index = await response.json();
        loadedUrl = candidateUrl;
        usedFallback = candidateUrl === fallbackGalleryIndexUrl;
        break;
      } catch (error) {
        if (candidateUrl === fallbackGalleryIndexUrl) {
          throw error;
        }
      }
    }

    const pets = Array.isArray(index.pets) ? index.pets : [];
    const baseUrl = new URL(".", loadedUrl);

    function render() {
      const query = gallerySearch?.value?.trim().toLowerCase() ?? "";
      const filtered = pets.filter((pet) => {
        const haystack = [pet.name, pet.displayName, pet.author, pet.description, ...(pet.tags ?? [])]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      });

      galleryGrid.innerHTML = filtered.map((pet) => renderPetCard(pet, baseUrl)).join("");
      if (galleryStatus) {
        galleryStatus.textContent =
          filtered.length === 0
            ? "没有匹配的桌宠。"
            : usedFallback
              ? `远端索引未发布，正在显示本地预览数据：${filtered.length}/${pets.length} 个。`
              : `已收录 ${pets.length} 个桌宠，当前显示 ${filtered.length} 个。`;
      }
      if (galleryCount) {
        galleryCount.textContent = String(filtered.length);
      }
    }

    gallerySearch?.addEventListener("input", render);
    galleryGrid.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const button = target.closest("[data-copy-url]");
      if (!button) {
        return;
      }
      const url = button.getAttribute("data-copy-url");
      if (url) {
        copyText(url).then(() => {
          button.textContent = "已复制";
          window.setTimeout(() => {
            button.textContent = "复制导入链接";
          }, 1400);
        });
      }
    });

    render();
  } catch (error) {
    if (galleryStatus) {
      galleryStatus.textContent = "图鉴索引暂时读取失败，可以直接打开 GitHub 仓库查看。";
    }
    console.error("Failed to load gallery", error);
  }
}

function renderPetCard(pet, baseUrl) {
  const preview = absoluteGalleryUrl(pet.preview || pet.previewImage, baseUrl);
  const download = absoluteGalleryUrl(pet.download, baseUrl);
  const tags = (pet.tags ?? []).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("");
  const size = pet.downloadSize ? ` · ${formatBytes(pet.downloadSize)}` : "";

  return `
    <article class="pet-card">
      <div class="pet-card-media">
        <img src="${preview}" alt="${escapeHtml(pet.displayName || pet.name)} 预览" loading="lazy" />
      </div>
      <div class="pet-card-body">
        <div class="pet-card-kicker">
          <span>${escapeHtml(pet.resolution || "1x")}</span>
          <span>${escapeHtml(pet.format || "desktop-pet")}${size}</span>
        </div>
        <h3>${escapeHtml(pet.displayName || pet.name)}</h3>
        <p>${escapeHtml(pet.description || "")}</p>
        <p>作者：${escapeHtml(pet.author || "unknown")} · 授权：${escapeHtml(pet.license || "unknown")}</p>
        <div class="pet-tags">${tags}</div>
        <div class="pet-card-actions">
          <a href="${escapeHtml(download)}">下载</a>
          <button type="button" data-copy-url="${escapeHtml(download)}">复制导入链接</button>
        </div>
      </div>
    </article>
  `;
}

function absoluteGalleryUrl(value, baseUrl) {
  if (!value) {
    return "";
  }
  return new URL(value, baseUrl).href;
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
  document.execCommand("copy");
  input.remove();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatBytes(value) {
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
