from pathlib import Path
import json

VERSION = "0.2.12"
OLD_VERSION = "0.2.11"


def replace_if_present(path: Path, old: str, new: str) -> None:
    text = path.read_text(encoding="utf-8")
    if old in text:
        text = text.replace(old, new, 1)
    elif new not in text:
        raise SystemExit(f"Expected release-prep content not found in {path}")
    path.write_text(text, encoding="utf-8")


gallery = Path("website/gallery/index.html")
gallery_note = '''            <p>
              图鉴数据来自 <code>awesome-desktop-pets</code>。投稿合并后会自动生成索引，无需手动维护页面。
            </p>
'''
text = gallery.read_text(encoding="utf-8")
if gallery_note in text:
    gallery.write_text(text.replace(gallery_note, "", 1), encoding="utf-8")

i18n = Path("website/i18n.js")
i18n_note = '''  add(
    "图鉴数据来自 awesome-desktop-pets。投稿合并后会自动生成索引，无需手动维护页面。",
    "图鉴数据来自 awesome-desktop-pets。投稿合并后会自动生成索引，无需手动维护页面。",
    "Gallery data comes from awesome-desktop-pets. Once a contribution is merged, the index is generated automatically without manual page maintenance.",
  );
'''
text = i18n.read_text(encoding="utf-8")
if i18n_note in text:
    i18n.write_text(text.replace(i18n_note, "", 1), encoding="utf-8")

replace_if_present(
    Path("website/index.html"),
    '''                <span class="os-icon os-icon--windows" aria-hidden="true">
                  <i></i><i></i><i></i><i></i>
                </span>''',
    '''                <span class="os-icon os-icon--windows" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M3 4h8v7H3V4Zm10 0h8v7h-8V4ZM3 13h8v7H3v-7Zm10 0h8v7h-8v-7Z" />
                  </svg>
                </span>''',
)

replace_if_present(
    Path("website/landing-download.css"),
    '''.os-icon--windows {
  grid-template-columns: repeat(2, 10px);
  grid-template-rows: repeat(2, 10px);
  gap: 2px;
}

.os-icon--windows i {
  width: 10px;
  height: 10px;
  background: currentColor;
}
''',
    '''.os-icon--windows svg {
  fill: currentColor;
}
''',
)

package = Path("package.json")
data = json.loads(package.read_text(encoding="utf-8"))
data["version"] = VERSION
package.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

package_lock = Path("package-lock.json")
if package_lock.exists():
    data = json.loads(package_lock.read_text(encoding="utf-8"))
    data["version"] = VERSION
    if isinstance(data.get("packages"), dict) and isinstance(data["packages"].get(""), dict):
        data["packages"][""]["version"] = VERSION
    package_lock.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

cargo = Path("src-tauri/Cargo.toml")
replace_if_present(cargo, f'version = "{OLD_VERSION}"', f'version = "{VERSION}"')

cargo_lock = Path("src-tauri/Cargo.lock")
replace_if_present(
    cargo_lock,
    f'name = "desktop-pet-launcher"\nversion = "{OLD_VERSION}"',
    f'name = "desktop-pet-launcher"\nversion = "{VERSION}"',
)

tauri = Path("src-tauri/tauri.conf.json")
data = json.loads(tauri.read_text(encoding="utf-8"))
data["version"] = VERSION
tauri.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

Path(".release-v0.2.12-request").unlink(missing_ok=True)
