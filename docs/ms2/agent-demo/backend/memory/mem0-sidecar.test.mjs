import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";

import { createMem0Server } from "./mem0-sidecar.mjs";

function fakeMemory() {
  const items = new Map();
  let nextID = 1;
  return {
    async add(messages, options) {
      const texts = typeof messages === "string" ? [messages] : messages.map((item) => item.content);
      const results = texts.map((memory) => {
        const item = {
          id: `memory-${nextID++}`,
          memory,
          metadata: { ...(options.metadata || {}), user_id: options.userId },
        };
        items.set(item.id, item);
        return item;
      });
      return { results };
    },
    async search(query, options) {
      return { results: [...items.values()].filter((item) => item.metadata.user_id === options.filters.user_id && item.memory.includes(query)) };
    },
    async getAll(options) {
      return { results: [...items.values()].filter((item) => item.metadata.user_id === options.filters.user_id) };
    },
    async get(id) { return items.get(id) || null; },
    async update(id, update) { items.set(id, { ...items.get(id), memory: update.text }); },
    async delete(id) { items.delete(id); return { message: "deleted" }; },
    async history(id) { return [{ memoryId: id, action: "ADD" }]; },
  };
}

async function withServer(run) {
  const server = createMem0Server(fakeMemory());
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const { port } = server.address();
    await run(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("Mem0 sidecar exposes add, search, CRUD, history, and idempotent import", async () => {
  await withServer(async (baseURL) => {
    let response = await fetch(`${baseURL}/memories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: "demo-user", messages: "橘子", infer: false }),
    });
    let body = await response.json();
    assert.equal(body.results[0].memory, "橘子");

    response = await fetch(`${baseURL}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "橘子", filters: { user_id: "demo-user" }, top_k: 5 }),
    });
    body = await response.json();
    assert.equal(body.results.length, 1);

    const id = body.results[0].id;
    response = await fetch(`${baseURL}/memories/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "用户名叫橘子" }),
    });
    assert.equal((await response.json()).memory, "用户名叫橘子");

    response = await fetch(`${baseURL}/memories/${id}/history`);
    assert.equal((await response.json()).results[0].action, "ADD");

    const migration = { user_id: "demo-user", items: [{ id: "legacy-1", memory: "旧记忆" }] };
    for (let attempt = 0; attempt < 2; attempt++) {
      await fetch(`${baseURL}/imports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(migration),
      });
    }
    response = await fetch(`${baseURL}/memories?user_id=demo-user`);
    body = await response.json();
    assert.equal(body.results.filter((item) => item.memory === "旧记忆").length, 1);

    response = await fetch(`${baseURL}/memories/${id}`, { method: "DELETE" });
    assert.equal(response.status, 200);
  });
});
