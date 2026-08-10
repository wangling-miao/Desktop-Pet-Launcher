import test from "node:test";
import assert from "node:assert/strict";
import { assertVersionsMatch, readProjectVersions } from "../scripts/check-versions.mjs";

test("package, Cargo and Tauri versions stay aligned", () => {
  const versions = readProjectVersions();
  assert.equal(assertVersionsMatch(versions), versions.packageJson);
});

test("version checker rejects mismatches", () => {
  assert.throws(
    () => assertVersionsMatch({ packageJson: "1.0.0", cargoToml: "1.0.1", tauriConfig: "1.0.0" }),
    /Version mismatch/,
  );
});
