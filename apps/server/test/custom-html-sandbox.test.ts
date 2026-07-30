import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "node:test";

// Lives in the server suite because that is the only test runner in the repo.
// Move it if the frontends ever grow one.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const IFRAME_FILES = [
  "apps/overlay/src/lib/widgets/CustomHtmlWidget.svelte",
  "apps/dashboard/src/lib/widgets/CustomHtmlSettings.svelte"
];

describe("custom HTML iframe sandbox", () => {
  for (const relativePath of IFRAME_FILES) {
    test(`${relativePath} does not combine allow-scripts with allow-same-origin`, () => {
      const source = fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

      assert.match(source, /sandbox="[^"]*allow-scripts/, "expected a scripted sandbox");
      assert.doesNotMatch(
        source,
        /sandbox="[^"]*allow-same-origin/,
        "allow-scripts + allow-same-origin lets framed content escape its own sandbox"
      );
    });
  }
});
