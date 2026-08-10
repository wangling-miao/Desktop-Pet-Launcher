import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function readProjectVersions(root = process.cwd()) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const tauri = JSON.parse(fs.readFileSync(path.join(root, "src-tauri", "tauri.conf.json"), "utf8"));
  const cargo = fs.readFileSync(path.join(root, "src-tauri", "Cargo.toml"), "utf8");
  const cargoVersion = cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
  if (!cargoVersion) {
    throw new Error("Unable to read Cargo package version");
  }
  return { packageJson: pkg.version, cargoToml: cargoVersion, tauriConfig: tauri.version };
}

export function assertVersionsMatch(versions) {
  const unique = new Set(Object.values(versions));
  if (unique.size !== 1) {
    throw new Error(`Version mismatch: ${JSON.stringify(versions)}`);
  }
  return Object.values(versions)[0];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const versions = readProjectVersions();
  const version = assertVersionsMatch(versions);
  console.log(`Version metadata is consistent: ${version}`);
}
