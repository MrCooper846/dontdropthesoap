import assert from "node:assert/strict";
import { statSync } from "node:fs";
import path from "node:path";
export function assertProductionArtifacts(directory: string) {
  for (const file of [
    ".next/BUILD_ID",
    ".next/prerender-manifest.json",
    ".next/routes-manifest.json",
    ".next/required-server-files.json",
    "dist/workers/visual-worker.mjs",
  ]) {
    const info = statSync(path.join(directory, file), {
      throwIfNoEntry: false,
    });
    assert.ok(
      info?.isFile() && info.size > 0,
      "Incomplete production artifact: " +
        file +
        ". Rebuild the rollback package.",
    );
  }
}
