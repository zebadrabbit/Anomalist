import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, describe, test } from "node:test";
import { startTestServer, type TestServer } from "./support.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

// The production-only static handlers are what serve the built SPAs. They were
// written with Express 5 wildcard syntax (/*rest) against Express 4, where it
// only matches paths literally ending in "rest".
process.env.NODE_ENV = "production";

let server: TestServer;
const created: string[] = [];

before(async () => {
  // Minimal stand-ins for the SvelteKit builds the handlers expect.
  for (const app of ["dashboard", "overlay"]) {
    const buildDir = path.join(repoRoot, "apps", app, "build");
    const indexFile = path.join(buildDir, "index.html");
    if (!fs.existsSync(indexFile)) {
      fs.mkdirSync(buildDir, { recursive: true });
      fs.writeFileSync(indexFile, `<html><body>${app}</body></html>`);
      created.push(indexFile);
    }
  }

  server = await startTestServer();
});

after(async () => {
  await server.close();
  for (const file of created) {
    fs.rmSync(file, { force: true });
  }
});

describe("SPA fallback", () => {
  // Real builds may be present, so assert on the fallback working (200 HTML)
  // rather than on marker text only the stand-ins would contain.
  for (const route of ["/", "/some/client/route", "/settings", "/overlay", "/overlay/nested"]) {
    test(`serves an app shell for ${route}`, async () => {
      const response = await fetch(`${server.url}${route}`);

      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type") ?? "", /text\/html/);
    });
  }

  test("does not swallow API routes", async () => {
    const response = await fetch(`${server.url}/api/auth/status`);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { setup: true });
  });
});
