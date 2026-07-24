import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const adminPassword = "node-sqlite-test-password";

function jsonRequest(path, body, headers = {}) {
  return new Request(`http://localhost${path}`, {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    method: "POST",
  });
}

test("production worker persists portal data with the Node SQLite adapter", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "speakup-portal-db-"));
  t.after(() => rm(directory, { force: true, recursive: true }));
  const databasePath = join(directory, "portal.sqlite");
  process.env.PORTAL_ADMIN_PASSWORD = adminPassword;
  process.env.PORTAL_SQLITE_PATH = databasePath;

  const { default: worker } = await import(
    `../dist/server/index.js?node-sqlite-test=${Date.now()}`
  );
  const sessionId = "node-sqlite-test-session";

  const eventResponse = await worker.fetch(jsonRequest("/api/events", {
    attribution: { source: "node-test" },
    eventType: "page_view",
    landingPath: "/",
    sessionId,
  }));
  assert.equal(eventResponse.status, 201);

  const waitlistResponse = await worker.fetch(jsonRequest("/api/waitlist", {
    attribution: { source: "node-test" },
    consent: true,
    contact: "node-test@example.com",
    scenario: "英文面试",
    sessionId,
    urgency: "一个月内",
  }));
  assert.equal(waitlistResponse.status, 201);

  const summaryResponse = await worker.fetch(new Request(
    "http://localhost/api/admin/summary",
    { headers: { "x-portal-admin-password": adminPassword } },
  ));
  assert.equal(summaryResponse.status, 200);
  const summary = await summaryResponse.json();
  assert.equal(summary.funnel.views, 1);
  assert.equal(summary.funnel.submissions, 1);
  assert.equal(summary.recent[0].contact, "node-test@example.com");
  assert.ok((await stat(databasePath)).size > 0);
});
